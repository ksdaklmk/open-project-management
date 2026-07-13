-- Atomic, filter-safe task moves. The server validates visible neighbour IDs
-- against the complete target column and serializes concurrent insertions into
-- each workspace/status ordering.

-- Normalize historical ordering first so every column starts with wide,
-- deterministic gaps and no duplicate positions.
with ranked as (
  select id, row_number() over (
    partition by workspace_id, status order by position, id
  ) * 1024.0 as next_position
  from tasks
)
update tasks set position = ranked.next_position
from ranked where ranked.id = tasks.id;

create or replace function move_task(
  p_task_id uuid,
  p_to_status task_status,
  p_before_task_id uuid default null,
  p_after_task_id uuid default null
)
returns tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  moved tasks%rowtype;
  changed tasks%rowtype;
  ordered_ids uuid[];
  before_index integer;
  before_position double precision;
  after_position double precision;
  next_position double precision;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into moved from tasks where id = p_task_id for update;
  if moved.id is null or not is_member(moved.workspace_id) then
    raise exception 'task not found' using errcode = '42501';
  end if;
  if p_before_task_id = p_task_id
     or p_after_task_id = p_task_id
     or (p_before_task_id is not null and p_before_task_id = p_after_task_id) then
    raise exception 'stale task ordering; refresh and retry' using errcode = '40001';
  end if;

  -- Serialize moves into this complete target column. hashtextextended gives a
  -- stable bigint lock key without requiring a persistent lock table.
  perform pg_advisory_xact_lock(
    hashtextextended(moved.workspace_id::text || ':' || p_to_status::text, 0)
  );

  -- Lock submitted neighbours, then validate tenancy/status through the full
  -- ordered ID list. Missing/foreign/wrong-status IDs all become the same
  -- retryable stale-order response.
  perform 1 from tasks
  where id in (p_before_task_id, p_after_task_id)
  order by id for update;

  select coalesce(array_agg(id order by position, id), '{}'::uuid[])
  into ordered_ids
  from tasks
  where workspace_id = moved.workspace_id
    and status = p_to_status
    and id <> p_task_id;

  if p_before_task_id is null and p_after_task_id is null then
    if cardinality(ordered_ids) <> 0 then
      raise exception 'stale task ordering; refresh and retry' using errcode = '40001';
    end if;
  elsif p_before_task_id is null then
    if cardinality(ordered_ids) = 0 or ordered_ids[1] <> p_after_task_id then
      raise exception 'stale task ordering; refresh and retry' using errcode = '40001';
    end if;
  elsif p_after_task_id is null then
    if cardinality(ordered_ids) = 0
       or ordered_ids[cardinality(ordered_ids)] <> p_before_task_id then
      raise exception 'stale task ordering; refresh and retry' using errcode = '40001';
    end if;
  else
    before_index := array_position(ordered_ids, p_before_task_id);
    if before_index is null
       or before_index >= cardinality(ordered_ids)
       or ordered_ids[before_index + 1] <> p_after_task_id then
      raise exception 'stale task ordering; refresh and retry' using errcode = '40001';
    end if;
  end if;

  if p_before_task_id is not null then
    select position into before_position from tasks where id = p_before_task_id;
  end if;
  if p_after_task_id is not null then
    select position into after_position from tasks where id = p_after_task_id;
  end if;

  -- Rebalance the complete target column when repeated fractional insertion
  -- has exhausted the gap, then reload neighbour positions.
  if before_position is not null and after_position is not null
     and after_position - before_position < 0.000001 then
    with ranked as (
      select id, row_number() over (order by position, id) * 1024.0 as next_position
      from tasks
      where workspace_id = moved.workspace_id
        and status = p_to_status
        and id <> p_task_id
    )
    update tasks set position = ranked.next_position
    from ranked where ranked.id = tasks.id;
    select position into before_position from tasks where id = p_before_task_id;
    select position into after_position from tasks where id = p_after_task_id;
  end if;

  next_position := case
    when before_position is null and after_position is null then 1024.0
    when before_position is null then after_position - 1024.0
    when after_position is null then before_position + 1024.0
    else (before_position + after_position) / 2.0
  end;

  update tasks
  set status = p_to_status, position = next_position
  where id = p_task_id
  returning * into changed;
  return changed;
end;
$$;

revoke execute on function move_task(uuid, task_status, uuid, uuid) from public;
grant execute on function move_task(uuid, task_status, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

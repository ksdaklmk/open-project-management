-- Phase 2: permission-aware, batched bulk task operations with safe undo.
--
-- Each apply call is one database transaction and accepts at most 100 tasks.
-- Clients may reuse an operation id across sequential batches. Successful
-- batches remain independently committed if a later batch fails, and every
-- reversible change records the exact before/after state for conflict-safe
-- undo. Permanent delete deliberately records no task snapshot.

alter table tasks add column archived_at timestamptz;

create index tasks_workspace_active_status_position_id_idx
  on tasks (workspace_id, status, position, id)
  where archived_at is null;

create table task_bulk_operations (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  action jsonb not null,
  requested_count integer not null default 0 check (requested_count >= 0),
  changed_count integer not null default 0 check (changed_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  created_at timestamptz not null default now(),
  undoable_until timestamptz,
  undone_at timestamptz
);

create table task_bulk_operation_items (
  operation_id uuid not null references task_bulk_operations(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  before_state jsonb not null,
  after_state jsonb not null,
  after_updated_at timestamptz not null,
  primary key (operation_id, task_id)
);

alter table task_bulk_operations enable row level security;
alter table task_bulk_operation_items enable row level security;

create policy task_bulk_operation_read on task_bulk_operations for select
  using (actor_id = auth.uid() and is_member(workspace_id));
create policy task_bulk_operation_item_read on task_bulk_operation_items for select
  using (exists (
    select 1 from task_bulk_operations operation
    where operation.id = operation_id
      and operation.actor_id = auth.uid()
      and is_member(operation.workspace_id)
  ));

grant select on task_bulk_operations, task_bulk_operation_items to authenticated;

-- Strictly validate and normalize the small action language shared by
-- preflight and apply. Taxonomy values remain constants, not database tables.
create or replace function normalize_bulk_task_action(
  p_workspace_id uuid,
  p_action jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  action_kind text;
  action_value text;
  target_id uuid;
begin
  if auth.uid() is null or not is_member(p_workspace_id) then
    raise exception 'not authorised for this workspace' using errcode = '42501';
  end if;
  if p_action is null or jsonb_typeof(p_action) <> 'object' then
    raise exception 'bulk action must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_action) key
    where key not in ('kind', 'value')
  ) then
    raise exception 'bulk action contains unsupported fields' using errcode = '22023';
  end if;

  action_kind := p_action->>'kind';
  if action_kind not in (
    'status', 'priority', 'assignee', 'start_date', 'end_date', 'clear_dates',
    'tag_add', 'tag_remove', 'project', 'archive', 'delete'
  ) then
    raise exception 'unsupported bulk action' using errcode = '22023';
  end if;

  if action_kind in ('clear_dates', 'archive', 'delete') then
    if p_action ? 'value' then
      raise exception 'this bulk action does not accept a value' using errcode = '22023';
    end if;
    return jsonb_build_object('kind', action_kind);
  end if;

  if not (p_action ? 'value') then
    raise exception 'bulk action value is required' using errcode = '22023';
  end if;

  if action_kind = 'status' then
    if jsonb_typeof(p_action->'value') <> 'string' then
      raise exception 'status must be a string' using errcode = '22023';
    end if;
    action_value := p_action->>'value';
    perform action_value::task_status;
  elsif action_kind = 'priority' then
    if jsonb_typeof(p_action->'value') <> 'string' then
      raise exception 'priority must be a string' using errcode = '22023';
    end if;
    action_value := p_action->>'value';
    perform action_value::task_priority;
  elsif action_kind = 'assignee' then
    if jsonb_typeof(p_action->'value') = 'null' then
      return jsonb_build_object('kind', action_kind, 'value', null);
    end if;
    if jsonb_typeof(p_action->'value') <> 'string' then
      raise exception 'assignee must be a user id or null' using errcode = '22023';
    end if;
    target_id := (p_action->>'value')::uuid;
    if not exists (
      select 1 from workspace_members member
      where member.workspace_id = p_workspace_id and member.user_id = target_id
    ) then
      raise exception 'assignee must be a workspace member' using errcode = '22023';
    end if;
    return jsonb_build_object('kind', action_kind, 'value', target_id);
  elsif action_kind in ('start_date', 'end_date') then
    if jsonb_typeof(p_action->'value') = 'null' then
      return jsonb_build_object('kind', action_kind, 'value', null);
    end if;
    if jsonb_typeof(p_action->'value') <> 'string' then
      raise exception 'date must be an ISO date or null' using errcode = '22023';
    end if;
    action_value := (p_action->>'value')::date::text;
    if action_value::date not between date '1900-01-01' and date '2199-12-31' then
      raise exception 'date is outside the supported range' using errcode = '22023';
    end if;
  elsif action_kind in ('tag_add', 'tag_remove') then
    if jsonb_typeof(p_action->'value') <> 'string'
       or not (p_action->>'value' = any(array['Frontend','Backend','API','Design','Mobile'])) then
      raise exception 'unsupported task tag' using errcode = '22023';
    end if;
    action_value := p_action->>'value';
  elsif action_kind = 'project' then
    if jsonb_typeof(p_action->'value') <> 'string' then
      raise exception 'project must be an id' using errcode = '22023';
    end if;
    target_id := (p_action->>'value')::uuid;
    if not exists (
      select 1 from projects project
      where project.id = target_id
        and project.workspace_id = p_workspace_id
        and project.archived_at is null
    ) then
      raise exception 'target project is unavailable' using errcode = '22023';
    end if;
    return jsonb_build_object('kind', action_kind, 'value', target_id);
  end if;

  return jsonb_build_object('kind', action_kind, 'value', action_value);
exception
  when invalid_text_representation or datetime_field_overflow then
    raise exception 'bulk action value is invalid' using errcode = '22023';
end;
$$;

create or replace function preflight_bulk_task_action(
  p_workspace_id uuid,
  p_task_ids uuid[],
  p_action jsonb
)
returns table (
  requested_count integer,
  will_change_count integer,
  unchanged_count integer,
  skipped_count integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  normalized jsonb;
  action_kind text;
  action_value text;
  target record;
  found_count integer := 0;
  changes integer := 0;
  unchanged integer := 0;
  skipped integer := 0;
  target_date date;
begin
  if p_task_ids is null or cardinality(p_task_ids) < 1 or cardinality(p_task_ids) > 500 then
    raise exception 'select between 1 and 500 tasks' using errcode = '22023';
  end if;
  if (select count(*) from unnest(p_task_ids) id) <>
     (select count(distinct id) from unnest(p_task_ids) id) then
    raise exception 'task selection contains duplicates' using errcode = '22023';
  end if;

  normalized := normalize_bulk_task_action(p_workspace_id, p_action);
  action_kind := normalized->>'kind';
  action_value := normalized->>'value';
  if action_kind in ('start_date', 'end_date') and jsonb_typeof(normalized->'value') <> 'null' then
    target_date := action_value::date;
  end if;

  for target in
    select task.*,
      coalesce((select array_agg(tag.tag order by tag.tag)
                from task_tags tag where tag.task_id = task.id), '{}'::text[]) as tags
    from tasks task
    join projects project on project.id = task.project_id and project.archived_at is null
    where task.workspace_id = p_workspace_id
      and task.id = any(p_task_ids)
      and task.archived_at is null
    order by task.id
  loop
    found_count := found_count + 1;
    if action_kind = 'status' and target.status::text = action_value then
      unchanged := unchanged + 1;
    elsif action_kind = 'priority' and target.priority::text = action_value then
      unchanged := unchanged + 1;
    elsif action_kind = 'assignee' and target.assignee_id is not distinct from
          (case when jsonb_typeof(normalized->'value') = 'null' then null
                else action_value::uuid end) then
      unchanged := unchanged + 1;
    elsif action_kind = 'start_date' and target.start_date is not distinct from target_date then
      unchanged := unchanged + 1;
    elsif action_kind = 'start_date' and target_date is not null
          and target.end_date is not null and target_date > target.end_date then
      skipped := skipped + 1;
    elsif action_kind = 'end_date' and target.end_date is not distinct from target_date then
      unchanged := unchanged + 1;
    elsif action_kind = 'end_date' and target_date is not null
          and target.start_date is not null and target.start_date > target_date then
      skipped := skipped + 1;
    elsif action_kind = 'clear_dates' and target.start_date is null and target.end_date is null then
      unchanged := unchanged + 1;
    elsif action_kind = 'tag_add' and action_value = any(target.tags) then
      unchanged := unchanged + 1;
    elsif action_kind = 'tag_remove' and not (action_value = any(target.tags)) then
      unchanged := unchanged + 1;
    elsif action_kind = 'project' and target.project_id = action_value::uuid then
      unchanged := unchanged + 1;
    elsif action_kind = 'project' and exists (
      select 1 from tasks conflict
      where conflict.project_id = action_value::uuid
        and conflict.ref = target.ref and conflict.id <> target.id
    ) then
      skipped := skipped + 1;
    else
      changes := changes + 1;
    end if;
  end loop;

  return query select cardinality(p_task_ids), changes, unchanged,
    skipped + cardinality(p_task_ids) - found_count;
end;
$$;

create or replace function apply_bulk_task_action(
  p_operation_id uuid,
  p_workspace_id uuid,
  p_task_ids uuid[],
  p_action jsonb
)
returns table (
  operation_id uuid,
  requested_count integer,
  changed_count integer,
  unchanged_count integer,
  skipped_count integer,
  undoable_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  normalized jsonb;
  action_kind text;
  action_value text;
  existing task_bulk_operations%rowtype;
  target record;
  before_state jsonb;
  after_state jsonb;
  before_tags text[];
  after_tags text[];
  target_date date;
  target_assignee uuid;
  batch_changed integer := 0;
  batch_unchanged integer := 0;
  batch_skipped integer := 0;
  found_count integer := 0;
  changed_at timestamptz;
  archive_time timestamptz := clock_timestamp();
  next_position double precision;
begin
  if p_operation_id is null then
    raise exception 'operation id is required' using errcode = '22023';
  end if;
  if p_task_ids is null or cardinality(p_task_ids) < 1 or cardinality(p_task_ids) > 100 then
    raise exception 'each bulk batch must contain between 1 and 100 tasks' using errcode = '22023';
  end if;
  if (select count(*) from unnest(p_task_ids) id) <>
     (select count(distinct id) from unnest(p_task_ids) id) then
    raise exception 'task batch contains duplicates' using errcode = '22023';
  end if;

  normalized := normalize_bulk_task_action(p_workspace_id, p_action);
  action_kind := normalized->>'kind';
  action_value := normalized->>'value';
  if action_kind in ('start_date', 'end_date') and jsonb_typeof(normalized->'value') <> 'null' then
    target_date := action_value::date;
  end if;
  if action_kind = 'assignee' and jsonb_typeof(normalized->'value') <> 'null' then
    target_assignee := action_value::uuid;
  end if;

  select * into existing from task_bulk_operations operation
  where operation.id = p_operation_id for update;
  if existing.id is null then
    insert into task_bulk_operations (
      id, workspace_id, actor_id, action, undoable_until
    ) values (
      p_operation_id, p_workspace_id, caller, normalized,
      case when action_kind = 'delete' then null else now() + interval '5 minutes' end
    ) returning * into existing;
  elsif existing.actor_id <> caller or existing.workspace_id <> p_workspace_id
        or existing.action <> normalized then
    raise exception 'operation id belongs to a different bulk action' using errcode = '42501';
  elsif existing.undone_at is not null then
    raise exception 'bulk operation was already undone' using errcode = '22023';
  elsif existing.undoable_until is not null and existing.undoable_until <= now() then
    raise exception 'bulk operation has expired' using errcode = '22023';
  end if;

  for target in
    select task.*,
      coalesce((select array_agg(tag.tag order by tag.tag)
                from task_tags tag where tag.task_id = task.id), '{}'::text[]) as tags
    from tasks task
    join projects project on project.id = task.project_id and project.archived_at is null
    where task.workspace_id = p_workspace_id
      and task.id = any(p_task_ids)
      and task.archived_at is null
    order by task.id
    for update of task
  loop
    found_count := found_count + 1;
    before_tags := target.tags;
    before_state := null;
    after_state := null;

    if action_kind = 'status' then
      if target.status::text = action_value then
        batch_unchanged := batch_unchanged + 1; continue;
      end if;
      select coalesce(max(task.position), 0) + 1024 into next_position
      from tasks task where task.workspace_id = p_workspace_id
        and task.status = action_value::task_status and task.archived_at is null;
      before_state := jsonb_build_object('status', target.status, 'position', target.position);
      update tasks set status = action_value::task_status, position = next_position
      where id = target.id returning updated_at into changed_at;
      after_state := jsonb_build_object('status', action_value, 'position', next_position);
    elsif action_kind = 'priority' then
      if target.priority::text = action_value then
        batch_unchanged := batch_unchanged + 1; continue;
      end if;
      before_state := jsonb_build_object('priority', target.priority);
      update tasks set priority = action_value::task_priority where id = target.id
      returning updated_at into changed_at;
      after_state := jsonb_build_object('priority', action_value);
    elsif action_kind = 'assignee' then
      if target.assignee_id is not distinct from target_assignee then
        batch_unchanged := batch_unchanged + 1; continue;
      end if;
      before_state := jsonb_build_object('assignee_id', target.assignee_id);
      update tasks set assignee_id = target_assignee where id = target.id
      returning updated_at into changed_at;
      after_state := jsonb_build_object('assignee_id', target_assignee);
    elsif action_kind = 'start_date' then
      if target.start_date is not distinct from target_date then
        batch_unchanged := batch_unchanged + 1; continue;
      elsif target_date is not null and target.end_date is not null
            and target_date > target.end_date then
        batch_skipped := batch_skipped + 1; continue;
      end if;
      before_state := jsonb_build_object('start_date', target.start_date);
      update tasks set start_date = target_date where id = target.id
      returning updated_at into changed_at;
      after_state := jsonb_build_object('start_date', target_date);
    elsif action_kind = 'end_date' then
      if target.end_date is not distinct from target_date then
        batch_unchanged := batch_unchanged + 1; continue;
      elsif target_date is not null and target.start_date is not null
            and target.start_date > target_date then
        batch_skipped := batch_skipped + 1; continue;
      end if;
      before_state := jsonb_build_object('end_date', target.end_date);
      update tasks set end_date = target_date where id = target.id
      returning updated_at into changed_at;
      after_state := jsonb_build_object('end_date', target_date);
    elsif action_kind = 'clear_dates' then
      if target.start_date is null and target.end_date is null then
        batch_unchanged := batch_unchanged + 1; continue;
      end if;
      before_state := jsonb_build_object(
        'start_date', target.start_date, 'end_date', target.end_date
      );
      update tasks set start_date = null, end_date = null where id = target.id
      returning updated_at into changed_at;
      after_state := jsonb_build_object('start_date', null, 'end_date', null);
    elsif action_kind in ('tag_add', 'tag_remove') then
      if action_kind = 'tag_add' and action_value = any(before_tags) then
        batch_unchanged := batch_unchanged + 1; continue;
      elsif action_kind = 'tag_remove' and not (action_value = any(before_tags)) then
        batch_unchanged := batch_unchanged + 1; continue;
      end if;
      before_state := jsonb_build_object('tags', before_tags);
      if action_kind = 'tag_add' then
        insert into task_tags (task_id, tag) values (target.id, action_value);
      else
        delete from task_tags where task_id = target.id and tag = action_value;
      end if;
      select coalesce(array_agg(tag.tag order by tag.tag), '{}'::text[]) into after_tags
      from task_tags tag where tag.task_id = target.id;
      update tasks set updated_at = clock_timestamp() where id = target.id
      returning updated_at into changed_at;
      after_state := jsonb_build_object('tags', after_tags);
    elsif action_kind = 'project' then
      if target.project_id = action_value::uuid then
        batch_unchanged := batch_unchanged + 1; continue;
      elsif exists (
        select 1 from tasks conflict
        where conflict.project_id = action_value::uuid
          and conflict.ref = target.ref and conflict.id <> target.id
      ) then
        batch_skipped := batch_skipped + 1; continue;
      end if;
      before_state := jsonb_build_object('project_id', target.project_id);
      update tasks set project_id = action_value::uuid where id = target.id
      returning updated_at into changed_at;
      after_state := jsonb_build_object('project_id', action_value::uuid);
    elsif action_kind = 'archive' then
      before_state := jsonb_build_object('archived_at', target.archived_at);
      update tasks set archived_at = archive_time where id = target.id
      returning updated_at into changed_at;
      after_state := jsonb_build_object('archived_at', archive_time);
    elsif action_kind = 'delete' then
      delete from tasks where id = target.id;
      batch_changed := batch_changed + 1;
      continue;
    end if;

    insert into task_bulk_operation_items (
      operation_id, task_id, before_state, after_state, after_updated_at
    ) values (
      p_operation_id, target.id, before_state, after_state, changed_at
    );
    batch_changed := batch_changed + 1;
  end loop;

  batch_skipped := batch_skipped + cardinality(p_task_ids) - found_count;
  update task_bulk_operations operation set
    requested_count = operation.requested_count + cardinality(p_task_ids),
    changed_count = operation.changed_count + batch_changed,
    unchanged_count = operation.unchanged_count + batch_unchanged,
    skipped_count = operation.skipped_count + batch_skipped
  where operation.id = p_operation_id
  returning operation.undoable_until into existing.undoable_until;

  return query select p_operation_id, cardinality(p_task_ids), batch_changed,
    batch_unchanged, batch_skipped, existing.undoable_until;
end;
$$;

create or replace function undo_bulk_task_action(p_operation_id uuid)
returns table (restored_count integer, conflict_count integer, missing_count integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  operation task_bulk_operations%rowtype;
  item record;
  target tasks%rowtype;
  current_tags text[];
  expected_tags text[];
  prior_tags text[];
  restored integer := 0;
  conflicts integer := 0;
  missing integer := 0;
  action_kind text;
begin
  select * into operation from task_bulk_operations bulk_operation
  where bulk_operation.id = p_operation_id for update;
  if operation.id is null or operation.actor_id <> caller
     or not is_member(operation.workspace_id) then
    raise exception 'bulk operation is unavailable' using errcode = '42501';
  end if;
  if operation.undoable_until is null then
    raise exception 'this bulk action cannot be undone' using errcode = '22023';
  end if;
  if operation.undone_at is not null then
    raise exception 'bulk operation was already undone' using errcode = '22023';
  end if;
  if operation.undoable_until <= now() then
    raise exception 'undo window has expired' using errcode = '22023';
  end if;
  action_kind := operation.action->>'kind';

  for item in
    select history.* from task_bulk_operation_items history
    where history.operation_id = p_operation_id order by history.task_id
  loop
    select * into target from tasks task where task.id = item.task_id for update;
    if target.id is null then
      missing := missing + 1; continue;
    end if;
    if action_kind in ('tag_add', 'tag_remove') then
      select coalesce(array_agg(tag.tag order by tag.tag), '{}'::text[]) into current_tags
      from task_tags tag where tag.task_id = target.id;
      select coalesce(array_agg(value order by value), '{}'::text[]) into expected_tags
      from jsonb_array_elements_text(item.after_state->'tags') value;
      if current_tags <> expected_tags then
        conflicts := conflicts + 1; continue;
      end if;
      delete from task_tags where task_id = target.id;
      select coalesce(array_agg(value order by value), '{}'::text[]) into prior_tags
      from jsonb_array_elements_text(item.before_state->'tags') value;
      insert into task_tags (task_id, tag)
      select target.id, tag from unnest(prior_tags) tag;
      update tasks set updated_at = clock_timestamp() where id = target.id;
    elsif action_kind = 'status' then
      if target.status::text <> item.after_state->>'status'
         or target.position <> (item.after_state->>'position')::double precision then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set
        status = (item.before_state->>'status')::task_status,
        position = (item.before_state->>'position')::double precision
      where id = target.id;
    elsif action_kind = 'priority' then
      if target.priority::text <> item.after_state->>'priority' then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set priority = (item.before_state->>'priority')::task_priority
      where id = target.id;
    elsif action_kind = 'assignee' then
      if target.assignee_id is distinct from (case
        when jsonb_typeof(item.after_state->'assignee_id') = 'null' then null
        else (item.after_state->>'assignee_id')::uuid end) then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set assignee_id = case
        when jsonb_typeof(item.before_state->'assignee_id') = 'null' then null
        else (item.before_state->>'assignee_id')::uuid end
      where id = target.id;
    elsif action_kind = 'start_date' then
      if target.start_date is distinct from (case
        when jsonb_typeof(item.after_state->'start_date') = 'null' then null
        else (item.after_state->>'start_date')::date end) then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set start_date = case
        when jsonb_typeof(item.before_state->'start_date') = 'null' then null
        else (item.before_state->>'start_date')::date end
      where id = target.id;
    elsif action_kind = 'end_date' then
      if target.end_date is distinct from (case
        when jsonb_typeof(item.after_state->'end_date') = 'null' then null
        else (item.after_state->>'end_date')::date end) then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set end_date = case
        when jsonb_typeof(item.before_state->'end_date') = 'null' then null
        else (item.before_state->>'end_date')::date end
      where id = target.id;
    elsif action_kind = 'clear_dates' then
      if target.start_date is not null or target.end_date is not null then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set
        start_date = case when jsonb_typeof(item.before_state->'start_date') = 'null'
          then null else (item.before_state->>'start_date')::date end,
        end_date = case when jsonb_typeof(item.before_state->'end_date') = 'null'
          then null else (item.before_state->>'end_date')::date end
      where id = target.id;
    elsif action_kind = 'project' then
      if target.project_id <> (item.after_state->>'project_id')::uuid then
        conflicts := conflicts + 1; continue;
      end if;
      if exists (
        select 1 from tasks conflict
        where conflict.project_id = (item.before_state->>'project_id')::uuid
          and conflict.ref = target.ref and conflict.id <> target.id
      ) then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set project_id = (item.before_state->>'project_id')::uuid
      where id = target.id;
    elsif action_kind = 'archive' then
      if target.archived_at is distinct from (case
        when jsonb_typeof(item.after_state->'archived_at') = 'null' then null
        else (item.after_state->>'archived_at')::timestamptz end) then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set archived_at = case
        when jsonb_typeof(item.before_state->'archived_at') = 'null' then null
        else (item.before_state->>'archived_at')::timestamptz end
      where id = target.id;
    end if;
    restored := restored + 1;
  end loop;

  update task_bulk_operations set undone_at = now() where id = p_operation_id;
  return query select restored, conflicts, missing;
end;
$$;

revoke execute on function normalize_bulk_task_action(uuid, jsonb) from public;
revoke execute on function preflight_bulk_task_action(uuid, uuid[], jsonb) from public;
revoke execute on function apply_bulk_task_action(uuid, uuid, uuid[], jsonb) from public;
revoke execute on function undo_bulk_task_action(uuid) from public;

grant execute on function preflight_bulk_task_action(uuid, uuid[], jsonb) to authenticated;
grant execute on function apply_bulk_task_action(uuid, uuid, uuid[], jsonb) to authenticated;
grant execute on function undo_bulk_task_action(uuid) to authenticated;

-- Archived tasks (and tasks in archived projects) leave every active-work
-- query. Keep query_tasks' public return contract unchanged by selecting the
-- task columns explicitly now that the base table has an archive column.
create or replace function query_tasks(
  p_workspace_id uuid,
  p_status task_status[] default null,
  p_priority task_priority[] default null,
  p_assignee uuid[] default null,
  p_include_unassigned boolean default false,
  p_type task_type[] default null,
  p_tags text[] default null,
  p_search text default null,
  p_sort text default 'position',
  p_cursor_sort text default null,
  p_cursor_id uuid default null,
  p_window_start date default null,
  p_window_end date default null,
  p_schedule text default 'any',
  p_limit integer default 100
)
returns table (
  id uuid, project_id uuid, workspace_id uuid, ref text, type task_type,
  title text, description text, status task_status, priority task_priority,
  assignee_id uuid, start_date date, end_date date, points integer,
  "position" double precision, created_by uuid, created_at timestamptz,
  updated_at timestamptz, tags text[], sort_value text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with candidates as (
    select
      task.id, task.project_id, task.workspace_id, task.ref, task.type,
      task.title, task.description, task.status, task.priority, task.assignee_id,
      task.start_date, task.end_date, task.points, task.position, task.created_by,
      task.created_at, task.updated_at,
      coalesce(array_agg(tag.tag order by tag.tag) filter (where tag.tag is not null), '{}') as tags,
      case p_sort
        when 'priority' then case task.priority
          when 'urgent' then '0' when 'high' then '1'
          when 'medium' then '2' else '3' end
        when 'due' then coalesce(task.end_date::text, '9999-12-31')
        when 'title' then lower(task.title)
        when 'status' then case task.status
          when 'backlog' then '0' when 'todo' then '1'
          when 'in_progress' then '2' when 'in_review' then '3' else '4' end
        else to_char(task.position + 1000000000000,
          'FM00000000000000000000.0000000000')
      end as sort_value
    from tasks task
    join projects project on project.id = task.project_id and project.archived_at is null
    left join task_tags tag on tag.task_id = task.id
    where task.workspace_id = p_workspace_id
      and task.archived_at is null
      and (p_status is null or task.status = any(p_status))
      and (p_priority is null or task.priority = any(p_priority))
      and (p_type is null or task.type = any(p_type))
      and (
        p_assignee is null or task.assignee_id = any(p_assignee)
        or (p_include_unassigned and task.assignee_id is null)
      )
      and (
        p_tags is null or exists (
          select 1 from task_tags selected
          where selected.task_id = task.id and selected.tag = any(p_tags)
        )
      )
      and (
        nullif(btrim(p_search), '') is null
        or lower(task.title || ' ' || task.description)
          like '%' || lower(btrim(p_search)) || '%'
      )
      and case p_schedule
        when 'gantt' then task.start_date is not null and task.end_date is not null
          and (p_window_start is null or task.end_date >= p_window_start)
          and (p_window_end is null or task.start_date <= p_window_end)
        when 'dated' then task.start_date is not null
          and (p_window_start is null or task.start_date >= p_window_start)
          and (p_window_end is null or task.start_date <= p_window_end)
        when 'unscheduled' then task.start_date is null
        else true
      end
    group by task.id
  )
  select candidates.* from candidates
  where p_cursor_sort is null
     or (candidates.sort_value, candidates.id) > (p_cursor_sort, p_cursor_id)
  order by candidates.sort_value, candidates.id
  limit least(greatest(p_limit, 1), 500) + 1;
$$;

create or replace function query_workload(
  p_workspace_id uuid,
  p_window_start date,
  p_week_count integer default 6
)
returns table (assignee_id uuid, week_start date, points bigint, bucket text)
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select task.assignee_id, task.start_date, task.points
    from tasks task
    join projects project on project.id = task.project_id and project.archived_at is null
    where task.workspace_id = p_workspace_id
      and task.archived_at is null
      and task.status <> 'done'
      and coalesce(task.points, 0) > 0
  ), bounds as (
    select p_window_start as starts,
           p_window_start + (least(greatest(p_week_count, 1), 26) * 7 - 1) as ends
  )
  select scoped.assignee_id, date_trunc('week', scoped.start_date)::date,
         sum(scoped.points)::bigint, 'scheduled'::text
  from scoped, bounds
  where scoped.start_date between bounds.starts and bounds.ends
  group by scoped.assignee_id, date_trunc('week', scoped.start_date)::date
  union all
  select null, null, coalesce(sum(scoped.points), 0)::bigint, 'unscheduled'
  from scoped where scoped.start_date is null
  union all
  select null, null, coalesce(sum(scoped.points), 0)::bigint, 'out_of_range'
  from scoped, bounds where scoped.start_date is not null
    and scoped.start_date not between bounds.starts and bounds.ends;
$$;

-- Recreate My Work with the archive predicate while preserving its API.
create or replace function query_my_work(
  p_scope text default 'assigned',
  p_cursor_sort timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid, workspace_id uuid, workspace_name text, project_id uuid,
  project_name text, project_key text, ref text, title text, type task_type,
  status task_status, priority task_priority, start_date date, end_date date,
  points integer, updated_at timestamptz, tags text[], sort_value timestamptz
)
language plpgsql
security invoker
stable
set search_path = public
as $$
#variable_conflict use_column
declare due_order boolean := p_scope in ('overdue', 'due_soon');
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_scope not in ('assigned', 'overdue', 'due_soon', 'recent') then
    raise exception 'unsupported My Work scope' using errcode = '22023';
  end if;
  if (p_cursor_sort is null) <> (p_cursor_id is null) then
    raise exception 'cursor sort and id must be supplied together' using errcode = '22023';
  end if;

  return query
  with scoped as (
    select task.id, task.workspace_id, workspace.name as workspace_name,
      task.project_id, project.name as project_name, project.key as project_key,
      task.ref, task.title, task.type, task.status, task.priority,
      task.start_date, task.end_date, task.points, task.updated_at,
      coalesce((select array_agg(task_tag.tag order by task_tag.tag)
        from task_tags task_tag where task_tag.task_id = task.id), '{}'::text[]) as tags,
      case when due_order then task.end_date::timestamp at time zone 'UTC'
           else task.updated_at end as sort_value
    from tasks task
    join workspaces workspace on workspace.id = task.workspace_id
    join projects project on project.id = task.project_id
    where task.assignee_id = auth.uid()
      and task.archived_at is null
      and project.archived_at is null
      and case p_scope
        when 'overdue' then task.status <> 'done' and task.end_date < current_date
        when 'due_soon' then task.status <> 'done'
          and task.end_date between current_date and current_date + 7
        when 'recent' then task.updated_at >= now() - interval '7 days'
        else true end
  ), cursor_page as (
    select * from scoped where p_cursor_sort is null
      or case when due_order
        then (scoped.sort_value, scoped.id) > (p_cursor_sort, p_cursor_id)
        else (scoped.sort_value, scoped.id) < (p_cursor_sort, p_cursor_id) end
  )
  select * from cursor_page
  order by case when due_order then cursor_page.sort_value end asc nulls last,
    case when not due_order then cursor_page.sort_value end desc nulls last,
    case when due_order then cursor_page.id end asc,
    case when not due_order then cursor_page.id end desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200) + 1;
end;
$$;

-- Due-soon generation must not revive archived work.
create or replace function enqueue_due_notifications(p_days integer default 3)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare target record;
declare notification_id uuid;
declare inserted_count bigint := 0;
begin
  if p_days is null or p_days not between 0 and 30 then
    raise exception 'due notification window must be between 0 and 30 days'
      using errcode = '22023';
  end if;
  for target in
    select distinct task.id as task_id, task.workspace_id, task.end_date, recipient.user_id
    from tasks task
    join projects project on project.id = task.project_id and project.archived_at is null
    cross join lateral (
      select task.assignee_id as user_id where task.assignee_id is not null
      union
      select watcher.user_id from task_watchers watcher where watcher.task_id = task.id
    ) recipient
    join workspace_members member
      on member.workspace_id = task.workspace_id and member.user_id = recipient.user_id
    where task.archived_at is null
      and task.status <> 'done'
      and task.end_date between current_date and current_date + p_days
  loop
    notification_id := enqueue_notification(
      target.workspace_id, target.user_id, null, 'due_soon', target.task_id,
      null, null, 'due:' || target.task_id || ':' || target.end_date
    );
    if notification_id is not null then inserted_count := inserted_count + 1; end if;
  end loop;
  return inserted_count;
end;
$$;

notify pgrst, 'reload schema';

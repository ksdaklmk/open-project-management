-- Forward-fix 0028: an undo can restore an earlier value only when the
-- dependencies for that value are still valid. Collaboration can otherwise
-- remove an assignee/project or change the opposite date while the undo toast
-- is visible; those rows become conflicts instead of aborting the whole undo.

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
  prior_assignee uuid;
  prior_start date;
  prior_end date;
  prior_project uuid;
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
      prior_assignee := case
        when jsonb_typeof(item.before_state->'assignee_id') = 'null' then null
        else (item.before_state->>'assignee_id')::uuid end;
      if prior_assignee is not null and not exists (
        select 1 from workspace_members membership
        where membership.workspace_id = operation.workspace_id
          and membership.user_id = prior_assignee
      ) then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set assignee_id = prior_assignee where id = target.id;
    elsif action_kind = 'start_date' then
      if target.start_date is distinct from (case
        when jsonb_typeof(item.after_state->'start_date') = 'null' then null
        else (item.after_state->>'start_date')::date end) then
        conflicts := conflicts + 1; continue;
      end if;
      prior_start := case when jsonb_typeof(item.before_state->'start_date') = 'null'
        then null else (item.before_state->>'start_date')::date end;
      if prior_start is not null and target.end_date is not null
         and prior_start > target.end_date then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set start_date = prior_start where id = target.id;
    elsif action_kind = 'end_date' then
      if target.end_date is distinct from (case
        when jsonb_typeof(item.after_state->'end_date') = 'null' then null
        else (item.after_state->>'end_date')::date end) then
        conflicts := conflicts + 1; continue;
      end if;
      prior_end := case when jsonb_typeof(item.before_state->'end_date') = 'null'
        then null else (item.before_state->>'end_date')::date end;
      if prior_end is not null and target.start_date is not null
         and target.start_date > prior_end then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set end_date = prior_end where id = target.id;
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
      prior_project := (item.before_state->>'project_id')::uuid;
      if not exists (
        select 1 from projects project
        where project.id = prior_project
          and project.workspace_id = operation.workspace_id
          and project.archived_at is null
      ) or exists (
        select 1 from tasks conflict
        where conflict.project_id = prior_project
          and conflict.ref = target.ref and conflict.id <> target.id
      ) then
        conflicts := conflicts + 1; continue;
      end if;
      update tasks set project_id = prior_project where id = target.id;
    elsif action_kind = 'archive' then
      if target.archived_at is distinct from (case
        when jsonb_typeof(item.after_state->'archived_at') = 'null' then null
        else (item.after_state->>'archived_at')::timestamptz end) then
        conflicts := conflicts + 1; continue;
      end if;
      if jsonb_typeof(item.before_state->'archived_at') = 'null' and not exists (
        select 1 from projects project
        where project.id = target.project_id
          and project.workspace_id = operation.workspace_id
          and project.archived_at is null
      ) then
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

notify pgrst, 'reload schema';

-- Project milestones and the user-facing dependency workflow build on the
-- tenant-safe graph introduced for template materialization in migration 0030.
-- Dependency writes are serialized per workspace so concurrent inserts cannot
-- race the cycle check. Downstream dates are intentionally never rewritten.

create type milestone_status as enum ('planned', 'at_risk', 'complete');

create table project_milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null check (
    title = btrim(title) and char_length(title) between 1 and 120
  ),
  target_date date not null check (target_date between date '1900-01-01' and date '2100-12-31'),
  status milestone_status not null default 'planned',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_milestones_workspace_target_idx
  on project_milestones (workspace_id, target_date, id);
create index project_milestones_project_target_idx
  on project_milestones (project_id, target_date, id);

alter table project_milestones enable row level security;

create policy project_milestone_read on project_milestones for select
  using (is_member(workspace_id));

-- This Supabase version requires a table grant before RLS can be evaluated.
-- Writes remain RPC-only so project validity, role checks, and actor identity
-- cross one guarded path.
grant select on project_milestones to authenticated;

create trigger project_milestones_updated_at before update on project_milestones
for each row execute function set_updated_at();

create or replace function set_project_milestone_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare target_project projects%rowtype;
begin
  select * into target_project from projects where id = new.project_id;
  if target_project.id is null or target_project.archived_at is not null then
    raise exception 'milestone project is unavailable'
      using errcode = '23514', constraint = 'project_milestones_active_project';
  end if;
  new.workspace_id := target_project.workspace_id;
  return new;
end;
$$;

create trigger project_milestones_set_workspace
before insert or update of project_id, workspace_id on project_milestones
for each row execute function set_project_milestone_workspace();

-- Replace the migration-0030 validator in place. Taking a workspace-scoped
-- transaction advisory lock closes the write-skew window where two concurrent
-- edges could each pass the recursive cycle check before either became visible.
create or replace function set_task_dependency_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare predecessor_workspace uuid;
declare successor_workspace uuid;
begin
  select workspace_id into predecessor_workspace from tasks
  where id = new.predecessor_task_id;
  select workspace_id into successor_workspace from tasks
  where id = new.successor_task_id;
  if predecessor_workspace is null or successor_workspace is null
     or predecessor_workspace <> successor_workspace then
    raise exception 'dependency tasks must share a workspace'
      using errcode = '23514', constraint = 'task_dependencies_same_workspace';
  end if;
  new.workspace_id := predecessor_workspace;
  perform pg_advisory_xact_lock(hashtextextended(predecessor_workspace::text, 2718));

  if exists (
    with recursive reachable(task_id) as (
      select dependency.successor_task_id
      from task_dependencies dependency
      where dependency.predecessor_task_id = new.successor_task_id
        and dependency.id <> new.id
      union
      select dependency.successor_task_id
      from task_dependencies dependency
      join reachable path on dependency.predecessor_task_id = path.task_id
      where dependency.id <> new.id
    )
    select 1 from reachable where task_id = new.predecessor_task_id
  ) then
    raise exception 'dependency would create a cycle'
      using errcode = '23514', constraint = 'task_dependencies_acyclic';
  end if;
  return new;
end;
$$;

create or replace function create_project_milestone(
  p_project_id uuid,
  p_title text,
  p_target_date date,
  p_status milestone_status default 'planned'
)
returns project_milestones
language plpgsql
security definer
set search_path = public
as $$
declare target_project projects%rowtype;
declare created project_milestones%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into target_project from projects where id = p_project_id;
  if target_project.id is null or target_project.archived_at is not null
     or not has_workspace_role(
       target_project.workspace_id, array['owner','admin']::member_role[]
     ) then
    raise exception 'milestone management requires an active project administrator'
      using errcode = '42501';
  end if;
  if p_title is null or btrim(p_title) = '' or btrim(p_title) <> p_title
     or char_length(p_title) > 120 or p_target_date is null then
    raise exception 'invalid milestone fields' using errcode = '22023';
  end if;

  insert into project_milestones (
    workspace_id, project_id, title, target_date, status, created_by
  ) values (
    target_project.workspace_id, target_project.id, p_title, p_target_date,
    coalesce(p_status, 'planned'), auth.uid()
  ) returning * into created;
  return created;
end;
$$;

create or replace function update_project_milestone(
  p_milestone_id uuid,
  p_title text,
  p_target_date date,
  p_status milestone_status
)
returns project_milestones
language plpgsql
security definer
set search_path = public
as $$
declare target project_milestones%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into target from project_milestones where id = p_milestone_id;
  if target.id is null or not has_workspace_role(
    target.workspace_id, array['owner','admin']::member_role[]
  ) then
    raise exception 'milestone management requires a project administrator'
      using errcode = '42501';
  end if;
  if p_title is null or btrim(p_title) = '' or btrim(p_title) <> p_title
     or char_length(p_title) > 120 or p_target_date is null or p_status is null then
    raise exception 'invalid milestone fields' using errcode = '22023';
  end if;

  update project_milestones
  set title = p_title, target_date = p_target_date, status = p_status
  where id = target.id
  returning * into target;
  return target;
end;
$$;

create or replace function delete_project_milestone(p_milestone_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target project_milestones%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into target from project_milestones where id = p_milestone_id;
  if target.id is null or not has_workspace_role(
    target.workspace_id, array['owner','admin']::member_role[]
  ) then
    raise exception 'milestone management requires a project administrator'
      using errcode = '42501';
  end if;
  delete from project_milestones where id = target.id;
  return true;
end;
$$;

create or replace function create_task_dependency(
  p_predecessor_task_id uuid,
  p_successor_task_id uuid
)
returns task_dependencies
language plpgsql
security definer
set search_path = public
as $$
declare predecessor tasks%rowtype;
declare successor tasks%rowtype;
declare created task_dependencies%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_predecessor_task_id is null or p_successor_task_id is null
     or p_predecessor_task_id = p_successor_task_id then
    raise exception 'a task cannot depend on itself'
      using errcode = '23514', constraint = 'task_dependencies_not_self';
  end if;
  select task.* into predecessor from tasks task
  join projects project on project.id = task.project_id and project.archived_at is null
  where task.id = p_predecessor_task_id and task.archived_at is null;
  select task.* into successor from tasks task
  join projects project on project.id = task.project_id and project.archived_at is null
  where task.id = p_successor_task_id and task.archived_at is null;
  if predecessor.id is null or successor.id is null
     or predecessor.workspace_id <> successor.workspace_id
     or not is_member(predecessor.workspace_id) then
    raise exception 'dependency tasks are unavailable'
      using errcode = '42501';
  end if;

  insert into task_dependencies (
    workspace_id, predecessor_task_id, successor_task_id, created_by
  ) values (
    predecessor.workspace_id, predecessor.id, successor.id, auth.uid()
  ) returning * into created;
  return created;
end;
$$;

create or replace function delete_task_dependency(p_dependency_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target task_dependencies%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into target from task_dependencies where id = p_dependency_id;
  if target.id is null or not is_member(target.workspace_id) then
    raise exception 'dependency is unavailable' using errcode = '42501';
  end if;
  delete from task_dependencies where id = target.id;
  return true;
end;
$$;

create or replace function query_task_dependencies(
  p_workspace_id uuid,
  p_task_id uuid default null
)
returns table (
  id uuid,
  workspace_id uuid,
  predecessor_task_id uuid,
  predecessor_ref text,
  predecessor_title text,
  predecessor_status task_status,
  predecessor_start_date date,
  predecessor_end_date date,
  successor_task_id uuid,
  successor_ref text,
  successor_title text,
  successor_status task_status,
  successor_start_date date,
  successor_end_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  select dependency.id, dependency.workspace_id,
    predecessor.id, predecessor.ref, predecessor.title, predecessor.status,
    predecessor.start_date, predecessor.end_date,
    successor.id, successor.ref, successor.title, successor.status,
    successor.start_date, successor.end_date
  from task_dependencies dependency
  join tasks predecessor on predecessor.id = dependency.predecessor_task_id
    and predecessor.archived_at is null
  join projects predecessor_project on predecessor_project.id = predecessor.project_id
    and predecessor_project.archived_at is null
  join tasks successor on successor.id = dependency.successor_task_id
    and successor.archived_at is null
  join projects successor_project on successor_project.id = successor.project_id
    and successor_project.archived_at is null
  where dependency.workspace_id = p_workspace_id
    and (p_task_id is null or p_task_id in (predecessor.id, successor.id))
  order by predecessor.ref, successor.ref, dependency.id;
$$;

revoke all on function set_project_milestone_workspace() from public;
revoke all on function create_project_milestone(uuid, text, date, milestone_status) from public;
revoke all on function update_project_milestone(uuid, text, date, milestone_status) from public;
revoke all on function delete_project_milestone(uuid) from public;
revoke all on function create_task_dependency(uuid, uuid) from public;
revoke all on function delete_task_dependency(uuid) from public;
revoke all on function query_task_dependencies(uuid, uuid) from public;

grant execute on function create_project_milestone(uuid, text, date, milestone_status)
  to authenticated;
grant execute on function update_project_milestone(uuid, text, date, milestone_status)
  to authenticated;
grant execute on function delete_project_milestone(uuid) to authenticated;
grant execute on function create_task_dependency(uuid, uuid) to authenticated;
grant execute on function delete_task_dependency(uuid) to authenticated;
grant execute on function query_task_dependencies(uuid, uuid) to authenticated;

-- Keep the existing paging/filter arguments stable while returning the number
-- of unfinished predecessor tasks. A completed successor is never shown as
-- blocked, and archived work never contributes to active blocker state.
drop function query_tasks(
  uuid, task_status[], task_priority[], uuid[], boolean, task_type[], text[],
  text, text, text, uuid, date, date, text, integer
);

create function query_tasks(
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
  updated_at timestamptz, tags text[], blocked_by_count integer, sort_value text
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
      case when task.status = 'done' then 0 else (
        select count(*)::integer
        from task_dependencies dependency
        join tasks predecessor on predecessor.id = dependency.predecessor_task_id
          and predecessor.archived_at is null and predecessor.status <> 'done'
        join projects predecessor_project on predecessor_project.id = predecessor.project_id
          and predecessor_project.archived_at is null
        where dependency.successor_task_id = task.id
      ) end as blocked_by_count,
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

revoke all on function query_tasks(
  uuid, task_status[], task_priority[], uuid[], boolean, task_type[], text[],
  text, text, text, uuid, date, date, text, integer
) from public;
grant execute on function query_tasks(
  uuid, task_status[], task_priority[], uuid[], boolean, task_type[], text[],
  text, text, text, uuid, date, date, text, integer
) to authenticated;

-- Milestones and dependency edits participate in the existing workspace
-- Realtime channel so blockers and markers reconcile across browser contexts.
do $$
declare table_name text;
begin
  foreach table_name in array array['project_milestones', 'task_dependencies'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

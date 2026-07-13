-- Phase 1C: bounded, cursor-based task reads and server-side Workload.
-- The functions are SECURITY INVOKER so the existing task RLS policy remains
-- the tenant boundary. Every cursor is the stable (sort_value, id) pair.

create extension if not exists pg_trgm with schema extensions;

create index if not exists tasks_workspace_status_position_id_idx
  on tasks (workspace_id, status, position, id);
create index if not exists tasks_workspace_priority_id_idx
  on tasks (workspace_id, priority, id);
create index if not exists tasks_workspace_end_date_id_idx
  on tasks (workspace_id, end_date, id);
create index if not exists tasks_workspace_start_date_id_idx
  on tasks (workspace_id, start_date, id);
create index if not exists tasks_workspace_type_id_idx
  on tasks (workspace_id, type, id);
create index if not exists tasks_workspace_assignee_id_idx
  on tasks (workspace_id, assignee_id, id);
create index if not exists tasks_search_trgm_idx
  on tasks using gin (lower(title || ' ' || description) extensions.gin_trgm_ops);
create index if not exists task_tags_tag_task_id_idx on task_tags (tag, task_id);
create index if not exists comments_task_created_id_idx on comments (task_id, created_at desc, id desc);
create index if not exists activity_workspace_created_id_idx
  on activity (workspace_id, created_at desc, id desc);

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
  id uuid,
  project_id uuid,
  workspace_id uuid,
  ref text,
  type task_type,
  title text,
  description text,
  status task_status,
  priority task_priority,
  assignee_id uuid,
  start_date date,
  end_date date,
  points integer,
  "position" double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  tags text[],
  sort_value text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with candidates as (
    select
      task.*,
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
    left join task_tags tag on tag.task_id = task.id
    where task.workspace_id = p_workspace_id
      and (p_status is null or task.status = any(p_status))
      and (p_priority is null or task.priority = any(p_priority))
      and (p_type is null or task.type = any(p_type))
      and (
        p_assignee is null
        or task.assignee_id = any(p_assignee)
        or (p_include_unassigned and task.assignee_id is null)
      )
      and (
        p_tags is null
        or exists (
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
  select candidates.*
  from candidates
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
returns table (
  assignee_id uuid,
  week_start date,
  points bigint,
  bucket text
)
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select task.assignee_id, task.start_date, task.points
    from tasks task
    where task.workspace_id = p_workspace_id
      and task.status <> 'done'
      and coalesce(task.points, 0) > 0
  ), bounds as (
    select p_window_start as starts,
           p_window_start + (least(greatest(p_week_count, 1), 26) * 7 - 1) as ends
  )
  select scoped.assignee_id,
         date_trunc('week', scoped.start_date)::date,
         sum(scoped.points)::bigint,
         'scheduled'::text
  from scoped, bounds
  where scoped.start_date between bounds.starts and bounds.ends
  group by scoped.assignee_id, date_trunc('week', scoped.start_date)::date
  union all
  select null, null, coalesce(sum(scoped.points), 0)::bigint, 'unscheduled'
  from scoped where scoped.start_date is null
  union all
  select null, null, coalesce(sum(scoped.points), 0)::bigint, 'out_of_range'
  from scoped, bounds
  where scoped.start_date is not null
    and scoped.start_date not between bounds.starts and bounds.ends;
$$;

revoke execute on function query_tasks(
  uuid, task_status[], task_priority[], uuid[], boolean, task_type[], text[],
  text, text, text, uuid, date, date, text, integer
) from public;
grant execute on function query_tasks(
  uuid, task_status[], task_priority[], uuid[], boolean, task_type[], text[],
  text, text, text, uuid, date, date, text, integer
) to authenticated;

revoke execute on function query_workload(uuid, date, integer) from public;
grant execute on function query_workload(uuid, date, integer) to authenticated;

notify pgrst, 'reload schema';

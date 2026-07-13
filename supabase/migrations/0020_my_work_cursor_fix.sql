-- Forward-fix 0019: PL/pgSQL output-column names are variables, so explicitly
-- prefer CTE columns when names overlap in the cursor query.

create or replace function query_my_work(
  p_scope text default 'assigned',
  p_cursor_sort timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  project_id uuid,
  project_name text,
  project_key text,
  ref text,
  title text,
  type task_type,
  status task_status,
  priority task_priority,
  start_date date,
  end_date date,
  points integer,
  updated_at timestamptz,
  tags text[],
  sort_value timestamptz
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
    select
      task.id,
      task.workspace_id,
      workspace.name as workspace_name,
      task.project_id,
      project.name as project_name,
      project.key as project_key,
      task.ref,
      task.title,
      task.type,
      task.status,
      task.priority,
      task.start_date,
      task.end_date,
      task.points,
      task.updated_at,
      coalesce((
        select array_agg(task_tag.tag order by task_tag.tag)
        from task_tags task_tag where task_tag.task_id = task.id
      ), '{}'::text[]) as tags,
      case
        when due_order then task.end_date::timestamp at time zone 'UTC'
        else task.updated_at
      end as sort_value
    from tasks task
    join workspaces workspace on workspace.id = task.workspace_id
    join projects project on project.id = task.project_id
    where task.assignee_id = auth.uid()
      and project.archived_at is null
      and case p_scope
        when 'overdue' then task.status <> 'done' and task.end_date < current_date
        when 'due_soon' then task.status <> 'done'
          and task.end_date between current_date and current_date + 7
        when 'recent' then task.updated_at >= now() - interval '7 days'
        else true
      end
  ), cursor_page as (
    select * from scoped
    where p_cursor_sort is null
      or case when due_order
        then (scoped.sort_value, scoped.id) > (p_cursor_sort, p_cursor_id)
        else (scoped.sort_value, scoped.id) < (p_cursor_sort, p_cursor_id)
      end
  )
  select * from cursor_page
  order by
    case when due_order then cursor_page.sort_value end asc nulls last,
    case when not due_order then cursor_page.sort_value end desc nulls last,
    case when due_order then cursor_page.id end asc,
    case when not due_order then cursor_page.id end desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200) + 1;
end;
$$;

notify pgrst, 'reload schema';

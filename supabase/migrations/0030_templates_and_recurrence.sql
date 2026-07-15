-- Project templates are immutable, validated blueprints captured from active
-- projects. Recurrence definitions generate either a task copy or a template
-- instance from a timezone-local schedule. A unique occurrence journal makes
-- scheduled retries idempotent.

create type recurrence_frequency as enum ('daily', 'weekly', 'monthly');

create table project_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  description text not null default ''
    check (description = btrim(description) and char_length(description) <= 500),
  definition jsonb not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index project_templates_workspace_name_idx
  on project_templates (workspace_id, lower(name));
create index project_templates_workspace_updated_idx
  on project_templates (workspace_id, updated_at desc, id);

-- Task 2.6 needs a destination for dependencies carried by a template. Task
-- 2.7 adds management and view affordances on top of this tenant-safe graph.
create table task_dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  predecessor_task_id uuid not null references tasks(id) on delete cascade,
  successor_task_id uuid not null references tasks(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint task_dependencies_not_self
    check (predecessor_task_id <> successor_task_id),
  unique (predecessor_task_id, successor_task_id)
);
create index task_dependencies_workspace_idx on task_dependencies (workspace_id, id);
create index task_dependencies_successor_idx
  on task_dependencies (successor_task_id, predecessor_task_id);

create table task_recurrences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source_task_id uuid references tasks(id) on delete cascade,
  source_template_id uuid references project_templates(id) on delete cascade,
  target_project_id uuid references projects(id) on delete cascade,
  timezone text not null,
  frequency recurrence_frequency not null,
  schedule_interval integer not null default 1 check (schedule_interval between 1 and 52),
  next_occurrence_at timestamptz not null,
  enabled boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  last_generated_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_recurrences_one_source check (
    (source_task_id is not null)::integer + (source_template_id is not null)::integer = 1
  ),
  constraint task_recurrences_target_shape check (
    (source_task_id is not null and target_project_id is not null)
    or (source_template_id is not null and target_project_id is null)
  )
);
create unique index task_recurrences_source_task_idx
  on task_recurrences (source_task_id) where source_task_id is not null;
create unique index task_recurrences_source_template_idx
  on task_recurrences (source_template_id) where source_template_id is not null;
create index task_recurrences_due_idx
  on task_recurrences (next_occurrence_at, id) where enabled;

create table recurrence_occurrences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recurrence_id uuid not null references task_recurrences(id) on delete cascade,
  occurrence_at timestamptz not null,
  occurrence_key text not null unique,
  generated_task_id uuid references tasks(id) on delete set null,
  generated_project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recurrence_occurrences_at_most_one_result check (
    (generated_task_id is not null)::integer + (generated_project_id is not null)::integer <= 1
  ),
  unique (recurrence_id, occurrence_at)
);
create index recurrence_occurrences_workspace_idx
  on recurrence_occurrences (workspace_id, created_at desc, id);

alter table project_templates enable row level security;
alter table task_dependencies enable row level security;
alter table task_recurrences enable row level security;
alter table recurrence_occurrences enable row level security;

create policy project_template_read on project_templates for select
  using (is_member(workspace_id));
create policy task_dependency_read on task_dependencies for select
  using (is_member(workspace_id));
create policy task_recurrence_read on task_recurrences for select
  using (is_member(workspace_id));
create policy recurrence_occurrence_read on recurrence_occurrences for select
  using (is_member(workspace_id));

-- Every write crosses a guarded function below. Explicit read grants are
-- required in this Supabase version before RLS can be evaluated.
grant select on
  project_templates, task_dependencies, task_recurrences, recurrence_occurrences
to authenticated;

create trigger project_templates_updated_at before update on project_templates
for each row execute function set_updated_at();
create trigger task_recurrences_updated_at before update on task_recurrences
for each row execute function set_updated_at();

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

create trigger task_dependencies_validate
before insert or update on task_dependencies
for each row execute function set_task_dependency_workspace();

create or replace function validate_project_template_definition(p_definition jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare project_value jsonb;
declare task_value jsonb;
declare subtask_value jsonb;
declare tag_value text;
declare dependency_value text;
declare normalized_tasks jsonb := '[]'::jsonb;
declare normalized_subtasks jsonb;
declare normalized_tags jsonb;
declare normalized_dependencies jsonb;
declare task_keys text[] := '{}'::text[];
declare task_key text;
declare task_title text;
declare task_description text;
declare project_name text;
declare project_color text;
declare task_type_value text;
declare task_status_value text;
declare task_priority_value text;
declare capacity integer;
declare points_value integer;
declare start_offset integer;
declare end_offset integer;
begin
  if p_definition is null or jsonb_typeof(p_definition) <> 'object' then
    raise exception 'template definition must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_definition) key
    where not (key = any(array['project', 'tasks']))
  ) then
    raise exception 'template definition contains an unsupported key' using errcode = '22023';
  end if;

  project_value := p_definition->'project';
  if project_value is null or jsonb_typeof(project_value) <> 'object' then
    raise exception 'template project must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(project_value) key
    where not (key = any(array['name', 'color', 'capacity_per_week']))
  ) then
    raise exception 'template project contains an unsupported key' using errcode = '22023';
  end if;
  project_name := btrim(coalesce(project_value->>'name', ''));
  project_color := lower(coalesce(project_value->>'color', ''));
  if char_length(project_name) not between 1 and 120 then
    raise exception 'template project name must contain 1 to 120 characters'
      using errcode = '22023';
  end if;
  if project_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'template project color is invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(project_value->'capacity_per_week') is distinct from 'number'
     or (project_value->>'capacity_per_week')::numeric
        <> trunc((project_value->>'capacity_per_week')::numeric) then
    raise exception 'capacity assumption must be a whole number' using errcode = '22023';
  end if;
  capacity := (project_value->>'capacity_per_week')::integer;
  if capacity not between 0 and 168 then
    raise exception 'capacity assumption must be between 0 and 168' using errcode = '22023';
  end if;

  if jsonb_typeof(p_definition->'tasks') is distinct from 'array'
     or jsonb_array_length(p_definition->'tasks') > 100 then
    raise exception 'template tasks must be an array of at most 100 items'
      using errcode = '22023';
  end if;

  for task_value in select value from jsonb_array_elements(p_definition->'tasks') value loop
    if jsonb_typeof(task_value) <> 'object' then
      raise exception 'template tasks must be objects' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(task_value) key
      where not (key = any(array[
        'key', 'title', 'description', 'type', 'status', 'priority', 'points',
        'start_offset_days', 'end_offset_days', 'tags', 'subtasks', 'depends_on'
      ]))
    ) then
      raise exception 'template task contains an unsupported key' using errcode = '22023';
    end if;
    task_key := coalesce(task_value->>'key', '');
    task_title := btrim(coalesce(task_value->>'title', ''));
    task_description := coalesce(task_value->>'description', '');
    task_type_value := coalesce(task_value->>'type', 'feature');
    task_status_value := coalesce(task_value->>'status', 'backlog');
    task_priority_value := coalesce(task_value->>'priority', 'medium');
    if task_key !~ '^[a-z][a-z0-9_-]{0,39}$' or task_key = any(task_keys) then
      raise exception 'template task keys must be unique safe identifiers'
        using errcode = '22023';
    end if;
    if char_length(task_title) not between 1 and 200
       or char_length(task_description) > 10000 then
      raise exception 'template task title or description is invalid' using errcode = '22023';
    end if;
    if not (task_type_value = any(array['feature','bug','chore','improvement']))
       or not (task_status_value = any(array['backlog','todo','in_progress','in_review','done']))
       or not (task_priority_value = any(array['urgent','high','medium','low'])) then
      raise exception 'template task taxonomy is invalid' using errcode = '22023';
    end if;

    points_value := null;
    if task_value ? 'points' and jsonb_typeof(task_value->'points') <> 'null' then
      if jsonb_typeof(task_value->'points') <> 'number'
         or (task_value->>'points')::numeric <> trunc((task_value->>'points')::numeric) then
        raise exception 'template task points must be a whole number' using errcode = '22023';
      end if;
      points_value := (task_value->>'points')::integer;
      if points_value not between 0 and 999 then
        raise exception 'template task points are out of range' using errcode = '22023';
      end if;
    end if;

    start_offset := null;
    if task_value ? 'start_offset_days'
       and jsonb_typeof(task_value->'start_offset_days') <> 'null' then
      if jsonb_typeof(task_value->'start_offset_days') <> 'number'
         or (task_value->>'start_offset_days')::numeric
            <> trunc((task_value->>'start_offset_days')::numeric) then
        raise exception 'template date offsets must be whole numbers' using errcode = '22023';
      end if;
      start_offset := (task_value->>'start_offset_days')::integer;
    end if;
    end_offset := null;
    if task_value ? 'end_offset_days'
       and jsonb_typeof(task_value->'end_offset_days') <> 'null' then
      if jsonb_typeof(task_value->'end_offset_days') <> 'number'
         or (task_value->>'end_offset_days')::numeric
            <> trunc((task_value->>'end_offset_days')::numeric) then
        raise exception 'template date offsets must be whole numbers' using errcode = '22023';
      end if;
      end_offset := (task_value->>'end_offset_days')::integer;
    end if;
    if abs(coalesce(start_offset, 0)) > 3650 or abs(coalesce(end_offset, 0)) > 3650
       or (start_offset is not null and end_offset is not null and start_offset > end_offset) then
      raise exception 'template task date offsets are invalid' using errcode = '22023';
    end if;

    normalized_tags := '[]'::jsonb;
    if jsonb_typeof(coalesce(task_value->'tags', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(task_value->'tags', '[]'::jsonb)) > 20 then
      raise exception 'template task tags must be an array of at most 20 items'
        using errcode = '22023';
    end if;
    for tag_value in
      select value from jsonb_array_elements_text(coalesce(task_value->'tags', '[]'::jsonb)) value
    loop
      if not (tag_value = any(array['Frontend','Backend','API','Design','Mobile']))
         or normalized_tags @> jsonb_build_array(tag_value) then
        raise exception 'template task tags are invalid or duplicated' using errcode = '22023';
      end if;
      normalized_tags := normalized_tags || jsonb_build_array(tag_value);
    end loop;

    normalized_subtasks := '[]'::jsonb;
    if jsonb_typeof(coalesce(task_value->'subtasks', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(task_value->'subtasks', '[]'::jsonb)) > 20 then
      raise exception 'template subtasks must be an array of at most 20 items'
        using errcode = '22023';
    end if;
    for subtask_value in
      select value from jsonb_array_elements(coalesce(task_value->'subtasks', '[]'::jsonb)) value
    loop
      if jsonb_typeof(subtask_value) <> 'object'
         or exists (
           select 1 from jsonb_object_keys(subtask_value) key where key <> 'title'
         )
         or char_length(btrim(coalesce(subtask_value->>'title', ''))) not between 1 and 200 then
        raise exception 'template subtask is invalid' using errcode = '22023';
      end if;
      normalized_subtasks := normalized_subtasks || jsonb_build_array(
        jsonb_build_object('title', btrim(subtask_value->>'title'))
      );
    end loop;

    normalized_dependencies := '[]'::jsonb;
    if jsonb_typeof(coalesce(task_value->'depends_on', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(task_value->'depends_on', '[]'::jsonb)) > 20 then
      raise exception 'template dependencies must be an array of at most 20 items'
        using errcode = '22023';
    end if;
    for dependency_value in
      select value from jsonb_array_elements_text(
        coalesce(task_value->'depends_on', '[]'::jsonb)
      ) value
    loop
      if dependency_value = task_key
         or normalized_dependencies @> jsonb_build_array(dependency_value) then
        raise exception 'template dependencies are invalid or duplicated' using errcode = '22023';
      end if;
      normalized_dependencies := normalized_dependencies || jsonb_build_array(dependency_value);
    end loop;

    task_keys := array_append(task_keys, task_key);
    normalized_tasks := normalized_tasks || jsonb_build_array(jsonb_build_object(
      'key', task_key,
      'title', task_title,
      'description', task_description,
      'type', task_type_value,
      'status', task_status_value,
      'priority', task_priority_value,
      'points', to_jsonb(points_value),
      'start_offset_days', to_jsonb(start_offset),
      'end_offset_days', to_jsonb(end_offset),
      'tags', normalized_tags,
      'subtasks', normalized_subtasks,
      'depends_on', normalized_dependencies
    ));
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(normalized_tasks) task,
         jsonb_array_elements_text(task->'depends_on') dependency
    where not (dependency = any(task_keys))
  ) then
    raise exception 'template dependency references an unknown task' using errcode = '22023';
  end if;
  if exists (
    with recursive edges(predecessor, successor) as (
      select dependency, task->>'key'
      from jsonb_array_elements(normalized_tasks) task,
           jsonb_array_elements_text(task->'depends_on') dependency
    ), paths(start_key, current_key) as (
      select predecessor, successor from edges
      union
      select path.start_key, edge.successor
      from paths path join edges edge on edge.predecessor = path.current_key
    )
    select 1 from paths where start_key = current_key
  ) then
    raise exception 'template dependencies contain a cycle' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'name', project_name,
      'color', project_color,
      'capacity_per_week', capacity
    ),
    'tasks', normalized_tasks
  );
end;
$$;

create or replace function capture_project_template(
  p_project_id uuid,
  p_name text,
  p_description text,
  p_anchor_date date,
  p_capacity_per_week integer default 40
)
returns project_templates
language plpgsql
security definer
set search_path = public
as $$
declare source projects%rowtype;
declare definition jsonb;
declare template_tasks jsonb;
declare created project_templates;
declare normalized_name text := btrim(p_name);
declare normalized_description text := btrim(coalesce(p_description, ''));
begin
  select * into source from projects where id = p_project_id and archived_at is null;
  if source.id is null
     or not has_workspace_role(source.workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to create templates' using errcode = '42501';
  end if;
  if char_length(normalized_name) not between 1 and 80
     or char_length(normalized_description) > 500 then
    raise exception 'template name or description is invalid' using errcode = '22023';
  end if;
  if p_anchor_date is null or p_anchor_date not between date '1900-01-01' and date '2199-12-31'
     or p_capacity_per_week not between 0 and 168 then
    raise exception 'template anchor or capacity assumption is invalid' using errcode = '22023';
  end if;
  if (select count(*) from tasks where project_id = source.id and archived_at is null) > 100 then
    raise exception 'a template can contain at most 100 active tasks' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', 't' || replace(task.id::text, '-', ''),
    'title', task.title,
    'description', task.description,
    'type', task.type,
    'status', task.status,
    'priority', task.priority,
    'points', task.points,
    'start_offset_days', case when task.start_date is null then null
      else task.start_date - p_anchor_date end,
    'end_offset_days', case when task.end_date is null then null
      else task.end_date - p_anchor_date end,
    'tags', coalesce((
      select jsonb_agg(tag.tag order by tag.tag) from task_tags tag where tag.task_id = task.id
    ), '[]'::jsonb),
    'subtasks', coalesce((
      select jsonb_agg(jsonb_build_object('title', subtask.title)
        order by subtask.position, subtask.id)
      from subtasks subtask where subtask.task_id = task.id
    ), '[]'::jsonb),
    'depends_on', coalesce((
      select jsonb_agg('t' || replace(predecessor.id::text, '-', '') order by predecessor.id)
      from task_dependencies dependency
      join tasks predecessor on predecessor.id = dependency.predecessor_task_id
      where dependency.successor_task_id = task.id
        and predecessor.project_id = source.id and predecessor.archived_at is null
    ), '[]'::jsonb)
  ) order by task.position, task.id), '[]'::jsonb)
  into template_tasks
  from tasks task where task.project_id = source.id and task.archived_at is null;

  definition := validate_project_template_definition(jsonb_build_object(
    'project', jsonb_build_object(
      'name', source.name,
      'color', source.color,
      'capacity_per_week', p_capacity_per_week
    ),
    'tasks', template_tasks
  ));
  insert into project_templates (workspace_id, name, description, definition, created_by)
  values (source.workspace_id, normalized_name, normalized_description, definition, auth.uid())
  returning * into created;
  return created;
end;
$$;

create or replace function instantiate_project_template_internal(
  p_template_id uuid,
  p_project_name text,
  p_project_key text,
  p_anchor_date date,
  p_actor_id uuid
)
returns table (project_id uuid, task_count integer, dependency_count integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare source project_templates%rowtype;
declare definition jsonb;
declare task_value jsonb;
declare subtask_value jsonb;
declare dependency_value text;
declare tag_value text;
declare created_project projects%rowtype;
declare created_task_id uuid;
declare generated_ids jsonb := '{}'::jsonb;
declare normalized_project_name text := btrim(p_project_name);
declare normalized_project_key text := upper(btrim(p_project_key));
declare generated_tasks integer := 0;
declare generated_dependencies integer := 0;
declare sequence_number integer := 101;
declare subtask_position integer;
declare task_position double precision := 0;
begin
  select * into source from project_templates where id = p_template_id;
  if source.id is null then
    raise exception 'project template not found' using errcode = '22023';
  end if;
  if char_length(normalized_project_name) not between 1 and 120
     or normalized_project_key !~ '^[A-Z][A-Z0-9]{0,11}$'
     or p_anchor_date is null
     or p_anchor_date not between date '1900-01-01' and date '2199-12-31' then
    raise exception 'project name, key, or anchor date is invalid' using errcode = '22023';
  end if;
  definition := validate_project_template_definition(source.definition);
  if exists (
    select 1 from jsonb_array_elements(definition->'tasks') task
    where ((task->>'start_offset_days')::integer is not null and
           p_anchor_date + (task->>'start_offset_days')::integer
             not between date '1900-01-01' and date '2199-12-31')
       or ((task->>'end_offset_days')::integer is not null and
           p_anchor_date + (task->>'end_offset_days')::integer
             not between date '1900-01-01' and date '2199-12-31')
  ) then
    raise exception 'template dates fall outside the supported range' using errcode = '22023';
  end if;

  insert into projects (workspace_id, name, key, color)
  values (
    source.workspace_id, normalized_project_name, normalized_project_key,
    definition->'project'->>'color'
  ) returning * into created_project;

  for task_value in select value from jsonb_array_elements(definition->'tasks') value loop
    created_task_id := gen_random_uuid();
    task_position := task_position + 1024;
    insert into tasks (
      id, project_id, workspace_id, ref, title, description, type, status, priority,
      points, start_date, end_date, position, created_by
    ) values (
      created_task_id, created_project.id, source.workspace_id,
      normalized_project_key || '-' || sequence_number,
      task_value->>'title', task_value->>'description',
      (task_value->>'type')::task_type, (task_value->>'status')::task_status,
      (task_value->>'priority')::task_priority,
      case when jsonb_typeof(task_value->'points') = 'null' then null
        else (task_value->>'points')::integer end,
      case when jsonb_typeof(task_value->'start_offset_days') = 'null' then null
        else p_anchor_date + (task_value->>'start_offset_days')::integer end,
      case when jsonb_typeof(task_value->'end_offset_days') = 'null' then null
        else p_anchor_date + (task_value->>'end_offset_days')::integer end,
      task_position, p_actor_id
    );
    generated_ids := generated_ids || jsonb_build_object(task_value->>'key', created_task_id);
    sequence_number := sequence_number + 1;
    generated_tasks := generated_tasks + 1;

    subtask_position := 0;
    for subtask_value in select value from jsonb_array_elements(task_value->'subtasks') value loop
      insert into subtasks (task_id, title, position)
      values (created_task_id, subtask_value->>'title', subtask_position);
      subtask_position := subtask_position + 1;
    end loop;
    for tag_value in select value from jsonb_array_elements_text(task_value->'tags') value loop
      insert into task_tags (task_id, tag) values (created_task_id, tag_value);
    end loop;
  end loop;
  update projects set next_task_num = sequence_number where id = created_project.id;

  for task_value in select value from jsonb_array_elements(definition->'tasks') value loop
    for dependency_value in
      select value from jsonb_array_elements_text(task_value->'depends_on') value
    loop
      insert into task_dependencies (
        workspace_id, predecessor_task_id, successor_task_id, created_by
      ) values (
        source.workspace_id,
        (generated_ids->>dependency_value)::uuid,
        (generated_ids->>(task_value->>'key'))::uuid,
        p_actor_id
      );
      generated_dependencies := generated_dependencies + 1;
    end loop;
  end loop;
  return query select created_project.id, generated_tasks, generated_dependencies;
end;
$$;

create or replace function instantiate_project_template(
  p_template_id uuid,
  p_project_name text,
  p_project_key text,
  p_anchor_date date
)
returns table (project_id uuid, task_count integer, dependency_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare source project_templates%rowtype;
begin
  select * into source from project_templates where id = p_template_id;
  if source.id is null
     or not has_workspace_role(source.workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to use templates' using errcode = '42501';
  end if;
  return query select * from instantiate_project_template_internal(
    source.id, p_project_name, p_project_key, p_anchor_date, auth.uid()
  );
end;
$$;

create or replace function delete_project_template(p_template_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare source project_templates%rowtype;
begin
  select * into source from project_templates where id = p_template_id;
  if source.id is null
     or not has_workspace_role(source.workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to delete templates' using errcode = '42501';
  end if;
  delete from project_templates where id = source.id;
  return true;
end;
$$;

create or replace function recurrence_next_occurrence(
  p_occurrence_at timestamptz,
  p_timezone text,
  p_frequency recurrence_frequency,
  p_interval integer
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare local_occurrence timestamp;
begin
  if p_interval not between 1 and 52
     or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'recurrence timezone or interval is invalid' using errcode = '22023';
  end if;
  local_occurrence := p_occurrence_at at time zone p_timezone;
  return (case p_frequency
    when 'daily' then local_occurrence + make_interval(days => p_interval)
    when 'weekly' then local_occurrence + make_interval(weeks => p_interval)
    when 'monthly' then local_occurrence + make_interval(months => p_interval)
  end) at time zone p_timezone;
end;
$$;

create or replace function upsert_task_recurrence(
  p_task_id uuid,
  p_timezone text,
  p_frequency recurrence_frequency,
  p_interval integer,
  p_first_occurrence_local timestamp
)
returns task_recurrences
language plpgsql
security definer
set search_path = public
as $$
declare source tasks%rowtype;
declare result task_recurrences;
declare first_occurrence timestamptz;
begin
  select task.* into source
  from tasks task join projects project on project.id = task.project_id
  where task.id = p_task_id and task.archived_at is null and project.archived_at is null;
  if source.id is null or not is_member(source.workspace_id) then
    raise exception 'task access required' using errcode = '42501';
  end if;
  if p_interval not between 1 and 52
     or p_first_occurrence_local is null
     or p_first_occurrence_local::date not between date '1900-01-01' and date '2199-12-31'
     or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'recurrence schedule is invalid' using errcode = '22023';
  end if;
  first_occurrence := p_first_occurrence_local at time zone p_timezone;
  insert into task_recurrences (
    workspace_id, source_task_id, target_project_id, timezone, frequency,
    schedule_interval, next_occurrence_at, enabled, created_by, last_error_code
  ) values (
    source.workspace_id, source.id, source.project_id, p_timezone, p_frequency,
    p_interval, first_occurrence, true, auth.uid(), null
  ) on conflict (source_task_id) where source_task_id is not null do update set
    target_project_id = excluded.target_project_id,
    timezone = excluded.timezone,
    frequency = excluded.frequency,
    schedule_interval = excluded.schedule_interval,
    next_occurrence_at = excluded.next_occurrence_at,
    enabled = true,
    last_error_code = null
  returning * into result;
  return result;
end;
$$;

create or replace function upsert_template_recurrence(
  p_template_id uuid,
  p_timezone text,
  p_frequency recurrence_frequency,
  p_interval integer,
  p_first_occurrence_local timestamp
)
returns task_recurrences
language plpgsql
security definer
set search_path = public
as $$
declare source project_templates%rowtype;
declare result task_recurrences;
declare first_occurrence timestamptz;
begin
  select * into source from project_templates where id = p_template_id;
  if source.id is null
     or not has_workspace_role(source.workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'template admin access required' using errcode = '42501';
  end if;
  if p_interval not between 1 and 52
     or p_first_occurrence_local is null
     or p_first_occurrence_local::date not between date '1900-01-01' and date '2199-12-31'
     or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'recurrence schedule is invalid' using errcode = '22023';
  end if;
  first_occurrence := p_first_occurrence_local at time zone p_timezone;
  insert into task_recurrences (
    workspace_id, source_template_id, timezone, frequency, schedule_interval,
    next_occurrence_at, enabled, created_by, last_error_code
  ) values (
    source.workspace_id, source.id, p_timezone, p_frequency, p_interval,
    first_occurrence, true, auth.uid(), null
  ) on conflict (source_template_id) where source_template_id is not null do update set
    timezone = excluded.timezone,
    frequency = excluded.frequency,
    schedule_interval = excluded.schedule_interval,
    next_occurrence_at = excluded.next_occurrence_at,
    enabled = true,
    last_error_code = null
  returning * into result;
  return result;
end;
$$;

create or replace function delete_task_recurrence(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare source tasks%rowtype;
begin
  select * into source from tasks where id = p_task_id;
  if source.id is null or not is_member(source.workspace_id) then
    raise exception 'task access required' using errcode = '42501';
  end if;
  delete from task_recurrences where source_task_id = source.id;
  return found;
end;
$$;

create or replace function delete_template_recurrence(p_template_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare source project_templates%rowtype;
begin
  select * into source from project_templates where id = p_template_id;
  if source.id is null
     or not has_workspace_role(source.workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'template admin access required' using errcode = '42501';
  end if;
  delete from task_recurrences where source_template_id = source.id;
  return found;
end;
$$;

create or replace function generate_due_recurrences(
  p_limit integer default 25,
  p_now timestamptz default now()
)
returns table (
  processed_recurrence_id uuid,
  generated_occurrence_key text,
  generated_task_id uuid,
  generated_project_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare definition task_recurrences%rowtype;
declare source_task tasks%rowtype;
declare source_template project_templates%rowtype;
declare occurrence_id uuid;
declare occurrence_key_value text;
declare new_task_id uuid;
declare new_project_id uuid;
declare next_number integer;
declare next_position double precision;
declare local_date date;
declare generated_start date;
declare generated_end date;
declare template_instance record;
begin
  if p_limit not between 1 and 100 then
    raise exception 'recurrence generation limit must be between 1 and 100'
      using errcode = '22023';
  end if;
  for definition in
    select recurrence.* from task_recurrences recurrence
    where recurrence.enabled and recurrence.next_occurrence_at <= p_now
    order by recurrence.next_occurrence_at, recurrence.id
    limit p_limit for update skip locked
  loop
    begin
      occurrence_key_value := definition.id::text || ':' ||
        to_char(definition.next_occurrence_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
      occurrence_id := null;
      new_task_id := null;
      new_project_id := null;
      insert into recurrence_occurrences (
        workspace_id, recurrence_id, occurrence_at, occurrence_key,
        generated_task_id, generated_project_id
      ) values (
        definition.workspace_id, definition.id, definition.next_occurrence_at,
        occurrence_key_value,
        null, null
      ) on conflict (recurrence_id, occurrence_at) do nothing
      returning id, generated_task_id, generated_project_id
      into occurrence_id, new_task_id, new_project_id;
      if occurrence_id is null then
        update task_recurrences set
          next_occurrence_at = recurrence_next_occurrence(
            definition.next_occurrence_at, definition.timezone,
            definition.frequency, definition.schedule_interval
          )
        where id = definition.id;
        continue;
      end if;

      local_date := (definition.next_occurrence_at at time zone definition.timezone)::date;
      if definition.source_task_id is not null then
        new_task_id := gen_random_uuid();
        select task.* into source_task
        from tasks task join projects project on project.id = task.project_id
        where task.id = definition.source_task_id
          and task.archived_at is null and project.archived_at is null
        for update of task;
        if source_task.id is null or source_task.project_id <> definition.target_project_id then
          raise exception 'recurrence source task is unavailable' using errcode = '55000';
        end if;
        update projects set next_task_num = next_task_num + 1
        where id = source_task.project_id and archived_at is null
        returning next_task_num - 1 into next_number;
        select coalesce(max(task.position), 0) + 1024 into next_position
        from tasks task where task.project_id = source_task.project_id
          and task.status = case when source_task.status = 'done' then 'todo' else source_task.status end;
        generated_start := case when source_task.start_date is null then null else local_date end;
        generated_end := case
          when source_task.end_date is null then null
          when source_task.start_date is null then local_date
          else local_date + (source_task.end_date - source_task.start_date)
        end;
        insert into tasks (
          id, project_id, workspace_id, ref, title, description, type, status,
          priority, assignee_id, start_date, end_date, points, position, created_by
        ) values (
          new_task_id, source_task.project_id, source_task.workspace_id,
          split_part(source_task.ref, '-', 1) || '-' || next_number,
          source_task.title, source_task.description, source_task.type,
          case when source_task.status = 'done' then 'todo' else source_task.status end,
          source_task.priority, source_task.assignee_id, generated_start, generated_end,
          source_task.points, next_position, definition.created_by
        );
        insert into subtasks (task_id, title, done, position)
        select new_task_id, subtask.title, false, subtask.position
        from subtasks subtask where subtask.task_id = source_task.id;
        insert into task_tags (task_id, tag)
        select new_task_id, tag.tag from task_tags tag where tag.task_id = source_task.id;
        update recurrence_occurrences set generated_task_id = new_task_id
        where id = occurrence_id;
      else
        select * into source_template from project_templates
        where id = definition.source_template_id;
        if source_template.id is null then
          raise exception 'recurrence source template is unavailable' using errcode = '55000';
        end if;
        for template_instance in select * from instantiate_project_template_internal(
          source_template.id,
          source_template.definition->'project'->>'name' || ' ' || local_date::text,
          'R' || to_char(local_date, 'YYMMDD') ||
            upper(left(replace(definition.id::text, '-', ''), 5)),
          local_date,
          definition.created_by
        ) loop
          update recurrence_occurrences set
            generated_project_id = template_instance.project_id
          where id = occurrence_id;
          new_project_id := template_instance.project_id;
        end loop;
      end if;

      update task_recurrences set
        next_occurrence_at = recurrence_next_occurrence(
          definition.next_occurrence_at, definition.timezone,
          definition.frequency, definition.schedule_interval
        ),
        last_generated_at = p_now,
        last_error_code = null
      where id = definition.id;
      processed_recurrence_id := definition.id;
      generated_occurrence_key := occurrence_key_value;
      generated_task_id := new_task_id;
      generated_project_id := new_project_id;
      return next;
    exception when others then
      update task_recurrences set enabled = false, last_error_code = sqlstate
      where id = definition.id;
    end;
  end loop;
end;
$$;

revoke all on function set_task_dependency_workspace() from public;
revoke all on function validate_project_template_definition(jsonb) from public;
revoke all on function capture_project_template(uuid, text, text, date, integer) from public;
revoke all on function instantiate_project_template_internal(uuid, text, text, date, uuid) from public;
revoke all on function instantiate_project_template(uuid, text, text, date) from public;
revoke all on function delete_project_template(uuid) from public;
revoke all on function recurrence_next_occurrence(timestamptz, text, recurrence_frequency, integer) from public;
revoke all on function upsert_task_recurrence(uuid, text, recurrence_frequency, integer, timestamp) from public;
revoke all on function upsert_template_recurrence(uuid, text, recurrence_frequency, integer, timestamp) from public;
revoke all on function delete_task_recurrence(uuid) from public;
revoke all on function delete_template_recurrence(uuid) from public;
revoke all on function generate_due_recurrences(integer, timestamptz) from public;

grant execute on function capture_project_template(uuid, text, text, date, integer) to authenticated;
grant execute on function instantiate_project_template(uuid, text, text, date) to authenticated;
grant execute on function delete_project_template(uuid) to authenticated;
grant execute on function upsert_task_recurrence(uuid, text, recurrence_frequency, integer, timestamp) to authenticated;
grant execute on function upsert_template_recurrence(uuid, text, recurrence_frequency, integer, timestamp) to authenticated;
grant execute on function delete_task_recurrence(uuid) to authenticated;
grant execute on function delete_template_recurrence(uuid) to authenticated;
grant execute on function generate_due_recurrences(integer, timestamptz) to service_role;

notify pgrst, 'reload schema';

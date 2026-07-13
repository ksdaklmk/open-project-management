-- Saved task views persist only a normalized, allowlisted filter contract.
-- No stored value is interpreted as SQL or as an executable expression.

create type saved_view_type as enum ('list', 'board', 'gantt', 'timeline');
create type saved_view_visibility as enum ('private', 'workspace');

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  view_type saved_view_type not null,
  configuration jsonb not null,
  visibility saved_view_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_views_workspace_view_idx
  on saved_views (workspace_id, view_type, visibility, name, id);
create index saved_views_owner_idx on saved_views (owner_id, updated_at desc);

create table saved_view_defaults (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  view_type saved_view_type not null,
  saved_view_id uuid not null references saved_views(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, view_type)
);
create index saved_view_defaults_view_idx on saved_view_defaults (saved_view_id);

alter table saved_views enable row level security;
alter table saved_view_defaults enable row level security;

create policy saved_view_read on saved_views for select using (
  is_member(workspace_id)
  and (owner_id = auth.uid() or visibility = 'workspace')
);
create policy saved_view_default_read on saved_view_defaults for select using (
  user_id = auth.uid() and is_member(workspace_id)
);

-- Writes cross SECURITY DEFINER RPCs below, which pin ownership and validate
-- both visibility and tenant membership. Direct table mutation is withheld.
grant select on saved_views, saved_view_defaults to authenticated;

create trigger saved_views_updated_at
before update on saved_views
for each row execute function set_updated_at();
create trigger saved_view_defaults_updated_at
before update on saved_view_defaults
for each row execute function set_updated_at();

create or replace function normalize_saved_view_array(
  p_value jsonb,
  p_name text,
  p_allowed text[] default null,
  p_allow_empty boolean default false,
  p_max_length integer default 64
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare item text;
declare item_count integer;
declare distinct_count integer;
begin
  if p_value is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p_value) <> 'array' then
    raise exception '% must be an array', p_name using errcode = '22023';
  end if;
  if jsonb_array_length(p_value) > 20 then
    raise exception '% has too many values', p_name using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_value) element
    where jsonb_typeof(element) <> 'string'
  ) then
    raise exception '% values must be strings', p_name using errcode = '22023';
  end if;

  select count(*), count(distinct value)
  into item_count, distinct_count
  from jsonb_array_elements_text(p_value) value;
  if item_count <> distinct_count then
    raise exception '% contains duplicate values', p_name using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements_text(p_value) value loop
    if (not p_allow_empty and item = '') or char_length(item) > p_max_length then
      raise exception '% contains an invalid value', p_name using errcode = '22023';
    end if;
    if p_allowed is not null and not (item = any(p_allowed)) then
      raise exception '% contains an unsupported value', p_name using errcode = '22023';
    end if;
  end loop;
  return p_value;
end;
$$;

create or replace function validate_saved_view_configuration(
  p_view_type saved_view_type,
  p_configuration jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare filters jsonb;
declare statuses jsonb;
declare priorities jsonb;
declare assignees jsonb;
declare task_types jsonb;
declare tags jsonb;
declare query_text text := '';
declare sort_value text := 'priority';
declare group_value text;
declare expected_group text;
begin
  if p_configuration is null or jsonb_typeof(p_configuration) <> 'object' then
    raise exception 'configuration must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_configuration) key
    where not (key = any(array['filters', 'sort', 'group']))
  ) then
    raise exception 'configuration contains an unsupported key' using errcode = '22023';
  end if;

  filters := coalesce(p_configuration -> 'filters', '{}'::jsonb);
  if jsonb_typeof(filters) <> 'object' then
    raise exception 'filters must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(filters) key
    where not (key = any(array['status', 'priority', 'assignee', 'type', 'tag', 'q']))
  ) then
    raise exception 'filters contains an unsupported key' using errcode = '22023';
  end if;

  statuses := normalize_saved_view_array(
    filters -> 'status', 'status',
    array['backlog', 'todo', 'in_progress', 'in_review', 'done']
  );
  priorities := normalize_saved_view_array(
    filters -> 'priority', 'priority', array['urgent', 'high', 'medium', 'low']
  );
  assignees := normalize_saved_view_array(filters -> 'assignee', 'assignee', null, true, 36);
  if exists (
    select 1 from jsonb_array_elements_text(assignees) value
    where value <> '' and value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'assignee contains an invalid identifier' using errcode = '22023';
  end if;
  task_types := normalize_saved_view_array(
    filters -> 'type', 'type', array['feature', 'bug', 'chore', 'improvement']
  );
  tags := normalize_saved_view_array(
    filters -> 'tag', 'tag', array['Frontend', 'Backend', 'API', 'Design', 'Mobile'], false, 40
  );

  if filters ? 'q' then
    if jsonb_typeof(filters -> 'q') <> 'string' then
      raise exception 'q must be a string' using errcode = '22023';
    end if;
    query_text := filters ->> 'q';
    if char_length(query_text) > 200 then
      raise exception 'q is too long' using errcode = '22023';
    end if;
  end if;

  if p_configuration ? 'sort' then
    if jsonb_typeof(p_configuration -> 'sort') <> 'string' then
      raise exception 'sort must be a string' using errcode = '22023';
    end if;
    sort_value := p_configuration ->> 'sort';
  end if;
  if not (sort_value = any(array['priority', 'due', 'title', 'status'])) then
    raise exception 'sort contains an unsupported value' using errcode = '22023';
  end if;

  expected_group := case p_view_type
    when 'list' then 'status'
    when 'board' then 'status'
    when 'gantt' then 'schedule'
    when 'timeline' then 'date'
  end;
  group_value := coalesce(p_configuration ->> 'group', expected_group);
  if p_configuration ? 'group' and jsonb_typeof(p_configuration -> 'group') <> 'string' then
    raise exception 'group must be a string' using errcode = '22023';
  end if;
  if group_value <> expected_group then
    raise exception 'group is not supported for this view type' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'filters', jsonb_build_object(
      'status', statuses,
      'priority', priorities,
      'assignee', assignees,
      'type', task_types,
      'tag', tags,
      'q', query_text
    ),
    'sort', sort_value,
    'group', group_value
  );
end;
$$;

create or replace function validate_saved_view_assignees(
  p_workspace_id uuid,
  p_configuration jsonb
)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements_text(p_configuration -> 'filters' -> 'assignee') value
    where value <> '' and not exists (
      select 1 from workspace_members member
      where member.workspace_id = p_workspace_id and member.user_id = value::uuid
    )
  ) then
    raise exception 'assignee is not a workspace member' using errcode = '22023';
  end if;
end;
$$;

create or replace function create_saved_view(
  p_workspace_id uuid,
  p_name text,
  p_view_type saved_view_type,
  p_configuration jsonb,
  p_visibility saved_view_visibility default 'private'
)
returns saved_views
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
declare normalized jsonb;
declare result saved_views;
declare normalized_name text := btrim(p_name);
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not is_member(p_workspace_id) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if normalized_name is null or char_length(normalized_name) not between 1 and 80 then
    raise exception 'name must contain 1 to 80 characters' using errcode = '22023';
  end if;
  normalized := validate_saved_view_configuration(p_view_type, p_configuration);
  perform validate_saved_view_assignees(p_workspace_id, normalized);
  insert into saved_views (
    workspace_id, owner_id, name, view_type, configuration, visibility
  ) values (
    p_workspace_id, caller, normalized_name, p_view_type, normalized, p_visibility
  ) returning * into result;
  return result;
end;
$$;

create or replace function update_saved_view(
  p_saved_view_id uuid,
  p_name text,
  p_configuration jsonb,
  p_visibility saved_view_visibility
)
returns saved_views
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
declare source saved_views;
declare normalized jsonb;
declare result saved_views;
declare normalized_name text := btrim(p_name);
begin
  select * into source from saved_views where id = p_saved_view_id;
  if caller is null or source.id is null or source.owner_id <> caller
     or not is_member(source.workspace_id) then
    raise exception 'saved view owner access required' using errcode = '42501';
  end if;
  if normalized_name is null or char_length(normalized_name) not between 1 and 80 then
    raise exception 'name must contain 1 to 80 characters' using errcode = '22023';
  end if;
  normalized := validate_saved_view_configuration(source.view_type, p_configuration);
  perform validate_saved_view_assignees(source.workspace_id, normalized);
  update saved_views
  set name = normalized_name, configuration = normalized, visibility = p_visibility
  where id = source.id
  returning * into result;
  if p_visibility = 'private' then
    delete from saved_view_defaults
    where saved_view_id = source.id and user_id <> caller;
  end if;
  return result;
end;
$$;

create or replace function duplicate_saved_view(
  p_saved_view_id uuid,
  p_name text default null
)
returns saved_views
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
declare source saved_views;
declare result saved_views;
declare normalized_name text;
begin
  select * into source from saved_views where id = p_saved_view_id;
  if caller is null or source.id is null or not is_member(source.workspace_id)
     or (source.owner_id <> caller and source.visibility <> 'workspace') then
    raise exception 'saved view access required' using errcode = '42501';
  end if;
  normalized_name := btrim(coalesce(p_name, left(source.name || ' copy', 80)));
  if char_length(normalized_name) not between 1 and 80 then
    raise exception 'name must contain 1 to 80 characters' using errcode = '22023';
  end if;
  insert into saved_views (
    workspace_id, owner_id, name, view_type, configuration, visibility
  ) values (
    source.workspace_id, caller, normalized_name, source.view_type,
    source.configuration, 'private'
  ) returning * into result;
  return result;
end;
$$;

create or replace function delete_saved_view(p_saved_view_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
declare deleted boolean;
begin
  delete from saved_views
  where id = p_saved_view_id and owner_id = caller and is_member(workspace_id);
  get diagnostics deleted = row_count;
  if not deleted then
    raise exception 'saved view owner access required' using errcode = '42501';
  end if;
  return true;
end;
$$;

create or replace function set_default_saved_view(
  p_workspace_id uuid,
  p_view_type saved_view_type,
  p_saved_view_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
declare source saved_views;
begin
  if caller is null or not is_member(p_workspace_id) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if p_saved_view_id is null then
    delete from saved_view_defaults
    where workspace_id = p_workspace_id and user_id = caller and view_type = p_view_type;
    return false;
  end if;
  select * into source from saved_views where id = p_saved_view_id;
  if source.id is null or source.workspace_id <> p_workspace_id
     or source.view_type <> p_view_type
     or (source.owner_id <> caller and source.visibility <> 'workspace') then
    raise exception 'saved view access required' using errcode = '42501';
  end if;
  insert into saved_view_defaults (workspace_id, user_id, view_type, saved_view_id)
  values (p_workspace_id, caller, p_view_type, source.id)
  on conflict (workspace_id, user_id, view_type) do update
  set saved_view_id = excluded.saved_view_id;
  return true;
end;
$$;

create or replace function get_default_saved_view(
  p_workspace_id uuid,
  p_view_type saved_view_type
)
returns setof saved_views
language sql
security definer
stable
set search_path = public
as $$
  select view.*
  from saved_view_defaults preference
  join saved_views view on view.id = preference.saved_view_id
  where preference.workspace_id = p_workspace_id
    and preference.user_id = auth.uid()
    and preference.view_type = p_view_type
    and is_member(preference.workspace_id)
    and (view.owner_id = auth.uid() or view.visibility = 'workspace')
  limit 1;
$$;

revoke all on function normalize_saved_view_array(jsonb, text, text[], boolean, integer) from public;
revoke all on function validate_saved_view_configuration(saved_view_type, jsonb) from public;
revoke all on function validate_saved_view_assignees(uuid, jsonb) from public;
revoke all on function create_saved_view(uuid, text, saved_view_type, jsonb, saved_view_visibility) from public;
revoke all on function update_saved_view(uuid, text, jsonb, saved_view_visibility) from public;
revoke all on function duplicate_saved_view(uuid, text) from public;
revoke all on function delete_saved_view(uuid) from public;
revoke all on function set_default_saved_view(uuid, saved_view_type, uuid) from public;
revoke all on function get_default_saved_view(uuid, saved_view_type) from public;

grant execute on function create_saved_view(uuid, text, saved_view_type, jsonb, saved_view_visibility) to authenticated;
grant execute on function update_saved_view(uuid, text, jsonb, saved_view_visibility) to authenticated;
grant execute on function duplicate_saved_view(uuid, text) to authenticated;
grant execute on function delete_saved_view(uuid) to authenticated;
grant execute on function set_default_saved_view(uuid, saved_view_type, uuid) to authenticated;
grant execute on function get_default_saved_view(uuid, saved_view_type) to authenticated;

notify pgrst, 'reload schema';

-- Atomic, authenticated workspace administration operations.

alter table projects add column archived_at timestamptz;

create or replace function create_workspace(
  p_name text,
  p_initial_project_name text,
  p_initial_project_key text
)
returns table (workspace_id uuid, project_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  created_workspace workspaces%rowtype;
  created_project projects%rowtype;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null
     or nullif(btrim(p_initial_project_name), '') is null
     or nullif(btrim(p_initial_project_key), '') is null then
    raise exception 'workspace and project names and project key are required'
      using errcode = '22023';
  end if;

  insert into workspaces (name, created_by)
  values (btrim(p_name), caller)
  returning * into created_workspace;

  insert into workspace_members (workspace_id, user_id, role)
  values (created_workspace.id, caller, 'owner');

  insert into projects (workspace_id, name, key)
  values (created_workspace.id, btrim(p_initial_project_name), upper(btrim(p_initial_project_key)))
  returning * into created_project;

  return query select created_workspace.id, created_project.id;
end;
$$;

create or replace function update_workspace(p_workspace_id uuid, p_name text)
returns workspaces
language plpgsql
security definer
set search_path = public
as $$
declare changed workspaces%rowtype;
begin
  if not has_workspace_role(p_workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to manage this workspace' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'workspace name is required' using errcode = '22023';
  end if;

  update workspaces set name = btrim(p_name) where id = p_workspace_id returning * into changed;
  return changed;
end;
$$;

create or replace function create_project(p_workspace_id uuid, p_name text, p_key text)
returns projects
language plpgsql
security definer
set search_path = public
as $$
declare created projects%rowtype;
begin
  if not has_workspace_role(p_workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to manage projects' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_key), '') is null then
    raise exception 'project name and key are required' using errcode = '22023';
  end if;

  insert into projects (workspace_id, name, key)
  values (p_workspace_id, btrim(p_name), upper(btrim(p_key)))
  returning * into created;
  return created;
end;
$$;

create or replace function update_project(p_project_id uuid, p_name text)
returns projects
language plpgsql
security definer
set search_path = public
as $$
declare
  target projects%rowtype;
  changed projects%rowtype;
begin
  select * into target from projects where id = p_project_id;
  if target.id is null
     or not has_workspace_role(target.workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to manage projects' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'project name is required' using errcode = '22023';
  end if;

  update projects set name = btrim(p_name) where id = p_project_id returning * into changed;
  return changed;
end;
$$;

create or replace function archive_project(p_project_id uuid)
returns projects
language plpgsql
security definer
set search_path = public
as $$
declare
  target projects%rowtype;
  changed projects%rowtype;
begin
  select * into target from projects where id = p_project_id;
  if target.id is null
     or not has_workspace_role(target.workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to manage projects' using errcode = '42501';
  end if;

  update projects set archived_at = coalesce(archived_at, now())
  where id = p_project_id returning * into changed;
  return changed;
end;
$$;

create or replace function set_member_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role member_role
)
returns workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare changed workspace_members%rowtype;
begin
  if not has_workspace_role(p_workspace_id, array['owner']::member_role[]) then
    raise exception 'not authorised to change member roles' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'use transfer_workspace_ownership to assign an owner'
      using errcode = '22023';
  end if;

  update workspace_members set role = p_role
  where workspace_id = p_workspace_id and user_id = p_user_id
  returning * into changed;
  if changed.user_id is null then
    raise exception 'workspace member not found' using errcode = '22023';
  end if;
  return changed;
end;
$$;

create or replace function set_member_capacity(
  p_workspace_id uuid,
  p_user_id uuid,
  p_capacity integer
)
returns workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare changed workspace_members%rowtype;
begin
  if not has_workspace_role(p_workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to change member capacity' using errcode = '42501';
  end if;

  update workspace_members set capacity_per_week = p_capacity
  where workspace_id = p_workspace_id and user_id = p_user_id
  returning * into changed;
  if changed.user_id is null then
    raise exception 'workspace member not found' using errcode = '22023';
  end if;
  return changed;
end;
$$;

create or replace function remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns table (removed_user_id uuid, unassigned_task_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_owner boolean;
  target_role member_role;
  affected bigint;
begin
  if not has_workspace_role(p_workspace_id, array['owner','admin']::member_role[]) then
    raise exception 'not authorised to remove workspace members' using errcode = '42501';
  end if;
  caller_is_owner := has_workspace_role(p_workspace_id, array['owner']::member_role[]);

  select role into target_role from workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id;
  if target_role is null then
    raise exception 'workspace member not found' using errcode = '22023';
  end if;
  if target_role = 'owner' and not caller_is_owner then
    raise exception 'only an owner may remove another owner' using errcode = '42501';
  end if;

  update tasks set assignee_id = null
  where workspace_id = p_workspace_id and assignee_id = p_user_id;
  get diagnostics affected = row_count;

  delete from workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id;

  return query select p_user_id, affected;
end;
$$;

create or replace function transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner_id uuid
)
returns table (previous_owner_id uuid, new_owner_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare caller uuid := auth.uid();
begin
  if caller is null
     or not has_workspace_role(p_workspace_id, array['owner']::member_role[]) then
    raise exception 'not authorised to transfer workspace ownership' using errcode = '42501';
  end if;
  if not exists (
    select 1 from workspace_members
    where workspace_id = p_workspace_id and user_id = p_new_owner_id
  ) then
    raise exception 'workspace member not found' using errcode = '22023';
  end if;

  if p_new_owner_id <> caller then
    update workspace_members set role = 'owner'
    where workspace_id = p_workspace_id and user_id = p_new_owner_id;
    update workspace_members set role = 'admin'
    where workspace_id = p_workspace_id and user_id = caller;
  end if;

  return query select caller, p_new_owner_id;
end;
$$;

revoke execute on function create_workspace(text, text, text) from public;
revoke execute on function update_workspace(uuid, text) from public;
revoke execute on function create_project(uuid, text, text) from public;
revoke execute on function update_project(uuid, text) from public;
revoke execute on function archive_project(uuid) from public;
revoke execute on function set_member_role(uuid, uuid, member_role) from public;
revoke execute on function set_member_capacity(uuid, uuid, integer) from public;
revoke execute on function remove_workspace_member(uuid, uuid) from public;
revoke execute on function transfer_workspace_ownership(uuid, uuid) from public;

grant execute on function create_workspace(text, text, text) to authenticated;
grant execute on function update_workspace(uuid, text) to authenticated;
grant execute on function create_project(uuid, text, text) to authenticated;
grant execute on function update_project(uuid, text) to authenticated;
grant execute on function archive_project(uuid) to authenticated;
grant execute on function set_member_role(uuid, uuid, member_role) to authenticated;
grant execute on function set_member_capacity(uuid, uuid, integer) to authenticated;
grant execute on function remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function transfer_workspace_ownership(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

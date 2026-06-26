-- 0002_rls.sql
-- Tenant-isolation security boundary: membership helper, workspace/profile
-- triggers, row-level security, and member-scoped policies for every table.

-- ---------------------------------------------------------------------------
-- Membership helper.
-- SECURITY DEFINER so a policy on workspace_members that calls is_member()
-- does not recurse into workspace_members' own RLS (infinite recursion).
-- search_path is pinned for the definer context.
-- ---------------------------------------------------------------------------
create or replace function is_member(ws uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from workspace_members
                 where workspace_id = ws and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Derive tasks.workspace_id from the parent project (the app never sets it).
-- SECURITY INVOKER (default): runs under the caller's RLS. A cross-workspace
-- insert therefore cannot resolve a project it may not see, so the task is
-- rejected; legitimate same-workspace inserts resolve normally. search_path
-- is pinned so the unqualified `projects` reference cannot be hijacked.
-- ---------------------------------------------------------------------------
create or replace function set_task_workspace() returns trigger
language plpgsql set search_path = public as $$
begin
  select workspace_id into new.workspace_id from projects where id = new.project_id;
  return new;
end; $$;
create trigger trg_task_ws before insert or update of project_id on tasks
  for each row execute function set_task_workspace();

-- ---------------------------------------------------------------------------
-- On signup, create the user's profile and (if present) join the demo
-- workspace. SECURITY DEFINER so it can write profiles/workspace_members
-- regardless of the caller's RLS.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare demo uuid;
begin
  insert into public.profiles (id, name)
    values (new.id, coalesce(new.raw_user_meta_data->>'name', ''));
  select id into demo from public.workspaces where name = 'Northwind' limit 1;
  if demo is not null then
    insert into public.workspace_members (workspace_id, user_id) values (demo, new.id);
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Enable row-level security on every table.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table subtasks enable row level security;
alter table task_tags enable row level security;
alter table comments enable row level security;
alter table activity enable row level security;

-- ---------------------------------------------------------------------------
-- Policies. Member-scoped reads/writes; child tables authorize via the parent
-- task's workspace; project deletion is gated to owner/admin.
-- ---------------------------------------------------------------------------
create policy profile_read on profiles for select using (true);
create policy profile_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy ws_read   on workspaces        for select using (is_member(id));
create policy mem_read  on workspace_members for select using (is_member(workspace_id));

create policy proj_read   on projects for select using (is_member(workspace_id));
create policy proj_insert on projects for insert with check (is_member(workspace_id));
create policy proj_update on projects for update using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy proj_delete on projects for delete using (exists (
  select 1 from workspace_members m
  where m.workspace_id = projects.workspace_id and m.user_id = auth.uid()
    and m.role in ('owner','admin')));

create policy task_rw on tasks for all
  using (is_member(workspace_id)) with check (is_member(workspace_id));

create policy subtask_rw on subtasks for all
  using (exists (select 1 from tasks t where t.id = task_id and is_member(t.workspace_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and is_member(t.workspace_id)));

create policy tag_rw on task_tags for all
  using (exists (select 1 from tasks t where t.id = task_id and is_member(t.workspace_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and is_member(t.workspace_id)));

create policy comment_rw on comments for all
  using (exists (select 1 from tasks t where t.id = task_id and is_member(t.workspace_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and is_member(t.workspace_id)));

create policy activity_read   on activity for select using (is_member(workspace_id));
create policy activity_insert on activity for insert with check (is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Table privileges. This Supabase version does NOT auto-expose new public
-- tables to the API roles, so the authenticated role has no DML privilege by
-- default and every query fails with 42501 *before* RLS is consulted. Grant
-- DML to authenticated so the policies above become the real access gate.
-- anon is intentionally left with no access (this app is auth-only).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  profiles, workspaces, workspace_members, projects, tasks,
  subtasks, task_tags, comments, activity
to authenticated;

-- Phase 1 permission contract (docs/permissions.md).
--
-- Owners and admins manage projects; every workspace member collaborates on
-- tasks and may delete tasks. Membership administration is RPC-only, task
-- creation is RPC-only, assignments cannot point outside the workspace, and
-- no operation may leave an existing workspace without an owner.

-- Shared role predicate for RLS policies and the administration RPCs added in
-- the next migration. SECURITY DEFINER avoids recursive RLS on
-- workspace_members; the caller identity still comes exclusively from
-- auth.uid().
create or replace function has_workspace_role(ws uuid, allowed member_role[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from workspace_members
    where workspace_id = ws
      and user_id = auth.uid()
      and role = any(allowed)
  );
$$;

-- Callable SECURITY DEFINER helpers are authenticated-only. PostgreSQL grants
-- function execution to PUBLIC by default, which would otherwise expose them
-- as anonymous PostgREST RPCs.
revoke execute on function is_member(uuid) from public;
revoke execute on function shares_workspace(uuid) from public;
revoke execute on function has_workspace_role(uuid, member_role[]) from public;
revoke execute on function create_task(uuid, text) from public;

grant execute on function is_member(uuid) to authenticated;
grant execute on function shares_workspace(uuid) to authenticated;
grant execute on function has_workspace_role(uuid, member_role[]) to authenticated;
grant execute on function create_task(uuid, text) to authenticated;

-- Project management belongs to owners and admins. Reads remain available to
-- every member through proj_read.
drop policy proj_insert on projects;
drop policy proj_update on projects;
drop policy proj_delete on projects;

create policy proj_insert on projects for insert
  with check (has_workspace_role(workspace_id, array['owner','admin']::member_role[]));
create policy proj_update on projects for update
  using (has_workspace_role(workspace_id, array['owner','admin']::member_role[]))
  with check (has_workspace_role(workspace_id, array['owner','admin']::member_role[]));
create policy proj_delete on projects for delete
  using (has_workspace_role(workspace_id, array['owner','admin']::member_role[]));

-- The application already creates tasks through create_task(), which derives
-- tenancy and authorship and allocates refs atomically. Remove the redundant
-- direct insert path. Member updates and deletes remain governed by RLS.
drop policy task_insert on tasks;
revoke insert on tasks from authenticated;

-- Role, capacity, and membership changes are made only by audited SECURITY
-- DEFINER administration RPCs. Keep member reads available for the UI.
revoke insert, update, delete on workspace_members from authenticated;

-- Repair any historical cross-workspace assignments before installing the
-- invariant. Such assignments were never valid product state; unassigning
-- them preserves the task while making Workload totals truthful.
update tasks t
set assignee_id = null
where assignee_id is not null
  and not exists (
    select 1
    from workspace_members m
    where m.workspace_id = t.workspace_id
      and m.user_id = t.assignee_id
  );

alter table tasks
  add constraint tasks_workspace_assignee_fkey
  foreign key (workspace_id, assignee_id)
  references workspace_members (workspace_id, user_id)
  on delete set null (assignee_id)
  not valid;

alter table tasks validate constraint tasks_workspace_assignee_fkey;

-- Enforce the last-owner invariant beneath the RPC layer. The parent
-- workspace existence check lets an intentional workspace deletion cascade
-- through its memberships while still blocking standalone owner removal or
-- demotion. A transfer promotes the replacement owner before demoting the old
-- owner, so the initially-immediate check remains transaction-safe.
create or replace function enforce_workspace_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_workspace uuid := old.workspace_id;
begin
  if exists (
    select 1 from workspaces where id = affected_workspace
  ) and not exists (
    select 1
    from workspace_members
    where workspace_id = affected_workspace
      and role = 'owner'
  ) then
    raise exception 'workspace must retain at least one owner'
      using errcode = '23514',
            constraint = 'workspace_members_owner_required';
  end if;

  return null;
end;
$$;

revoke execute on function enforce_workspace_has_owner() from public;

create constraint trigger workspace_members_owner_required
after update or delete on workspace_members
deferrable initially immediate
for each row execute function enforce_workspace_has_owner();

notify pgrst, 'reload schema';

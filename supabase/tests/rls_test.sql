-- supabase/tests/rls_test.sql
-- Tenant-isolation RLS verification (pgTAP).
--
-- Run directly against the running dev DB:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_test.sql
-- (pgTAP must be installed: `create extension if not exists pgtap;`)
--
-- Corrections applied vs the task brief's fixture (without these it errors):
--   C1: the `tasks` inserts carry an explicit workspace_id. It is NOT NULL and
--       the set_task_workspace trigger does not exist until 0002 is applied;
--       after 0002 the trigger overwrites it with the same derived value.
--   C2: the `profiles` insert uses ON CONFLICT (id) DO NOTHING because the
--       handle_new_user trigger (added by 0002) auto-creates a profile for
--       every auth.users row, which would otherwise be a duplicate-PK error.
--
-- The fixture seeds two fully isolated workspaces (A and B) plus a plain
-- member (C) of WS-A, and asserts real cross-tenant isolation -- not merely
-- that queries run. Positive controls guard every denial against the test
-- passing only because access is blanket-denied.

begin;
select plan(61);

-- ---------------------------------------------------------------------------
-- Service-role setup: two workspaces, three users, a task + subtask each.
-- ---------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.dev');

-- C2: handle_new_user already inserts these once 0002 is applied.
insert into profiles (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'B'),
  ('00000000-0000-0000-0000-00000000000c', 'C')
on conflict (id) do nothing;

insert into workspaces (id, name, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'WS-A', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', 'WS-B', '00000000-0000-0000-0000-00000000000b');

insert into workspace_members (workspace_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c', 'member');

-- handle_new_user (0002) auto-joins every new auth.users row to the seeded
-- "Northwind" demo workspace when it exists, silently giving A, B and C a
-- shared workspace -- which breaks the isolation premise below (notably
-- "A cannot read B's profile, no shared workspace"). Strip any membership
-- outside the two fixture workspaces so the fixture is deterministic whether
-- or not the demo seed is loaded.
delete from workspace_members
  where user_id in (
    '00000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-00000000000c')
  and workspace_id not in (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b1');

insert into projects (id, workspace_id, name, key) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'PA', 'PA'),
  ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a1', 'PD', 'PD'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'PB', 'PB');

-- C1: explicit workspace_id (required before the trigger exists; harmlessly
-- overwritten with the same derived value once 0002 is applied).
insert into tasks (id, project_id, workspace_id, ref, title, created_by) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000a1', 'PA-1', 'a task',
   '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000b1', 'PB-1', 'b task',
   '00000000-0000-0000-0000-00000000000b');

insert into subtasks (id, task_id, title) values
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a3', 'sub a'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b3', 'sub b');

-- A owns a comment on a WS-A task (a3). Used by the comment_update/_delete
-- membership tests below: the author must not be able to re-parent it into
-- another workspace's task, and non-authors must not touch it.
insert into comments (id, task_id, author_id, body) values
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-00000000000a', 'a comment');

-- ---------------------------------------------------------------------------
-- Impersonate user A (owner of WS-A). A must be fully isolated from WS-B.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000a','role','authenticated')::text,
  true);

-- SELECT isolation on tasks (the brief's two assertions). Scoped to WS-A's
-- workspace_id so an out-of-band seed (e.g. a demo Northwind that
-- handle_new_user would auto-join A to) cannot flake the count.
select is(
  (select count(*) from tasks
   where workspace_id = '00000000-0000-0000-0000-0000000000a1')::int, 1,
  'A sees only their own workspace tasks (scoped to WS-A)');
select is_empty(
  $$ select 1 from tasks where workspace_id = '00000000-0000-0000-0000-0000000000b1' $$,
  'A cannot read WS-B tasks');

-- INSERT isolation at the parent level (the brief's third assertion).
select throws_ok(
  $$ insert into projects (workspace_id, name, key)
     values ('00000000-0000-0000-0000-0000000000b1','x','X') $$,
  '42501', null,
  'A cannot insert a project into WS-B');

-- Child tables authorize via the parent task's workspace.
select is_empty(
  $$ select 1 from subtasks where id = '00000000-0000-0000-0000-0000000000b4' $$,
  'A cannot read a WS-B subtask (authorized via parent task)');
select throws_ok(
  $$ insert into subtasks (task_id, title)
     values ('00000000-0000-0000-0000-0000000000b3','x') $$,
  '42501', null,
  'A cannot add a subtask to a WS-B task');
select throws_ok(
  $$ insert into comments (task_id, author_id, body)
     values ('00000000-0000-0000-0000-0000000000b3',
             '00000000-0000-0000-0000-00000000000a','x') $$,
  '42501', null,
  'A cannot comment on a WS-B task');
select throws_ok(
  $$ insert into task_tags (task_id, tag)
     values ('00000000-0000-0000-0000-0000000000b3','Frontend') $$,
  '42501', null,
  'A cannot tag a WS-B task');

-- Positive controls: A CAN act within its own workspace. These prove the
-- denials above are RLS scoping, not a blanket deny that would pass spuriously.
select lives_ok(
  $$ insert into projects (workspace_id, name, key)
     values ('00000000-0000-0000-0000-0000000000a1','y','Y') $$,
  'A can create a project in its own workspace');
select lives_ok(
  $$ insert into subtasks (task_id, title)
     values ('00000000-0000-0000-0000-0000000000a3','own sub') $$,
  'A can add a subtask to its own task');
select is(
  (select count(*) from subtasks
   where id = '00000000-0000-0000-0000-0000000000a4')::int, 1,
  'A can read its own subtask');
select lives_ok(
  $$ insert into task_tags (task_id, tag)
     values ('00000000-0000-0000-0000-0000000000a3','Frontend') $$,
  'A can add a tag to its own task (tag write is not deny-all)');

-- ---------------------------------------------------------------------------
-- Security review fixes 2 & 3: identity is pinned on insert. A member of WS-A
-- may write within WS-A but cannot forge another user's identity on the row.
-- Each denial is paired with a positive control so the assertion cannot pass
-- merely because a policy is (accidentally) deny-all.
-- ---------------------------------------------------------------------------
-- Activity actor cannot be forged (audit-log integrity).
select throws_ok(
  $$ insert into activity (workspace_id, actor_id, verb)
     values ('00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-00000000000b', 'created') $$,
  '42501', null,
  'A cannot forge an activity actor_id (must equal auth.uid())');
select lives_ok(
  $$ insert into activity (workspace_id, actor_id, verb)
     values ('00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-00000000000a', 'created') $$,
  'A can log activity as itself (actor pin is not deny-all)');

-- Comment author cannot be spoofed (task a3 is an A-visible WS-A task).
select throws_ok(
  $$ insert into comments (task_id, author_id, body)
     values ('00000000-0000-0000-0000-0000000000a3',
             '00000000-0000-0000-0000-00000000000b', 'forged') $$,
  '42501', null,
  'A cannot spoof a comment author_id on an A-visible task');
select lives_ok(
  $$ insert into comments (task_id, author_id, body)
     values ('00000000-0000-0000-0000-0000000000a3',
             '00000000-0000-0000-0000-00000000000a', 'mine') $$,
  'A can comment as itself on its own task (author pin is not deny-all)');

-- Task creator cannot be spoofed; workspace_id is derived by the trigger.
select throws_ok(
  $$ insert into tasks (project_id, ref, title, created_by)
     values ('00000000-0000-0000-0000-0000000000a2', 'PA-2', 'forged',
             '00000000-0000-0000-0000-00000000000b') $$,
  '42501', null,
  'A cannot spoof tasks.created_by within its own workspace');
select lives_ok(
  $$ insert into tasks (project_id, ref, title, created_by)
     values ('00000000-0000-0000-0000-0000000000a2', 'PA-3', 'mine',
             '00000000-0000-0000-0000-00000000000a') $$,
  'A can create a task as itself in its own workspace (creator pin is not deny-all)');

-- Cross-workspace task insert is denied (prior review noted this path was
-- untested). The SECURITY INVOKER trigger cannot resolve WS-B's project for A,
-- so workspace_id resolves NULL and the write is rejected (any error code).
select throws_ok(
  $$ insert into tasks (project_id, ref, title, created_by)
     values ('00000000-0000-0000-0000-0000000000b2', 'PB-2', 'cross',
             '00000000-0000-0000-0000-00000000000a') $$,
  null::text, null,
  'A cannot create a task in a WS-B project (cross-workspace)');

-- ---------------------------------------------------------------------------
-- Security review fix 1: profile reads are scoped to self + co-workspace
-- members, not the whole tenant base. A and B share no workspace; A and C are
-- both members of WS-A.
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select 1 from profiles where id = '00000000-0000-0000-0000-00000000000b' $$,
  'A cannot read B''s profile (no shared workspace)');
select is(
  (select count(*) from profiles
   where id = '00000000-0000-0000-0000-00000000000a')::int, 1,
  'A can read its own profile (positive control)');
select is(
  (select count(*) from profiles
   where id = '00000000-0000-0000-0000-00000000000c')::int, 1,
  'A can read co-member C''s profile (shares_workspace positive path)');

-- Positive control for the owner/admin delete gate: an owner CAN delete a
-- project, so the member-denied delete asserted below is a role gate rather
-- than a blanket deny. A is owner of WS-A; PD is a throwaway WS-A project.
with del as (
  delete from projects
  where id = '00000000-0000-0000-0000-0000000000a9'
  returning 1)
select is(
  (select count(*)::int from del), 1,
  'owner A can delete a project (proj_delete is not deny-all)');

-- ---------------------------------------------------------------------------
-- Security fix 2: comment_update/_delete authorize via the parent task's
-- workspace, not author_id alone. Otherwise the author could re-parent their
-- own comment into another workspace's thread (cross-tenant write), and a
-- former member could still edit/delete old comments after losing access.
-- A still impersonated. a5 is A's comment on WS-A task a3; b3 is a WS-B task.
-- ---------------------------------------------------------------------------
-- The exploit: A re-parents its own comment into a WS-B task. The WITH CHECK
-- must reject it (A is not a member of b3's workspace) -> 42501.
select throws_ok(
  $$ update comments set task_id = '00000000-0000-0000-0000-0000000000b3'
     where id = '00000000-0000-0000-0000-0000000000a5' $$,
  '42501', null,
  'A cannot re-parent its own comment into a WS-B task (cross-tenant write)');

-- A non-author in another workspace cannot touch A's comment. USING is
-- author-scoped, so these are RLS-filtered to zero rows (no-op, not an error).
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000b','role','authenticated')::text,
  true);
with upd as (
  update comments set body = 'hacked by B'
  where id = '00000000-0000-0000-0000-0000000000a5'
  returning 1)
select is(
  (select count(*)::int from upd), 0,
  'B cannot update A''s comment (author-scoped, no-op)');
with del as (
  delete from comments
  where id = '00000000-0000-0000-0000-0000000000a5'
  returning 1)
select is(
  (select count(*)::int from del), 0,
  'B cannot delete A''s comment (author-scoped, no-op)');

-- Positive controls: the author CAN still edit and delete its own comment
-- within its own workspace -- so the membership predicate is not deny-all.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000a','role','authenticated')::text,
  true);
with upd as (
  update comments set body = 'edited by A'
  where id = '00000000-0000-0000-0000-0000000000a5'
  returning 1)
select is(
  (select count(*)::int from upd), 1,
  'A can edit its own comment body in its own workspace (not deny-all)');
with del as (
  delete from comments
  where id = '00000000-0000-0000-0000-0000000000a5'
  returning 1)
select is(
  (select count(*)::int from del), 1,
  'A can delete its own comment in its own workspace (not deny-all)');

-- ---------------------------------------------------------------------------
-- Impersonate user C (plain member of WS-A): read yes, privileged delete no.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000c','role','authenticated')::text,
  true);

select is(
  (select count(*) from projects
   where id = '00000000-0000-0000-0000-0000000000a2')::int, 1,
  'member C can read its workspace project');

-- Role gate: only owner/admin may delete a project. C is a member, so the
-- DELETE is RLS-filtered to zero rows (USING hides the row; no row deleted).
with del as (
  delete from projects
  where id = '00000000-0000-0000-0000-0000000000a2'
  returning 1)
select is(
  (select count(*)::int from del), 0,
  'plain member cannot delete a project (owner/admin only)');

-- ---------------------------------------------------------------------------
-- Task delete policy (make-it-adoptable): members delete inside their own
-- workspace; cross-workspace deletes are RLS-filtered to no-ops. Coverage
-- backfill — the policy shipped in 0002 but was never asserted.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000a','role','authenticated')::text,
  true);
with del as (
  delete from tasks where id = '00000000-0000-0000-0000-0000000000b3' returning 1)
select is(
  (select count(*)::int from del), 0,
  'A cannot delete a WS-B task (RLS-filtered no-op)');
with del as (
  delete from tasks where id = '00000000-0000-0000-0000-0000000000a3' returning 1)
select is(
  (select count(*)::int from del), 1,
  'A can delete a task in its own workspace (task_delete is not deny-all)');

-- ---------------------------------------------------------------------------
-- handle_new_user (0004): name coalesces OAuth metadata variants; the demo
-- auto-join is pinned to the seed workspace UUID, so a workspace merely NAMED
-- 'Northwind' attracts nothing. The demo row is ensured here (idempotent
-- whether or not seed.sql ran); the decoy shares only the name.
-- ---------------------------------------------------------------------------
set local role postgres;
insert into workspaces (id, name, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'Northwind', null)
  on conflict (id) do nothing;
insert into workspaces (id, name, created_by) values
  ('00000000-0000-0000-0000-0000000000d1', 'Northwind', null);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'd@test.dev',
   '{"full_name": "Dee Fixture"}'::jsonb);

select is(
  (select name from profiles where id = '00000000-0000-0000-0000-00000000000d'),
  'Dee Fixture',
  'handle_new_user coalesces full_name into profiles.name (OAuth variance)');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', 'e@test.dev',
   '{"name": "", "full_name": "Guarded Name"}'::jsonb);
select is(
  (select name from profiles where id = '00000000-0000-0000-0000-00000000000e'),
  'Guarded Name',
  'handle_new_user: an empty name key does not shadow full_name (nullif guard)');

select is(
  (select count(*) from workspace_members
   where user_id = '00000000-0000-0000-0000-00000000000d'
     and workspace_id = '20000000-0000-0000-0000-000000000001')::int, 1,
  'new signup auto-joins the demo workspace by fixed UUID');
select is(
  (select count(*) from workspace_members
   where user_id = '00000000-0000-0000-0000-00000000000d'
     and workspace_id = '00000000-0000-0000-0000-0000000000d1')::int, 0,
  'a workspace merely named Northwind attracts no auto-joins');

-- ---------------------------------------------------------------------------
-- RLS hardening (0005, docs/AUDIT.md finding 3). Membership-only UPDATE
-- policies plus blanket UPDATE grants let a DUAL-workspace member re-parent
-- rows across tenants (task -> other workspace's project, subtask/comment ->
-- other workspace's task, project -> other workspace) and rewrite provenance
-- (created_by, ref, ids, timestamps). 0005 revokes table-level UPDATE and
-- re-grants only content columns, so those writes fail 42501 at the privilege
-- gate. F is a member of BOTH WS-A and WS-B, so every denial below is a
-- column lock, not membership scoping (the first assertion proves it).
-- ---------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000f', 'f@test.dev');
-- Dual membership: F belongs to both fixture workspaces. Strip anything else
-- (handle_new_user auto-joined F to the demo workspace ensured above).
insert into workspace_members (workspace_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000f', 'member'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000f', 'member');
delete from workspace_members
  where user_id = '00000000-0000-0000-0000-00000000000f'
    and workspace_id not in ('00000000-0000-0000-0000-0000000000a1',
                             '00000000-0000-0000-0000-0000000000b1');

-- Fresh WS-A rows (a3/a4/a5 were consumed by the delete tests above).
-- updated_at is explicitly backdated: 0003 touches it on UPDATE only, so the
-- insert keeps 2020 and the touch assertion below can see the trigger reset it.
insert into tasks (id, project_id, workspace_id, ref, title, created_by, updated_at) values
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000a1', 'PA-9', 'hardening fixture',
   '00000000-0000-0000-0000-00000000000a', '2020-01-01');
insert into subtasks (id, task_id, title) values
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a6', 'sub f');
insert into comments (id, task_id, author_id, body) values
  ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000a6',
   '00000000-0000-0000-0000-00000000000f', 'f comment');
insert into task_tags (task_id, tag) values
  ('00000000-0000-0000-0000-0000000000a6', 'Frontend');

-- Impersonate dual-member F.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000f','role','authenticated')::text,
  true);

-- Positive controls first: the dual membership is real, and every column the
-- app legitimately writes stays writable (guards against over-revoking).
select is(
  (select count(*) from tasks where id in
    ('00000000-0000-0000-0000-0000000000a6','00000000-0000-0000-0000-0000000000b3'))::int, 2,
  'F reads tasks in BOTH workspaces (dual membership is real, not scoping)');
select lives_ok(
  $$ update tasks set
       status = 'todo', priority = 'high', type = 'bug', title = 'renamed',
       description = 'd', points = 3, position = 5,
       start_date = '2026-07-01', end_date = '2026-07-05',
       assignee_id = '00000000-0000-0000-0000-00000000000f'
     where id = '00000000-0000-0000-0000-0000000000a6' $$,
  'F can update every app-editable task column (content grant not over-revoked)');
select isnt(
  (select updated_at from tasks where id = '00000000-0000-0000-0000-0000000000a6'),
  '2020-01-01 00:00:00+00'::timestamptz,
  'updated_at is server-maintained on update (0003 trigger still fires)');
select lives_ok(
  $$ update projects set name = 'renamed', color = '#123456'
     where id = '00000000-0000-0000-0000-0000000000a2' $$,
  'F can update project content columns (name/color)');
select lives_ok(
  $$ update subtasks set title = 'renamed', done = true, position = 2
     where id = '00000000-0000-0000-0000-0000000000a7' $$,
  'F can update subtask content columns (title/done/position)');
select lives_ok(
  $$ update profiles set name = 'Eff', color = '#000000'
     where id = '00000000-0000-0000-0000-00000000000f' $$,
  'F can update its own profile content columns (name/color)');

-- Tasks: tenancy, parentage, identity and provenance are locked.
select throws_ok(
  $$ update tasks set project_id = '00000000-0000-0000-0000-0000000000b2'
     where id = '00000000-0000-0000-0000-0000000000a6' $$,
  '42501', null,
  'dual-member F cannot re-parent a task into a WS-B project (project_id locked)');
select throws_ok(
  $$ update tasks set workspace_id = '00000000-0000-0000-0000-0000000000b1'
     where id = '00000000-0000-0000-0000-0000000000a6' $$,
  '42501', null,
  'F cannot write tasks.workspace_id directly (tenant key locked)');
select throws_ok(
  $$ update tasks set created_by = '00000000-0000-0000-0000-00000000000b'
     where id = '00000000-0000-0000-0000-0000000000a6' $$,
  '42501', null,
  'F cannot rewrite tasks.created_by (provenance locked)');
select throws_ok(
  $$ update tasks set ref = 'PA-999'
     where id = '00000000-0000-0000-0000-0000000000a6' $$,
  '42501', null,
  'F cannot rewrite tasks.ref (task identity locked)');
select throws_ok(
  $$ update tasks set id = '00000000-0000-0000-0000-0000000000ff'
     where id = '00000000-0000-0000-0000-0000000000a6' $$,
  '42501', null,
  'F cannot rewrite tasks.id (primary key locked)');
select throws_ok(
  $$ update tasks set created_at = now() - interval '1 day'
     where id = '00000000-0000-0000-0000-0000000000a6' $$,
  '42501', null,
  'F cannot backdate tasks.created_at (timestamp locked)');
select throws_ok(
  $$ update tasks set updated_at = now() - interval '1 day'
     where id = '00000000-0000-0000-0000-0000000000a6' $$,
  '42501', null,
  'F cannot write tasks.updated_at (trigger is the only writer)');

-- Projects: tenant key and ref-prefix key are locked.
select throws_ok(
  $$ update projects set workspace_id = '00000000-0000-0000-0000-0000000000b1'
     where id = '00000000-0000-0000-0000-0000000000a2' $$,
  '42501', null,
  'dual-member F cannot move a project into WS-B (workspace_id locked)');
select throws_ok(
  $$ update projects set key = 'ZZ'
     where id = '00000000-0000-0000-0000-0000000000a2' $$,
  '42501', null,
  'F cannot rewrite projects.key (task-ref prefix locked)');

-- Child tables: parent keys are locked, so a dual member cannot re-parent
-- children across tenants (the membership WITH CHECK alone would allow it).
select throws_ok(
  $$ update subtasks set task_id = '00000000-0000-0000-0000-0000000000b3'
     where id = '00000000-0000-0000-0000-0000000000a7' $$,
  '42501', null,
  'dual-member F cannot re-parent a subtask onto a WS-B task (task_id locked)');
select throws_ok(
  $$ update comments set task_id = '00000000-0000-0000-0000-0000000000b3'
     where id = '00000000-0000-0000-0000-0000000000a8' $$,
  '42501', null,
  'dual-member author F cannot re-parent own comment onto a WS-B task (task_id locked)');
select throws_ok(
  $$ update comments set created_at = now() - interval '1 day'
     where id = '00000000-0000-0000-0000-0000000000a8' $$,
  '42501', null,
  'F cannot backdate comments.created_at (thread order locked)');
select throws_ok(
  $$ update comments set author_id = '00000000-0000-0000-0000-00000000000b'
     where id = '00000000-0000-0000-0000-0000000000a8' $$,
  '42501', null,
  'F cannot rewrite comments.author_id (authorship locked at privilege level)');
select throws_ok(
  $$ update task_tags set task_id = '00000000-0000-0000-0000-0000000000b3'
     where task_id = '00000000-0000-0000-0000-0000000000a6' $$,
  '42501', null,
  'F cannot re-parent task_tags (tags are delete+insert, UPDATE revoked)');

-- ---------------------------------------------------------------------------
-- Server-side ref allocation (0006, docs/AUDIT.md finding 4). create_task()
-- is SECURITY DEFINER (the per-project counter column is not client-writable
-- under 0005), so it must enforce membership and authorship itself: refs
-- allocate sequentially under the project row lock, skip refs taken out of
-- band, and non-members are rejected. New projects start at KEY-101.
-- F (dual member) is still impersonated from the section above.
-- ---------------------------------------------------------------------------
select is(
  (create_task('00000000-0000-0000-0000-0000000000a2', 'rpc one')).ref,
  'PA-101',
  'create_task allocates the first ref from the project counter (KEY-101)');
select is(
  (create_task('00000000-0000-0000-0000-0000000000a2', 'rpc two')).ref,
  'PA-102',
  'create_task allocates sequential refs');
select is(
  (select count(*) from tasks
   where project_id = '00000000-0000-0000-0000-0000000000a2'
     and ref in ('PA-101','PA-102')
     and created_by = '00000000-0000-0000-0000-00000000000f'
     and workspace_id = '00000000-0000-0000-0000-0000000000a1')::int, 2,
  'create_task pins created_by to the caller and derives workspace_id');

-- An out-of-band insert takes the next number; the allocator skips past it
-- instead of failing on the unique constraint.
set local role postgres;
insert into tasks (project_id, workspace_id, ref, title, created_by) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1',
   'PA-103', 'squatter', '00000000-0000-0000-0000-00000000000a');
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000f','role','authenticated')::text,
  true);
select is(
  (create_task('00000000-0000-0000-0000-0000000000a2', 'rpc after squat')).ref,
  'PA-104',
  'create_task skips a ref taken out of band (no collision failure)');

-- Membership is enforced inside the definer function.
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000a','role','authenticated')::text,
  true);
select throws_ok(
  $$ select create_task('00000000-0000-0000-0000-0000000000b2', 'cross') $$,
  '42501', null,
  'create_task rejects a caller who is not a member of the project''s workspace');
select is(
  (create_task('00000000-0000-0000-0000-0000000000a2', 'by A')).ref,
  'PA-105',
  'create_task works for any member of the workspace (not deny-all)');

select * from finish();
rollback;

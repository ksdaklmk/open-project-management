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
select plan(11);

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

insert into projects (id, workspace_id, name, key) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'PA', 'PA'),
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

-- ---------------------------------------------------------------------------
-- Impersonate user A (owner of WS-A). A must be fully isolated from WS-B.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000a','role','authenticated')::text,
  true);

-- SELECT isolation on tasks (the brief's two assertions).
select is(
  (select count(*) from tasks)::int, 1,
  'A sees only their own workspace tasks');
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

select * from finish();
rollback;

-- supabase/tests/schema_test.sql
-- Domain-invariant CHECKs and attribution FK behaviour (0007, docs/AUDIT.md
-- findings 6 & 8). Run like rls_test.sql:
--   podman exec -i supabase_db_open-project-management \
--     psql -U postgres -d postgres < supabase/tests/schema_test.sql
--
-- Runs as postgres: CHECK constraints and FK actions apply to every role, so
-- no RLS impersonation fixture is needed.

begin;
select plan(12);
set local role postgres;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000091', 'schema@test.dev');
insert into workspaces (id, name, created_by) values
  ('00000000-0000-0000-0000-000000000092', 'SX', '00000000-0000-0000-0000-000000000091');
insert into workspace_members (workspace_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000091', 'owner');
insert into projects (id, workspace_id, name, key) values
  ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000092', 'SX', 'SX');
insert into tasks (id, project_id, workspace_id, ref, title, created_by) values
  ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000093',
   '00000000-0000-0000-0000-000000000092', 'SX-101', 'fixture',
   '00000000-0000-0000-0000-000000000091');
insert into comments (id, task_id, author_id, body) values
  ('00000000-0000-0000-0000-000000000095', '00000000-0000-0000-0000-000000000094',
   '00000000-0000-0000-0000-000000000091', 'hello');
insert into activity (workspace_id, actor_id, verb, task_id) values
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000091',
   'created', '00000000-0000-0000-0000-000000000094');

-- ---------------------------------------------------------------------------
-- Domain CHECKs: the DB is the trust boundary for values that corrupt
-- Workload sums and Gantt geometry.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into tasks (project_id, workspace_id, ref, title, created_by) values
     ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000092',
      'SX-102', '   ', '00000000-0000-0000-0000-000000000091') $$,
  '23514', null,
  'a blank task title is rejected');
select throws_ok(
  $$ update tasks set points = -1
     where id = '00000000-0000-0000-0000-000000000094' $$,
  '23514', null,
  'negative task points are rejected');
select throws_ok(
  $$ update tasks set start_date = '2026-07-10', end_date = '2026-07-01'
     where id = '00000000-0000-0000-0000-000000000094' $$,
  '23514', null,
  'a reversed task date range is rejected');
select throws_ok(
  $$ update tasks set start_date = '9999-01-01'
     where id = '00000000-0000-0000-0000-000000000094' $$,
  '23514', null,
  'an absurd task date is rejected');
select lives_ok(
  $$ update tasks set points = 0, start_date = '2026-07-10', end_date = '2026-07-10'
     where id = '00000000-0000-0000-0000-000000000094' $$,
  'zero points and a single-day range are valid (checks are not over-tight)');
select throws_ok(
  $$ insert into comments (task_id, author_id, body) values
     ('00000000-0000-0000-0000-000000000094',
      '00000000-0000-0000-0000-000000000091', '  ') $$,
  '23514', null,
  'a blank comment body is rejected');
select throws_ok(
  $$ insert into subtasks (task_id, title) values
     ('00000000-0000-0000-0000-000000000094', '') $$,
  '23514', null,
  'a blank subtask title is rejected');
select throws_ok(
  $$ update workspace_members set capacity_per_week = -1
     where user_id = '00000000-0000-0000-0000-000000000091' $$,
  '23514', null,
  'a negative member capacity is rejected');

-- ---------------------------------------------------------------------------
-- Attribution FKs: deleting an auth user (cascades to the profile) must not
-- be blocked by historical rows; history survives with null attribution.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-000000000091' $$,
  'an auth user with authored history can be deleted');
select is(
  (select created_by from tasks where id = '00000000-0000-0000-0000-000000000094'),
  null,
  'tasks.created_by nulls out when the profile is deleted');
select is(
  (select author_id from comments where id = '00000000-0000-0000-0000-000000000095'),
  null,
  'comments.author_id nulls out when the profile is deleted');
select is(
  (select count(*) from activity
   where workspace_id = '00000000-0000-0000-0000-000000000092' and actor_id is null)::int,
  1,
  'activity.actor_id nulls out when the profile is deleted');

select * from finish();
rollback;

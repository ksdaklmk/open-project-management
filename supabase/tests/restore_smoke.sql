-- Restore-specific pgTAP smoke.
--
-- The complete database suite is intentionally run against clean migration
-- replays. A logical restore already contains application rows, so this test
-- uses isolated transactional fixtures to verify the restored database's
-- essential sign-in claims, RLS boundary, RPC write path, and task lifecycle.

begin;
select plan(8);

set local role postgres;

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-000000000001', 'restore-a@test.invalid'),
  ('f0000000-0000-0000-0000-000000000002', 'restore-b@test.invalid');

insert into profiles (id, name) values
  ('f0000000-0000-0000-0000-000000000001', 'Restore A'),
  ('f0000000-0000-0000-0000-000000000002', 'Restore B')
on conflict (id) do nothing;

insert into workspaces (id, name, created_by) values
  ('f0000000-0000-0000-0000-000000000011', 'Restore workspace A',
   'f0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000012', 'Restore workspace B',
   'f0000000-0000-0000-0000-000000000002');

insert into workspace_members (workspace_id, user_id, role) values
  ('f0000000-0000-0000-0000-000000000011',
   'f0000000-0000-0000-0000-000000000001', 'owner'),
  ('f0000000-0000-0000-0000-000000000012',
   'f0000000-0000-0000-0000-000000000002', 'owner');

insert into projects (id, workspace_id, name, key) values
  ('f0000000-0000-0000-0000-000000000021',
   'f0000000-0000-0000-0000-000000000011', 'Restore project A', 'RA'),
  ('f0000000-0000-0000-0000-000000000022',
   'f0000000-0000-0000-0000-000000000012', 'Restore project B', 'RB');

insert into tasks (id, project_id, workspace_id, ref, title, created_by) values
  ('f0000000-0000-0000-0000-000000000031',
   'f0000000-0000-0000-0000-000000000021',
   'f0000000-0000-0000-0000-000000000011', 'RA-1', 'Restore task A',
   'f0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000032',
   'f0000000-0000-0000-0000-000000000022',
   'f0000000-0000-0000-0000-000000000012', 'RB-1', 'Restore task B',
   'f0000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'f0000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  (select count(*)::int from workspaces
   where id = 'f0000000-0000-0000-0000-000000000011'),
  1,
  'restored RLS allows a member to read its workspace'
);

select is_empty(
  $$ select 1 from workspaces
     where id = 'f0000000-0000-0000-0000-000000000012' $$,
  'restored RLS hides another tenant workspace'
);

select is(
  (select count(*)::int from tasks
   where workspace_id = 'f0000000-0000-0000-0000-000000000011'),
  1,
  'restored RLS allows a member to read its tasks'
);

select is_empty(
  $$ select 1 from tasks
     where workspace_id = 'f0000000-0000-0000-0000-000000000012' $$,
  'restored RLS hides another tenant tasks'
);

select lives_ok(
  $$ update tasks set title = 'Restored update works'
     where id = 'f0000000-0000-0000-0000-000000000031' $$,
  'restored task update path works'
);

select lives_ok(
  $$ select create_task(
       'f0000000-0000-0000-0000-000000000021',
       'Created after restore'
     ) $$,
  'restored create_task RPC works'
);

select throws_ok(
  $$ select create_task(
       'f0000000-0000-0000-0000-000000000022',
       'Cross-tenant create'
     ) $$,
  '42501',
  null,
  'restored create_task RPC rejects another tenant'
);

select lives_ok(
  $$ delete from tasks
     where id = 'f0000000-0000-0000-0000-000000000031' $$,
  'restored task delete path works'
);

select * from finish();
rollback;

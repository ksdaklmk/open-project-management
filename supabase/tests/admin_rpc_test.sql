-- Atomic workspace administration RPC verification.
begin;
select plan(29);
set local role postgres;

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-000000000001', 'rpc-owner@test.dev'),
  ('40000000-0000-0000-0000-000000000002', 'rpc-admin@test.dev'),
  ('40000000-0000-0000-0000-000000000003', 'rpc-member@test.dev'),
  ('40000000-0000-0000-0000-000000000004', 'rpc-outsider@test.dev');
insert into workspaces (id, name, created_by) values
  ('41000000-0000-0000-0000-000000000001', 'RPC A', '40000000-0000-0000-0000-000000000001'),
  ('41000000-0000-0000-0000-000000000002', 'RPC B', '40000000-0000-0000-0000-000000000004');
insert into workspace_members (workspace_id, user_id, role) values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'owner'),
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'admin'),
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'member'),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', 'owner');
insert into projects (id, workspace_id, name, key) values
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'RPC PA', 'RPA'),
  ('42000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'RPC PB', 'RPB');
insert into tasks (id, project_id, workspace_id, ref, title, assignee_id, created_by) values
  ('43000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001',
   '41000000-0000-0000-0000-000000000001', 'RPA-101', 'Assigned task',
   '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001'),
  ('43000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000002',
   '41000000-0000-0000-0000-000000000002', 'RPB-101', 'Sole owner task',
   '40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
select is((create_project('41000000-0000-0000-0000-000000000001', ' New project ', 'new')).key,
  'NEW', 'owner can create a project and its key is normalised');
select is((update_project('42000000-0000-0000-0000-000000000001', 'Renamed')).name,
  'Renamed', 'owner can rename a project');
select is((update_workspace('41000000-0000-0000-0000-000000000001', 'Renamed workspace')).name,
  'Renamed workspace', 'owner can rename a workspace');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-0000-0000-000000000002','role','authenticated')::text, true);
select ok((archive_project('42000000-0000-0000-0000-000000000001')).archived_at is not null,
  'admin can archive a project');
select is((set_member_capacity('41000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003', 24)).capacity_per_week, 24,
  'admin can change member capacity');
select throws_ok(
  $$ select set_member_role('41000000-0000-0000-0000-000000000001',
       '40000000-0000-0000-0000-000000000003', 'admin') $$,
  '42501', null, 'admin cannot change member roles');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-0000-0000-000000000003','role','authenticated')::text, true);
select throws_ok(
  $$ select create_project('41000000-0000-0000-0000-000000000001', 'Denied', 'DEN') $$,
  '42501', null, 'member cannot create a project');
select throws_ok(
  $$ select update_workspace('41000000-0000-0000-0000-000000000001', 'Denied') $$,
  '42501', null, 'member cannot rename a workspace');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
select throws_ok(
  $$ select update_project('42000000-0000-0000-0000-000000000002', 'Foreign') $$,
  '42501', null, 'owner cannot manage a foreign workspace project');
select is((set_member_role('41000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003', 'admin')).role, 'admin'::member_role,
  'owner can promote an admin');
select throws_ok(
  $$ select set_member_role('41000000-0000-0000-0000-000000000001',
       '40000000-0000-0000-0000-000000000003', 'owner') $$,
  '22023', null, 'owner role changes must use ownership transfer');
select is((set_member_role('41000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003', 'member')).role, 'member'::member_role,
  'owner can demote an admin');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-0000-0000-000000000002','role','authenticated')::text, true);
select is((remove_workspace_member('41000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003')).unassigned_task_count, 1::bigint,
  'admin removal reports the tasks it unassigned');
select is((select count(*)::int from workspace_members where workspace_id =
  '41000000-0000-0000-0000-000000000001' and user_id =
  '40000000-0000-0000-0000-000000000003'), 0, 'member removal deletes membership');
select is((select assignee_id from tasks where id = '43000000-0000-0000-0000-000000000001'),
  null, 'member removal atomically unassigns tasks');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
select is((transfer_workspace_ownership('41000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002')).new_owner_id,
  '40000000-0000-0000-0000-000000000002'::uuid, 'owner can transfer ownership to a member');
select is((select role from workspace_members where workspace_id =
  '41000000-0000-0000-0000-000000000001' and user_id =
  '40000000-0000-0000-0000-000000000001'), 'admin'::member_role,
  'previous owner becomes admin after transfer');
select is((select role from workspace_members where workspace_id =
  '41000000-0000-0000-0000-000000000001' and user_id =
  '40000000-0000-0000-0000-000000000002'), 'owner'::member_role,
  'new owner is promoted atomically');
select throws_ok(
  $$ select transfer_workspace_ownership('41000000-0000-0000-0000-000000000001',
       '40000000-0000-0000-0000-000000000004') $$,
  '42501', null, 'former owner cannot transfer ownership again');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
select throws_ok(
  $$ select remove_workspace_member('41000000-0000-0000-0000-000000000002',
       '40000000-0000-0000-0000-000000000004') $$,
  '23514', null, 'sole owner removal is rejected');
select is((select assignee_id from tasks where id = '43000000-0000-0000-0000-000000000002'),
  '40000000-0000-0000-0000-000000000004'::uuid,
  'failed sole owner removal rolls back task unassignment');
select lives_ok(
  $$ select create_workspace('Client workspace', 'First project', 'fst') $$,
  'authenticated user can create a workspace atomically');
select is((select count(*)::int from workspace_members where user_id =
  '40000000-0000-0000-0000-000000000004' and role = 'owner'), 2,
  'workspace creation adds the caller as owner');
select is((select count(*)::int from projects where key = 'FST'), 1,
  'workspace creation adds the initial project');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$ select create_workspace('x','x','x') $$, '42501', null,
  'anonymous caller cannot create a workspace');
select throws_ok($$ select create_project(gen_random_uuid(),'x','x') $$, '42501', null,
  'anonymous caller cannot create a project');
select throws_ok($$ select set_member_capacity(gen_random_uuid(),gen_random_uuid(),40) $$,
  '42501', null, 'anonymous caller cannot administer members');
select throws_ok($$ select remove_workspace_member(gen_random_uuid(),gen_random_uuid()) $$,
  '42501', null, 'anonymous caller cannot remove members');
select throws_ok($$ select transfer_workspace_ownership(gen_random_uuid(),gen_random_uuid()) $$,
  '42501', null, 'anonymous caller cannot transfer ownership');

select * from finish(true);
rollback;

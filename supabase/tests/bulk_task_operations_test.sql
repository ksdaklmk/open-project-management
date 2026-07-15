-- Phase 2 bulk operations: preflight, permission isolation, atomic batches,
-- archive visibility, project/date/tag handling, and conflict-safe undo.
begin;
select plan(55);
set local role postgres;

insert into auth.users (id, email) values
  ('27000000-0000-4000-8000-000000000001', 'bulk-owner@test.dev'),
  ('27000000-0000-4000-8000-000000000002', 'bulk-member@test.dev'),
  ('27000000-0000-4000-8000-000000000003', 'bulk-outsider@test.dev'),
  ('27000000-0000-4000-8000-000000000004', 'bulk-former-member@test.dev');
insert into workspaces (id, name, created_by) values
  ('27100000-0000-4000-8000-000000000011', 'Bulk A', '27000000-0000-4000-8000-000000000001'),
  ('27100000-0000-4000-8000-000000000012', 'Bulk B', '27000000-0000-4000-8000-000000000003');
insert into workspace_members (workspace_id, user_id, role) values
  ('27100000-0000-4000-8000-000000000011', '27000000-0000-4000-8000-000000000001', 'owner'),
  ('27100000-0000-4000-8000-000000000011', '27000000-0000-4000-8000-000000000002', 'member'),
  ('27100000-0000-4000-8000-000000000011', '27000000-0000-4000-8000-000000000004', 'member'),
  ('27100000-0000-4000-8000-000000000012', '27000000-0000-4000-8000-000000000003', 'owner');
insert into projects (id, workspace_id, name, key) values
  ('27200000-0000-4000-8000-000000000101', '27100000-0000-4000-8000-000000000011', 'Alpha', 'ALP'),
  ('27200000-0000-4000-8000-000000000102', '27100000-0000-4000-8000-000000000011', 'Beta', 'BET'),
  ('27200000-0000-4000-8000-000000000103', '27100000-0000-4000-8000-000000000012', 'Foreign', 'FOR'),
  ('27200000-0000-4000-8000-000000000104', '27100000-0000-4000-8000-000000000011', 'Retiring', 'RET');
insert into tasks (
  id, project_id, workspace_id, ref, title, status, priority, assignee_id,
  start_date, end_date, points, position, created_by
) values
  ('27300000-0000-4000-8000-000000000101', '27200000-0000-4000-8000-000000000101',
   '27100000-0000-4000-8000-000000000011', 'ALP-101', 'First', 'todo', 'medium',
   '27000000-0000-4000-8000-000000000002', '2026-07-10', '2026-07-20', 5, 1024,
   '27000000-0000-4000-8000-000000000001'),
  ('27300000-0000-4000-8000-000000000102', '27200000-0000-4000-8000-000000000101',
   '27100000-0000-4000-8000-000000000011', 'ALP-102', 'Second', 'done', 'high',
   null, '2026-08-01', '2026-08-10', 3, 2048,
   '27000000-0000-4000-8000-000000000001'),
  ('27300000-0000-4000-8000-000000000103', '27200000-0000-4000-8000-000000000102',
   '27100000-0000-4000-8000-000000000011', 'ALP-101', 'Conflict', 'backlog', 'low',
   null, null, null, null, 1024, '27000000-0000-4000-8000-000000000001'),
  ('27300000-0000-4000-8000-000000000104', '27200000-0000-4000-8000-000000000103',
   '27100000-0000-4000-8000-000000000012', 'FOR-101', 'Foreign', 'todo', 'medium',
   null, null, null, 2, 1024, '27000000-0000-4000-8000-000000000003'),
  ('27300000-0000-4000-8000-000000000106', '27200000-0000-4000-8000-000000000101',
   '27100000-0000-4000-8000-000000000011', 'ALP-106', 'Former assignee', 'todo', 'medium',
   '27000000-0000-4000-8000-000000000004', null, null, null, 3072,
   '27000000-0000-4000-8000-000000000001'),
  ('27300000-0000-4000-8000-000000000107', '27200000-0000-4000-8000-000000000104',
   '27100000-0000-4000-8000-000000000011', 'RET-107', 'Retiring project', 'todo', 'medium',
   null, null, null, null, 1024, '27000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','27000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);

select is((select requested_count from preflight_bulk_task_action(
  '27100000-0000-4000-8000-000000000011', array[
    '27300000-0000-4000-8000-000000000101',
    '27300000-0000-4000-8000-000000000102',
    '27300000-0000-4000-8000-000000000104']::uuid[],
  '{"kind":"status","value":"done"}'::jsonb)), 3, 'preflight reports the requested count');
select is((select will_change_count from preflight_bulk_task_action(
  '27100000-0000-4000-8000-000000000011', array[
    '27300000-0000-4000-8000-000000000101',
    '27300000-0000-4000-8000-000000000102',
    '27300000-0000-4000-8000-000000000104']::uuid[],
  '{"kind":"status","value":"done"}'::jsonb)), 1, 'preflight counts changes');
select is((select unchanged_count from preflight_bulk_task_action(
  '27100000-0000-4000-8000-000000000011', array[
    '27300000-0000-4000-8000-000000000101',
    '27300000-0000-4000-8000-000000000102',
    '27300000-0000-4000-8000-000000000104']::uuid[],
  '{"kind":"status","value":"done"}'::jsonb)), 1, 'preflight counts unchanged tasks');
select is((select skipped_count from preflight_bulk_task_action(
  '27100000-0000-4000-8000-000000000011', array[
    '27300000-0000-4000-8000-000000000101',
    '27300000-0000-4000-8000-000000000102',
    '27300000-0000-4000-8000-000000000104']::uuid[],
  '{"kind":"status","value":"done"}'::jsonb)), 1, 'foreign ids are unavailable without leaking them');

select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000001',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000101','27300000-0000-4000-8000-000000000102']::uuid[],
  '{"kind":"priority","value":"low"}'::jsonb)), 2, 'ordinary members may bulk-edit tasks');
select is((select count(*)::int from tasks where id in (
  '27300000-0000-4000-8000-000000000101','27300000-0000-4000-8000-000000000102')
  and priority = 'low'), 2, 'one batch updates every eligible task atomically');
select is((select actor_id from task_bulk_operations where id =
  '27400000-0000-4000-8000-000000000001'),
  '27000000-0000-4000-8000-000000000002'::uuid, 'the operation journal pins the actor');
select throws_ok(
  $$ insert into task_bulk_operations (id, workspace_id, actor_id, action) values
     ('27400000-0000-4000-8000-000000000099',
      '27100000-0000-4000-8000-000000000011',
      '27000000-0000-4000-8000-000000000002', '{"kind":"archive"}') $$,
  '42501', null, 'clients cannot forge operation history');

select is((select skipped_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000002',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000104']::uuid[],
  '{"kind":"archive"}'::jsonb)), 1, 'a foreign-only batch is skipped without leaking rows');
select is((select archived_at from tasks where id =
  '27300000-0000-4000-8000-000000000104'), null, 'foreign tasks remain unchanged');

select set_config('request.jwt.claims',
  json_build_object('sub','27000000-0000-4000-8000-000000000003','role','authenticated')::text,
  true);
select throws_ok(
  $$ select preflight_bulk_task_action(
     '27100000-0000-4000-8000-000000000011',
     array['27300000-0000-4000-8000-000000000101']::uuid[],
     '{"kind":"archive"}'::jsonb) $$,
  '42501', null, 'non-members cannot preflight another tenant');

select set_config('request.jwt.claims',
  json_build_object('sub','27000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select throws_ok(
  $$ select preflight_bulk_task_action(
     '27100000-0000-4000-8000-000000000011',
     array['27300000-0000-4000-8000-000000000101']::uuid[],
     '{"kind":"assignee","value":"27000000-0000-4000-8000-000000000003"}'::jsonb) $$,
  '22023', null, 'bulk assignment rejects non-members');
select is((select skipped_count from preflight_bulk_task_action(
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000101']::uuid[],
  '{"kind":"project","value":"27200000-0000-4000-8000-000000000102"}'::jsonb)),
  1, 'project preflight detects a ref collision');
select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000003',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000102']::uuid[],
  '{"kind":"project","value":"27200000-0000-4000-8000-000000000102"}'::jsonb)),
  1, 'a same-workspace project move succeeds');
select is((select project_id from tasks where id = '27300000-0000-4000-8000-000000000102'),
  '27200000-0000-4000-8000-000000000102'::uuid, 'project move changes the parent');
select is((select workspace_id from tasks where id = '27300000-0000-4000-8000-000000000102'),
  '27100000-0000-4000-8000-000000000011'::uuid, 'project move preserves tenant identity');

select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000004',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000101']::uuid[],
  '{"kind":"archive"}'::jsonb)), 1, 'archive is a reversible task change');
select is_empty(
  $$ select 1 from query_tasks('27100000-0000-4000-8000-000000000011')
     where id = '27300000-0000-4000-8000-000000000101' $$,
  'archived tasks leave active task queries');
select is_empty(
  $$ select 1 from query_my_work() where id = '27300000-0000-4000-8000-000000000101' $$,
  'archived tasks leave My Work');
select is((select restored_count from undo_bulk_task_action(
  '27400000-0000-4000-8000-000000000004')), 1, 'archive can be undone');
select is((select count(*)::int from query_tasks(
  '27100000-0000-4000-8000-000000000011')
  where id = '27300000-0000-4000-8000-000000000101'), 1, 'undo restores active visibility');

select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000005',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000101']::uuid[],
  '{"kind":"priority","value":"urgent"}'::jsonb)), 1, 'a reversible priority action succeeds');
update tasks set priority = 'high' where id = '27300000-0000-4000-8000-000000000101';
select is((select conflict_count from undo_bulk_task_action(
  '27400000-0000-4000-8000-000000000005')), 1, 'undo skips a newer edit to the same field');
select is((select priority from tasks where id = '27300000-0000-4000-8000-000000000101'),
  'high'::task_priority, 'conflict-safe undo preserves the newer value');

select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000006',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000101']::uuid[],
  '{"kind":"tag_add","value":"Backend"}'::jsonb)), 1, 'bulk tag add succeeds');
insert into task_tags (task_id, tag) values
  ('27300000-0000-4000-8000-000000000101', 'Mobile');
select is((select conflict_count from undo_bulk_task_action(
  '27400000-0000-4000-8000-000000000006')), 1, 'tag undo detects a newer tag edit');
select is((select count(*)::int from task_tags where task_id =
  '27300000-0000-4000-8000-000000000101'), 2, 'tag conflict preserves the complete newer set');

select is((select skipped_count from preflight_bulk_task_action(
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000101']::uuid[],
  '{"kind":"start_date","value":"2026-07-21"}'::jsonb)), 1,
  'date preflight skips rows whose existing range would become invalid');
select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000007',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000101']::uuid[],
  '{"kind":"clear_dates"}'::jsonb)), 1, 'both dates can be cleared atomically');
select is((select start_date is null and end_date is null from tasks where id =
  '27300000-0000-4000-8000-000000000101'), true, 'clear dates changes both fields together');
select is((select restored_count from undo_bulk_task_action(
  '27400000-0000-4000-8000-000000000007')), 1, 'date clearing can be undone');
select is((select start_date::text || '/' || end_date::text from tasks where id =
  '27300000-0000-4000-8000-000000000101'), '2026-07-10/2026-07-20',
  'date undo restores the exact range');

select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000011',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000101']::uuid[],
  '{"kind":"start_date","value":"2026-07-01"}'::jsonb)), 1,
  'a single-date action records a reversible change');
update tasks set end_date = '2026-07-05'
where id = '27300000-0000-4000-8000-000000000101';
select is((select conflict_count from undo_bulk_task_action(
  '27400000-0000-4000-8000-000000000011')), 1,
  'undo skips a prior date that conflicts with a newer opposite date');
select is((select start_date::text || '/' || end_date::text from tasks where id =
  '27300000-0000-4000-8000-000000000101'), '2026-07-01/2026-07-05',
  'date dependency conflict preserves the valid newer range');

select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000012',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000106']::uuid[],
  '{"kind":"assignee","value":null}'::jsonb)), 1,
  'clearing an assignee records the prior member');
set local role postgres;
delete from workspace_members
where workspace_id = '27100000-0000-4000-8000-000000000011'
  and user_id = '27000000-0000-4000-8000-000000000004';
set local role authenticated;
select is((select conflict_count from undo_bulk_task_action(
  '27400000-0000-4000-8000-000000000012')), 1,
  'undo skips an assignee who is no longer a workspace member');
select is((select assignee_id from tasks where id =
  '27300000-0000-4000-8000-000000000106'), null,
  'assignee dependency conflict leaves the task unassigned');

select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000013',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000107']::uuid[],
  '{"kind":"project","value":"27200000-0000-4000-8000-000000000101"}'::jsonb)), 1,
  'moving from an active project records the prior parent');
set local role postgres;
update projects set archived_at = now()
where id = '27200000-0000-4000-8000-000000000104';
set local role authenticated;
select is((select conflict_count from undo_bulk_task_action(
  '27400000-0000-4000-8000-000000000013')), 1,
  'undo skips a project that became archived');
select is((select project_id from tasks where id =
  '27300000-0000-4000-8000-000000000107'),
  '27200000-0000-4000-8000-000000000101'::uuid,
  'project dependency conflict preserves the active parent');

set local role postgres;
insert into tasks (id, project_id, workspace_id, ref, title, created_by) values
  ('27300000-0000-4000-8000-000000000105', '27200000-0000-4000-8000-000000000101',
   '27100000-0000-4000-8000-000000000011', 'ALP-DELETE', 'Delete me',
   '27000000-0000-4000-8000-000000000002');
set local role authenticated;
select is((select changed_count from apply_bulk_task_action(
  '27400000-0000-4000-8000-000000000008',
  '27100000-0000-4000-8000-000000000011',
  array['27300000-0000-4000-8000-000000000105']::uuid[],
  '{"kind":"delete"}'::jsonb)), 1, 'permanent delete applies only after explicit action');
select is((select count(*)::int from tasks where id =
  '27300000-0000-4000-8000-000000000105'), 0, 'permanent delete removes the task');
select throws_ok(
  $$ select undo_bulk_task_action('27400000-0000-4000-8000-000000000008') $$,
  '22023', null, 'permanent delete is deliberately not undoable');

select throws_ok(
  $$ select apply_bulk_task_action(
     '27400000-0000-4000-8000-000000000009',
     '27100000-0000-4000-8000-000000000011',
     array(select gen_random_uuid() from generate_series(1,101)),
     '{"kind":"archive"}'::jsonb) $$,
  '22023', null, 'server batches are hard-capped at 100 tasks');
select throws_ok(
  $$ select apply_bulk_task_action(
     '27400000-0000-4000-8000-000000000010',
     '27100000-0000-4000-8000-000000000011',
     array['27300000-0000-4000-8000-000000000101',
           '27300000-0000-4000-8000-000000000101']::uuid[],
     '{"kind":"archive"}'::jsonb) $$,
  '22023', null, 'duplicate task ids are rejected before a batch starts');
select throws_ok(
  $$ select preflight_bulk_task_action(
     '27100000-0000-4000-8000-000000000011',
     array['27300000-0000-4000-8000-000000000101']::uuid[],
     '{"kind":"priority","value":"low","expression":"drop table tasks"}'::jsonb) $$,
  '22023', null, 'unknown action fields are rejected rather than interpreted');
select throws_ok(
  $$ select preflight_bulk_task_action(
     '27100000-0000-4000-8000-000000000011',
     array['27300000-0000-4000-8000-000000000101']::uuid[],
     '{"kind":"project","value":"27200000-0000-4000-8000-000000000103"}'::jsonb) $$,
  '22023', null, 'project moves reject foreign targets');

set local role postgres;
select ok((select relrowsecurity from pg_class where oid = 'task_bulk_operations'::regclass),
  'bulk operation history has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'task_bulk_operation_items'::regclass),
  'bulk item history has RLS enabled');
select ok(has_table_privilege('authenticated', 'task_bulk_operations', 'select'),
  'authenticated users receive the explicit operation-history select grant');
select ok(not has_table_privilege('authenticated', 'task_bulk_operations', 'insert'),
  'authenticated users cannot insert operation history directly');
select ok(not has_table_privilege('authenticated', 'task_bulk_operation_items', 'insert'),
  'authenticated users cannot insert operation items directly');
select ok(has_function_privilege('authenticated',
  'apply_bulk_task_action(uuid,uuid,uuid[],jsonb)', 'execute'),
  'authenticated users may execute the guarded bulk RPC');
select ok(not has_function_privilege('anon',
  'apply_bulk_task_action(uuid,uuid,uuid[],jsonb)', 'execute'),
  'anonymous users cannot execute bulk operations');

select * from finish(true);
rollback;

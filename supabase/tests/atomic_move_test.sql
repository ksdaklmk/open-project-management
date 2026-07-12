-- Atomic task ordering, complete-column neighbour validation, and activity.
begin;
select plan(19);
set local role postgres;

insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000001', 'move-member@test.dev'),
  ('70000000-0000-0000-0000-000000000002', 'move-outsider@test.dev');
insert into workspaces (id, name, created_by) values
  ('71000000-0000-0000-0000-000000000001', 'Moves A', '70000000-0000-0000-0000-000000000001'),
  ('71000000-0000-0000-0000-000000000002', 'Moves B', '70000000-0000-0000-0000-000000000002');
insert into workspace_members (workspace_id, user_id, role) values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'member'),
  ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'owner');
insert into projects (id, workspace_id, name, key) values
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'Moves A', 'MVA'),
  ('72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002', 'Moves B', 'MVB');
insert into tasks (id, project_id, workspace_id, ref, title, status, position, created_by) values
  ('73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'MVA-1', 'One', 'todo', 1024, '70000000-0000-0000-0000-000000000001'),
  ('73000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'MVA-2', 'Two hidden', 'todo', 2048, '70000000-0000-0000-0000-000000000001'),
  ('73000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'MVA-3', 'Three', 'todo', 3072, '70000000-0000-0000-0000-000000000001'),
  ('73000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'MVA-4', 'Four', 'backlog', 1024, '70000000-0000-0000-0000-000000000001'),
  ('73000000-0000-0000-0000-000000000005', '72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002', 'MVB-1', 'Foreign', 'todo', 1024, '70000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','70000000-0000-0000-0000-000000000001','role','authenticated')::text, true);

select throws_ok(
  $$ select move_task('73000000-0000-0000-0000-000000000004', 'todo',
       '73000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000003') $$,
  '40001', null, 'filtered non-adjacent neighbours are rejected as stale');
select is((select status from tasks where id = '73000000-0000-0000-0000-000000000004'),
  'backlog'::task_status, 'stale move leaves the task unchanged');
select throws_ok(
  $$ select move_task('73000000-0000-0000-0000-000000000004', 'todo', null,
       '73000000-0000-0000-0000-000000000005') $$,
  '40001', null, 'foreign neighbour is rejected without tenant disclosure');

select is((move_task('73000000-0000-0000-0000-000000000004', 'todo',
  '73000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000003')).status,
  'todo'::task_status, 'cross-column move with complete neighbours succeeds');
select cmp_ok((select position from tasks where id = '73000000-0000-0000-0000-000000000004'),
  '>', (select position from tasks where id = '73000000-0000-0000-0000-000000000002'),
  'moved task sorts after its before neighbour');
select cmp_ok((select position from tasks where id = '73000000-0000-0000-0000-000000000004'),
  '<', (select position from tasks where id = '73000000-0000-0000-0000-000000000003'),
  'moved task sorts before its after neighbour');
select is((select count(*)::int from activity where task_id =
  '73000000-0000-0000-0000-000000000004' and verb = 'moved'), 1,
  'status activity commits inside the move transaction');

select is((move_task('73000000-0000-0000-0000-000000000001', 'todo', null,
  '73000000-0000-0000-0000-000000000002')).id,
  '73000000-0000-0000-0000-000000000001'::uuid, 'top-of-column reorder succeeds');
select is((move_task('73000000-0000-0000-0000-000000000003', 'todo',
  '73000000-0000-0000-0000-000000000004', null)).id,
  '73000000-0000-0000-0000-000000000003'::uuid, 'bottom-of-column reorder succeeds');

-- Force an exhausted gap, then prove the RPC rebalances the complete column.
set local role postgres;
update tasks set position = 100 where id = '73000000-0000-0000-0000-000000000002';
update tasks set position = 100.00000001 where id = '73000000-0000-0000-0000-000000000004';
set local role authenticated;
select lives_ok(
  $$ select move_task('73000000-0000-0000-0000-000000000001', 'todo',
       '73000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000004') $$,
  'exhausted fractional gap triggers a rebalance');
select is((select count(*)::int from (
  select position from tasks where workspace_id = '71000000-0000-0000-0000-000000000001'
    and status = 'todo' group by position having count(*) > 1
) duplicates), 0, 'rebalance leaves no duplicate positions');
select cmp_ok((select min(lead_position - position) from (
  select position, lead(position) over (order by position, id) lead_position
  from tasks where workspace_id = '71000000-0000-0000-0000-000000000001' and status = 'todo'
) gaps where lead_position is not null), '>', 0::double precision,
  'long reorder sequence retains strict ordering gaps');

select throws_ok(
  $$ select move_task('73000000-0000-0000-0000-000000000005', 'done', null, null) $$,
  '42501', null, 'member cannot move a foreign task');
select throws_ok(
  $$ select move_task('73000000-0000-0000-0000-000000000002', 'todo', null, null) $$,
  '40001', null, 'non-empty target requires explicit neighbours');
select throws_ok(
  $$ select move_task('73000000-0000-0000-0000-000000000002', 'todo',
       '73000000-0000-0000-0000-000000000002', null) $$,
  '40001', null, 'moved task cannot be its own neighbour');

select is((move_task('73000000-0000-0000-0000-000000000002', 'done', null, null)).status,
  'done'::task_status, 'move into an empty column succeeds');
select is((select position from tasks where id = '73000000-0000-0000-0000-000000000002'),
  1024::double precision, 'empty column receives canonical position');
select is((select count(*)::int from activity where task_id =
  '73000000-0000-0000-0000-000000000002' and verb = 'moved'), 1,
  'final cross-column move produces exactly one move event');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select move_task('73000000-0000-0000-0000-000000000001', 'done', null, null) $$,
  '42501', null, 'anonymous caller cannot move tasks');

select * from finish(true);
rollback;

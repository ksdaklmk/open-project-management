-- Phase 2 milestones/dependencies: guarded milestone management, tenant-safe
-- dependency writes, transactional cycle rejection, blocker state, and grants.
begin;
select plan(58);
set local role postgres;

insert into auth.users (id, email) values
  ('40000000-0000-4000-8000-000000000001', 'milestone-owner@test.dev'),
  ('40000000-0000-4000-8000-000000000002', 'milestone-member@test.dev'),
  ('40000000-0000-4000-8000-000000000003', 'milestone-outsider@test.dev');
insert into workspaces (id, name, created_by) values
  ('40100000-0000-4000-8000-000000000011', 'Delivery A', '40000000-0000-4000-8000-000000000001'),
  ('40100000-0000-4000-8000-000000000012', 'Delivery B', '40000000-0000-4000-8000-000000000003');
insert into workspace_members (workspace_id, user_id, role) values
  ('40100000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000001', 'owner'),
  ('40100000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000002', 'member'),
  ('40100000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000003', 'owner');
insert into projects (id, workspace_id, name, key, archived_at) values
  ('40200000-0000-4000-8000-000000000101', '40100000-0000-4000-8000-000000000011', 'Launch', 'LCH', null),
  ('40200000-0000-4000-8000-000000000102', '40100000-0000-4000-8000-000000000011', 'Archived', 'ARC', now()),
  ('40200000-0000-4000-8000-000000000103', '40100000-0000-4000-8000-000000000012', 'Foreign', 'FOR', null);
insert into tasks (
  id, project_id, workspace_id, ref, title, status, start_date, end_date,
  position, created_by, archived_at
) values
  ('40300000-0000-4000-8000-000000000101', '40200000-0000-4000-8000-000000000101',
   '40100000-0000-4000-8000-000000000011', 'LCH-101', 'Foundation', 'todo',
   '2026-07-01', '2026-07-05', 1024, '40000000-0000-4000-8000-000000000001', null),
  ('40300000-0000-4000-8000-000000000102', '40200000-0000-4000-8000-000000000101',
   '40100000-0000-4000-8000-000000000011', 'LCH-102', 'Application', 'todo',
   '2026-07-04', '2026-07-10', 2048, '40000000-0000-4000-8000-000000000001', null),
  ('40300000-0000-4000-8000-000000000103', '40200000-0000-4000-8000-000000000101',
   '40100000-0000-4000-8000-000000000011', 'LCH-103', 'Release', 'todo',
   '2026-07-11', '2026-07-12', 3072, '40000000-0000-4000-8000-000000000001', null),
  ('40300000-0000-4000-8000-000000000104', '40200000-0000-4000-8000-000000000101',
   '40100000-0000-4000-8000-000000000011', 'LCH-104', 'Archived task', 'todo',
   null, null, 4096, '40000000-0000-4000-8000-000000000001', now()),
  ('40300000-0000-4000-8000-000000000105', '40200000-0000-4000-8000-000000000103',
   '40100000-0000-4000-8000-000000000012', 'FOR-101', 'Foreign task', 'todo',
   null, null, 1024, '40000000-0000-4000-8000-000000000003', null);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);

select lives_ok(
  $$ select create_project_milestone(
    '40200000-0000-4000-8000-000000000101', 'Public beta', '2026-07-15', 'planned') $$,
  'an owner can create a project milestone');
select is((select workspace_id from project_milestones where title = 'Public beta'),
  '40100000-0000-4000-8000-000000000011'::uuid,
  'the server derives milestone workspace from its project');
select is((select created_by from project_milestones where title = 'Public beta'),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'the milestone actor is pinned to auth.uid');
select is((select count(*)::int from project_milestones), 1,
  'the owner can read the created milestone');
select is((update_project_milestone(
  (select id from project_milestones where title = 'Public beta'),
  'General availability', '2026-07-20', 'at_risk')).status,
  'at_risk'::milestone_status, 'an owner can update milestone status');
select is((select title || '/' || target_date::text from project_milestones),
  'General availability/2026-07-20', 'milestone edits persist together');
select throws_ok(
  $$ select create_project_milestone(
    '40200000-0000-4000-8000-000000000101', ' padded ', '2026-07-15', 'planned') $$,
  '22023', null, 'milestone titles must be normalized');
select throws_ok(
  $$ select create_project_milestone(
    '40200000-0000-4000-8000-000000000102', 'Unavailable', '2026-07-15', 'planned') $$,
  '42501', null, 'milestones cannot be added to archived projects');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select is((select count(*)::int from project_milestones), 1,
  'workspace members can read milestones');
select throws_ok(
  $$ select create_project_milestone(
    '40200000-0000-4000-8000-000000000101', 'Forged', '2026-07-15', 'planned') $$,
  '42501', null, 'plain members cannot create milestones');
select throws_ok(
  $$ select update_project_milestone(
    (select id from project_milestones), 'Forged', '2026-07-15', 'complete') $$,
  '42501', null, 'plain members cannot update milestones');
select throws_ok(
  $$ select delete_project_milestone((select id from project_milestones)) $$,
  '42501', null, 'plain members cannot delete milestones');
select throws_ok(
  $$ insert into project_milestones (
    workspace_id, project_id, title, target_date, created_by
  ) values (
    '40100000-0000-4000-8000-000000000011',
    '40200000-0000-4000-8000-000000000101', 'Bypass', '2026-07-15',
    '40000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'authenticated clients cannot bypass milestone RPCs');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-4000-8000-000000000003','role','authenticated')::text,
  true);
select is_empty(
  $$ select 1 from project_milestones
     where workspace_id = '40100000-0000-4000-8000-000000000011' $$,
  'foreign tenants cannot list milestones');
select throws_ok(
  $$ select create_project_milestone(
    '40200000-0000-4000-8000-000000000101', 'Foreign', '2026-07-15', 'planned') $$,
  '42501', null, 'foreign tenants cannot create milestones in another workspace');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
select throws_ok(
  $$ select create_project_milestone(
    '40200000-0000-4000-8000-000000000103', 'Cross tenant', '2026-07-15', 'planned') $$,
  '42501', null, 'an owner cannot manage a foreign project milestone');

set local role postgres;
select ok((select relrowsecurity from pg_class where oid = 'project_milestones'::regclass),
  'project milestones have RLS enabled');
select ok(has_table_privilege('authenticated', 'project_milestones', 'select'),
  'authenticated users receive the explicit milestone select grant');
select ok(not has_table_privilege('authenticated', 'project_milestones', 'insert'),
  'authenticated users do not receive direct milestone insert privileges');
select ok(has_function_privilege('authenticated',
  'create_project_milestone(uuid,text,date,milestone_status)', 'execute'),
  'authenticated users may invoke the guarded milestone creator');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select lives_ok(
  $$ select create_task_dependency(
    '40300000-0000-4000-8000-000000000101',
    '40300000-0000-4000-8000-000000000102') $$,
  'a workspace member can create a task dependency');
select is((select workspace_id from task_dependencies),
  '40100000-0000-4000-8000-000000000011'::uuid,
  'the dependency workspace is derived from its tasks');
select is((select created_by from task_dependencies),
  '40000000-0000-4000-8000-000000000002'::uuid,
  'dependency creation pins the actor identity');
select is((select count(*)::int from query_task_dependencies(
  '40100000-0000-4000-8000-000000000011',
  '40300000-0000-4000-8000-000000000102')), 1,
  'the task-scoped dependency query returns the edge');
select is((select predecessor_ref || '/' || successor_ref
  from query_task_dependencies('40100000-0000-4000-8000-000000000011')),
  'LCH-101/LCH-102', 'the dependency query exposes safe task context');
select is((select blocked_by_count from query_tasks(
  p_workspace_id := '40100000-0000-4000-8000-000000000011')
  where id = '40300000-0000-4000-8000-000000000102'), 1,
  'an unfinished predecessor marks its active successor blocked');
select is((select predecessor.start_date::text || '/' || predecessor.end_date::text || '/' ||
    successor.start_date::text || '/' || successor.end_date::text
  from tasks predecessor, tasks successor
  where predecessor.id = '40300000-0000-4000-8000-000000000101'
    and successor.id = '40300000-0000-4000-8000-000000000102'),
  '2026-07-01/2026-07-05/2026-07-04/2026-07-10',
  'creating a dependency never silently reschedules either task');
select throws_ok(
  $$ select create_task_dependency(
    '40300000-0000-4000-8000-000000000101',
    '40300000-0000-4000-8000-000000000101') $$,
  '23514', null, 'self-dependencies are rejected');
select throws_ok(
  $$ select create_task_dependency(
    '40300000-0000-4000-8000-000000000101',
    '40300000-0000-4000-8000-000000000102') $$,
  '23505', null, 'duplicate dependency edges are rejected');
select throws_ok(
  $$ select create_task_dependency(
    '40300000-0000-4000-8000-000000000102',
    '40300000-0000-4000-8000-000000000101') $$,
  '23514', null, 'a reverse edge that creates a cycle is rejected');
select is((select count(*)::int from task_dependencies), 1,
  'a failed cycle insert leaves the graph unchanged');
select lives_ok(
  $$ select create_task_dependency(
    '40300000-0000-4000-8000-000000000102',
    '40300000-0000-4000-8000-000000000103') $$,
  'a valid second edge can extend the graph');
select throws_ok(
  $$ select create_task_dependency(
    '40300000-0000-4000-8000-000000000103',
    '40300000-0000-4000-8000-000000000101') $$,
  '23514', null, 'multi-hop cycles are rejected transactionally');
select is((select count(*)::int from task_dependencies), 2,
  'a failed multi-hop cycle leaves both prior edges intact');
select throws_ok(
  $$ select create_task_dependency(
    '40300000-0000-4000-8000-000000000101',
    '40300000-0000-4000-8000-000000000105') $$,
  '42501', null, 'cross-workspace dependency creation is denied');
select throws_ok(
  $$ select create_task_dependency(
    '40300000-0000-4000-8000-000000000104',
    '40300000-0000-4000-8000-000000000103') $$,
  '42501', null, 'archived tasks cannot become active dependencies');
select throws_ok(
  $$ insert into task_dependencies (
    workspace_id, predecessor_task_id, successor_task_id, created_by
  ) values (
    '40100000-0000-4000-8000-000000000011',
    '40300000-0000-4000-8000-000000000101',
    '40300000-0000-4000-8000-000000000103',
    '40000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'authenticated clients cannot bypass dependency RPCs');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-4000-8000-000000000003','role','authenticated')::text,
  true);
select is_empty(
  $$ select 1 from query_task_dependencies(
    '40100000-0000-4000-8000-000000000011') $$,
  'foreign tenants cannot query another workspace dependency graph');
select throws_ok(
  $$ select delete_task_dependency((select id from task_dependencies limit 1)) $$,
  '42501', null, 'foreign tenants cannot delete dependency edges');

select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select is(delete_task_dependency((select id from task_dependencies
  where successor_task_id = '40300000-0000-4000-8000-000000000103')), true,
  'workspace members can remove an edge');
select is((select count(*)::int from task_dependencies), 1,
  'dependency deletion removes exactly one edge');

set local role postgres;
update tasks set status = 'done' where id = '40300000-0000-4000-8000-000000000101';
set local role authenticated;
select is((select blocked_by_count from query_tasks(
  p_workspace_id := '40100000-0000-4000-8000-000000000011')
  where id = '40300000-0000-4000-8000-000000000102'), 0,
  'completing the predecessor clears blocker state');
set local role postgres;
update tasks set status = 'todo' where id = '40300000-0000-4000-8000-000000000101';
update tasks set status = 'done' where id = '40300000-0000-4000-8000-000000000102';
set local role authenticated;
select is((select blocked_by_count from query_tasks(
  p_workspace_id := '40100000-0000-4000-8000-000000000011')
  where id = '40300000-0000-4000-8000-000000000102'), 0,
  'completed successors are not presented as blocked');
set local role postgres;
update tasks set status = 'todo' where id = '40300000-0000-4000-8000-000000000102';
set local role authenticated;
select is((select blocked_by_count from query_tasks(
  p_workspace_id := '40100000-0000-4000-8000-000000000011')
  where id = '40300000-0000-4000-8000-000000000102'), 1,
  'reopening the successor restores its blocker state');

set local role postgres;
select ok((select relrowsecurity from pg_class where oid = 'task_dependencies'::regclass),
  'task dependencies have RLS enabled');
select ok(has_table_privilege('authenticated', 'task_dependencies', 'select'),
  'authenticated users receive the dependency select grant');
select ok(not has_table_privilege('authenticated', 'task_dependencies', 'insert'),
  'authenticated users do not receive direct dependency insert privileges');
select ok(has_function_privilege('authenticated',
  'create_task_dependency(uuid,uuid)', 'execute'),
  'authenticated users may invoke the guarded dependency creator');
select ok(has_function_privilege('authenticated',
  'query_task_dependencies(uuid,uuid)', 'execute'),
  'authenticated users may invoke the RLS-preserving dependency query');
select ok(position('pg_advisory_xact_lock' in (
  select prosrc from pg_proc where proname = 'set_task_dependency_workspace'
)) > 0, 'dependency cycle checks serialize writes per workspace');
select is((select count(*)::int from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename = 'project_milestones'), 1,
  'project milestones participate in Realtime reconciliation');
select is((select count(*)::int from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename = 'task_dependencies'), 1,
  'task dependencies participate in Realtime reconciliation');
select is((select count(*)::int from pg_indexes where indexname in (
  'project_milestones_workspace_target_idx', 'project_milestones_project_target_idx'
)), 2, 'both milestone date access indexes exist');
select is((select count(*)::int from pg_indexes
  where indexname = 'task_dependencies_successor_idx'), 1,
  'successor blocker lookups retain their supporting index');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','40000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
select is(delete_project_milestone((select id from project_milestones)), true,
  'an owner can delete a milestone');
select is((select count(*)::int from project_milestones), 0,
  'milestone deletion removes exactly one row');

set local role postgres;
select throws_ok(
  $$ insert into project_milestones (
    workspace_id, project_id, title, target_date
  ) values (
    '40100000-0000-4000-8000-000000000011',
    '40200000-0000-4000-8000-000000000101', 'Too old', '1800-01-01') $$,
  '23514', null, 'milestone target dates stay inside the supported range');
select throws_ok(
  $$ insert into project_milestones (
    workspace_id, project_id, title, target_date
  ) values (
    '40100000-0000-4000-8000-000000000011',
    '40200000-0000-4000-8000-000000000101', ' padded ', '2026-07-15') $$,
  '23514', null, 'the table constraint rejects non-normalized milestone titles');

select * from finish(true);
rollback;

-- Phase 1C server querying: RLS, filters, stable cursors, windows, aggregate,
-- and the indexes that back the large-workspace access paths.
begin;
select plan(13);
set local role postgres;

insert into auth.users (id, email) values
  ('81000000-0000-0000-0000-000000000001', 'query-member@test.dev'),
  ('81000000-0000-0000-0000-000000000002', 'query-outsider@test.dev');
insert into workspaces (id, name, created_by) values
  ('82000000-0000-0000-0000-000000000001', 'Query A', '81000000-0000-0000-0000-000000000001'),
  ('82000000-0000-0000-0000-000000000002', 'Query B', '81000000-0000-0000-0000-000000000002');
insert into workspace_members (workspace_id, user_id, role) values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'owner'),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', 'owner');
insert into projects (id, workspace_id, name, key) values
  ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'QA', 'QA'),
  ('83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', 'QB', 'QB');
insert into tasks (
  id, project_id, workspace_id, ref, title, description, status, priority,
  assignee_id, start_date, end_date, points, position, created_by
) values
  ('84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001',
   '82000000-0000-0000-0000-000000000001', 'QA-1', 'Alpha login', 'searchable',
   'todo', 'urgent', '81000000-0000-0000-0000-000000000001', '2026-07-13', '2026-07-14', 5, 1024,
   '81000000-0000-0000-0000-000000000001'),
  ('84000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000001',
   '82000000-0000-0000-0000-000000000001', 'QA-2', 'Beta', '',
   'todo', 'low', null, null, null, 3, 2048,
   '81000000-0000-0000-0000-000000000001'),
  ('84000000-0000-0000-0000-000000000003', '83000000-0000-0000-0000-000000000001',
   '82000000-0000-0000-0000-000000000001', 'QA-3', 'Gamma', '',
   'done', 'medium', null, '2026-07-20', '2026-07-21', 2, 3072,
   '81000000-0000-0000-0000-000000000001'),
  ('84000000-0000-0000-0000-000000000004', '83000000-0000-0000-0000-000000000001',
   '82000000-0000-0000-0000-000000000001', 'QA-4', 'Delta', '',
   'backlog', 'high', null, '2025-01-01', '2025-01-02', 2, 4096,
   '81000000-0000-0000-0000-000000000001'),
  ('84000000-0000-0000-0000-000000000005', '83000000-0000-0000-0000-000000000002',
   '82000000-0000-0000-0000-000000000002', 'QB-1', 'Foreign', '',
   'todo', 'urgent', null, null, null, 8, 1024,
   '81000000-0000-0000-0000-000000000002');
insert into task_tags (task_id, tag) values
  ('84000000-0000-0000-0000-000000000001', 'Backend');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','81000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);

select is(
  (select count(*)::int from query_tasks(
    p_workspace_id := '82000000-0000-0000-0000-000000000001', p_limit := 2)),
  3, 'task page returns only the requested rows plus one lookahead');
select is(
  (select count(*)::int from query_tasks(
    p_workspace_id := '82000000-0000-0000-0000-000000000001',
    p_status := array['todo']::task_status[])),
  2, 'status filtering happens on the server');
select is(
  (select count(*)::int from query_tasks(
    p_workspace_id := '82000000-0000-0000-0000-000000000001', p_tags := array['Backend'])),
  1, 'tag filtering happens on the server');
select is(
  (select count(*)::int from query_tasks(
    p_workspace_id := '82000000-0000-0000-0000-000000000001', p_search := 'login')),
  1, 'trigram-backed text search finds title content');
select is(
  (select count(*)::int from query_tasks(
    p_workspace_id := '82000000-0000-0000-0000-000000000001',
    p_assignee := array[]::uuid[], p_include_unassigned := true)),
  3, 'the explicit unassigned filter is preserved');
select is(
  (select count(*)::int from query_tasks(
    p_workspace_id := '82000000-0000-0000-0000-000000000001', p_schedule := 'gantt',
    p_window_start := '2026-07-01', p_window_end := '2026-07-31')),
  2, 'Gantt reads only tasks intersecting its bounded window');
select is(
  (select count(*)::int from query_tasks(
    p_workspace_id := '82000000-0000-0000-0000-000000000001', p_schedule := 'unscheduled')),
  1, 'unscheduled tasks use their own bounded page');
select is_empty(
  $$ select 1 from query_tasks(
    p_workspace_id := '82000000-0000-0000-0000-000000000002') $$,
  'task query RPC preserves cross-tenant RLS');
select is(
  (select next_page.id from query_tasks(
     p_workspace_id := '82000000-0000-0000-0000-000000000001',
     p_cursor_sort := (select first_page.sort_value from query_tasks(
       p_workspace_id := '82000000-0000-0000-0000-000000000001', p_limit := 1) first_page limit 1),
     p_cursor_id := (select first_page.id from query_tasks(
       p_workspace_id := '82000000-0000-0000-0000-000000000001', p_limit := 1) first_page limit 1),
     p_limit := 1
   ) next_page limit 1),
  '84000000-0000-0000-0000-000000000002'::uuid,
  'stable sort-value/id cursor advances without duplication');
select is(
  (select points from query_workload(
    '82000000-0000-0000-0000-000000000001', '2026-07-13', 6)
   where bucket = 'scheduled' and assignee_id = '81000000-0000-0000-0000-000000000001'),
  5::bigint, 'Workload aggregates scheduled points on the server');
select is(
  (select points from query_workload(
    '82000000-0000-0000-0000-000000000001', '2026-07-13', 6)
   where bucket = 'unscheduled'),
  3::bigint, 'Workload aggregates unscheduled points on the server');
select is(
  (select points from query_workload(
    '82000000-0000-0000-0000-000000000001', '2026-07-13', 6)
   where bucket = 'out_of_range'),
  2::bigint, 'Workload aggregates out-of-window points on the server');

set local role postgres;
select is(
  (select count(*)::int from pg_indexes where indexname in (
    'tasks_workspace_status_position_id_idx', 'tasks_workspace_priority_id_idx',
    'tasks_workspace_end_date_id_idx', 'tasks_workspace_start_date_id_idx',
    'tasks_workspace_type_id_idx', 'tasks_workspace_assignee_id_idx',
    'tasks_search_trgm_idx', 'task_tags_tag_task_id_idx',
    'comments_task_created_id_idx', 'activity_workspace_created_id_idx'
  )),
  10, 'all Phase 1C query indexes exist');

select * from finish(true);
rollback;

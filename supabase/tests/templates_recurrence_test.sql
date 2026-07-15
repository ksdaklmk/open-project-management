-- Phase 2 templates/recurrence: validated snapshots, transactional generation,
-- timezone-safe schedules, idempotent occurrence keys, permissions, and RLS.
begin;
select plan(67);
set local role postgres;

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'template-owner@test.dev'),
  ('30000000-0000-4000-8000-000000000002', 'template-member@test.dev'),
  ('30000000-0000-4000-8000-000000000003', 'template-outsider@test.dev');
insert into workspaces (id, name, created_by) values
  ('30100000-0000-4000-8000-000000000011', 'Template A', '30000000-0000-4000-8000-000000000001'),
  ('30100000-0000-4000-8000-000000000012', 'Template B', '30000000-0000-4000-8000-000000000003');
insert into workspace_members (workspace_id, user_id, role) values
  ('30100000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000001', 'owner'),
  ('30100000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000002', 'member'),
  ('30100000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000003', 'owner');
insert into projects (id, workspace_id, name, key, color, next_task_num) values
  ('30200000-0000-4000-8000-000000000101', '30100000-0000-4000-8000-000000000011', 'Delivery', 'DEL', '#123abc', 103),
  ('30200000-0000-4000-8000-000000000102', '30100000-0000-4000-8000-000000000011', 'Retiring', 'RET', '#654321', 102),
  ('30200000-0000-4000-8000-000000000103', '30100000-0000-4000-8000-000000000012', 'Foreign', 'FOR', '#111111', 102);
insert into tasks (
  id, project_id, workspace_id, ref, title, description, type, status, priority,
  assignee_id, start_date, end_date, points, position, created_by
) values
  ('30300000-0000-4000-8000-000000000101', '30200000-0000-4000-8000-000000000101',
   '30100000-0000-4000-8000-000000000011', 'DEL-101', 'Weekly delivery', 'Ship carefully',
   'feature', 'done', 'urgent', '30000000-0000-4000-8000-000000000002',
   '2026-03-01', '2026-03-03', 8, 1024, '30000000-0000-4000-8000-000000000001'),
  ('30300000-0000-4000-8000-000000000102', '30200000-0000-4000-8000-000000000101',
   '30100000-0000-4000-8000-000000000011', 'DEL-102', 'Publish notes', '',
   'chore', 'todo', 'medium', null, '2026-03-04', '2026-03-04', 2, 2048,
   '30000000-0000-4000-8000-000000000001'),
  ('30300000-0000-4000-8000-000000000103', '30200000-0000-4000-8000-000000000102',
   '30100000-0000-4000-8000-000000000011', 'RET-101', 'Soon unavailable', '',
   'chore', 'todo', 'low', null, null, null, null, 1024,
   '30000000-0000-4000-8000-000000000001'),
  ('30300000-0000-4000-8000-000000000104', '30200000-0000-4000-8000-000000000103',
   '30100000-0000-4000-8000-000000000012', 'FOR-101', 'Foreign task', '',
   'feature', 'todo', 'medium', null, null, null, null, 1024,
   '30000000-0000-4000-8000-000000000003');
insert into subtasks (task_id, title, done, position) values
  ('30300000-0000-4000-8000-000000000101', 'Check release', true, 0);
insert into task_tags (task_id, tag) values
  ('30300000-0000-4000-8000-000000000101', 'Backend');
insert into task_dependencies (
  id, workspace_id, predecessor_task_id, successor_task_id, created_by
) values (
  '30400000-0000-4000-8000-000000000101',
  '30100000-0000-4000-8000-000000000011',
  '30300000-0000-4000-8000-000000000101',
  '30300000-0000-4000-8000-000000000102',
  '30000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','30000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);

select lives_ok(
  $$ select capture_project_template(
    '30200000-0000-4000-8000-000000000101', 'Delivery baseline',
    'Reusable delivery work', '2026-03-01', 36) $$,
  'an owner can capture an active project template');
select is((select definition->'project'->>'name' from project_templates
  where name = 'Delivery baseline'), 'Delivery', 'snapshot keeps project defaults');
select is((select (definition->'project'->>'capacity_per_week')::int from project_templates
  where name = 'Delivery baseline'), 36, 'snapshot keeps the capacity assumption');
select is((select jsonb_array_length(definition->'tasks') from project_templates
  where name = 'Delivery baseline'), 2, 'snapshot includes active project tasks');
select is((select (task->>'start_offset_days')::int
  from project_templates, jsonb_array_elements(definition->'tasks') task
  where name = 'Delivery baseline' and task->>'title' = 'Weekly delivery'), 0,
  'snapshot stores dates relative to the chosen anchor');
select is((select task->'tags'->>0
  from project_templates, jsonb_array_elements(definition->'tasks') task
  where name = 'Delivery baseline' and task->>'title' = 'Weekly delivery'), 'Backend',
  'snapshot includes fixed tags');
select is((select task->'subtasks'->0->>'title'
  from project_templates, jsonb_array_elements(definition->'tasks') task
  where name = 'Delivery baseline' and task->>'title' = 'Weekly delivery'), 'Check release',
  'snapshot includes task hierarchy as subtasks');
select is((select jsonb_array_length(task->'depends_on')
  from project_templates, jsonb_array_elements(definition->'tasks') task
  where name = 'Delivery baseline' and task->>'title' = 'Publish notes'), 1,
  'snapshot includes same-project dependencies');

select set_config('request.jwt.claims',
  json_build_object('sub','30000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select throws_ok(
  $$ select capture_project_template(
    '30200000-0000-4000-8000-000000000101', 'Member copy', '', '2026-03-01', 40) $$,
  '42501', null, 'plain members cannot manage project templates');
select throws_ok(
  $$ select instantiate_project_template(
    (select id from project_templates where name = 'Delivery baseline'),
    'Member project', 'MEM', '2026-04-01') $$,
  '42501', null, 'plain members cannot instantiate project templates');
select throws_ok(
  $$ insert into project_templates (workspace_id, name, definition) values (
    '30100000-0000-4000-8000-000000000011', 'Forged', '{}'::jsonb) $$,
  '42501', null, 'clients cannot bypass template validation with direct writes');

select set_config('request.jwt.claims',
  json_build_object('sub','30000000-0000-4000-8000-000000000003','role','authenticated')::text,
  true);
select is_empty($$ select 1 from project_templates
  where workspace_id = '30100000-0000-4000-8000-000000000011' $$,
  'foreign tenants cannot list templates');
select throws_ok(
  $$ select capture_project_template(
    '30200000-0000-4000-8000-000000000101', 'Foreign copy', '', '2026-03-01', 40) $$,
  '42501', null, 'foreign tenants cannot capture templates');

set local role postgres;
select throws_ok(
  $$ select validate_project_template_definition(
    '{"project":{"name":"X","color":"#123456","capacity_per_week":40},"tasks":[],"sql":"drop"}'::jsonb) $$,
  '22023', null, 'unknown blueprint fields are rejected');
select throws_ok(
  $$ select validate_project_template_definition(
    '{"project":{"name":"X","color":"#123456","capacity_per_week":40},"tasks":[{"key":"a","title":"A","depends_on":["b"]},{"key":"b","title":"B","depends_on":["a"]}]}'::jsonb) $$,
  '22023', null, 'cyclic blueprint dependencies are rejected');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','30000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
select lives_ok(
  $$ select instantiate_project_template(
    (select id from project_templates where name = 'Delivery baseline'),
    'April delivery', 'APR', '2026-04-01') $$,
  'an owner can instantiate a template transactionally');
select is((select count(*)::int from projects where workspace_id =
  '30100000-0000-4000-8000-000000000011' and key = 'APR'), 1,
  'instantiation creates one project');
select is((select count(*)::int from tasks where project_id =
  (select id from projects where key = 'APR')), 2, 'instantiation creates every template task');
select is((select string_agg(ref, ',' order by ref) from tasks where project_id =
  (select id from projects where key = 'APR')), 'APR-101,APR-102',
  'template task refs are allocated deterministically');
select is((select start_date::text || '/' || end_date::text from tasks
  where project_id = (select id from projects where key = 'APR')
    and title = 'Weekly delivery'), '2026-04-01/2026-04-03',
  'relative dates move to the instance anchor');
select is((select count(*)::int from subtasks where task_id = (
  select id from tasks where project_id = (select id from projects where key = 'APR')
    and title = 'Weekly delivery')), 1, 'instantiation creates subtasks');
select is((select count(*)::int from task_tags where task_id = (
  select id from tasks where project_id = (select id from projects where key = 'APR')
    and title = 'Weekly delivery') and tag = 'Backend'), 1, 'instantiation creates tags');
select is((select count(*)::int from task_dependencies where workspace_id =
  '30100000-0000-4000-8000-000000000011' and predecessor_task_id in (
    select id from tasks where project_id = (select id from projects where key = 'APR'))), 1,
  'instantiation materializes template dependencies');
select is((select next_task_num from projects where key = 'APR'), 103,
  'the project ref counter advances past generated tasks');
select is((create_task((select id from projects where key = 'APR'), 'After template')).ref,
  'APR-103', 'normal task creation continues after generated refs');
select throws_ok(
  $$ select instantiate_project_template(
    (select id from project_templates where name = 'Delivery baseline'),
    'Duplicate key', 'APR', '2026-05-01') $$,
  '23505', null, 'a duplicate project key aborts template instantiation');
select is((select count(*)::int from projects where key = 'APR'), 1,
  'failed instantiation leaves no partial project');

set local role postgres;
select throws_ok(
  $$ insert into task_dependencies (
    workspace_id, predecessor_task_id, successor_task_id
  ) values (
    '30100000-0000-4000-8000-000000000011',
    '30300000-0000-4000-8000-000000000102',
    '30300000-0000-4000-8000-000000000101') $$,
  '23514', null, 'the dependency graph rejects cycles beneath template generation');
select throws_ok(
  $$ insert into task_dependencies (
    workspace_id, predecessor_task_id, successor_task_id
  ) values (
    '30100000-0000-4000-8000-000000000011',
    '30300000-0000-4000-8000-000000000101',
    '30300000-0000-4000-8000-000000000104') $$,
  '23514', null, 'the dependency graph rejects cross-workspace edges');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','30000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select is((upsert_task_recurrence(
  '30300000-0000-4000-8000-000000000101', 'America/New_York', 'daily', 1,
  timestamp '2026-03-07 09:00:00')).timezone, 'America/New_York',
  'a workspace member can schedule an active task');
select is((select next_occurrence_at from task_recurrences where source_task_id =
  '30300000-0000-4000-8000-000000000101'), timestamptz '2026-03-07 14:00:00+00',
  'the first local occurrence is stored as the correct instant');
select throws_ok(
  $$ select upsert_task_recurrence(
    '30300000-0000-4000-8000-000000000101', 'Mars/Olympus', 'daily', 1,
    timestamp '2026-03-07 09:00:00') $$,
  '22023', null, 'unknown timezones are rejected');
select throws_ok(
  $$ select upsert_task_recurrence(
    '30300000-0000-4000-8000-000000000101', 'UTC', 'daily', 0,
    timestamp '2026-03-07 09:00:00') $$,
  '22023', null, 'invalid recurrence intervals are rejected');
select throws_ok(
  $$ insert into task_recurrences (
    workspace_id, source_task_id, target_project_id, timezone, frequency,
    next_occurrence_at
  ) values (
    '30100000-0000-4000-8000-000000000011',
    '30300000-0000-4000-8000-000000000101',
    '30200000-0000-4000-8000-000000000101', 'UTC', 'daily', now()) $$,
  '42501', null, 'clients cannot forge recurrence definitions directly');

select set_config('request.jwt.claims',
  json_build_object('sub','30000000-0000-4000-8000-000000000003','role','authenticated')::text,
  true);
select throws_ok(
  $$ select upsert_task_recurrence(
    '30300000-0000-4000-8000-000000000101', 'UTC', 'daily', 1,
    timestamp '2026-03-07 09:00:00') $$,
  '42501', null, 'foreign tenants cannot schedule another workspace task');
select throws_ok(
  $$ select generate_due_recurrences(25, '2026-03-07 14:01:00+00') $$,
  '42501', null, 'authenticated clients cannot invoke the scheduled generator');

set local role postgres;
select is(recurrence_next_occurrence(
  '2026-03-07 14:00:00+00', 'America/New_York', 'daily', 1),
  timestamptz '2026-03-08 13:00:00+00',
  'daily recurrence preserves local wall time across daylight-saving changes');

set local role service_role;
select is((select count(*)::int from generate_due_recurrences(
  25, '2026-03-07 14:01:00+00')), 1, 'the scheduled worker generates one due task');
set local role postgres;
select is((select count(*)::int from recurrence_occurrences where recurrence_id = (
  select id from task_recurrences where source_task_id =
    '30300000-0000-4000-8000-000000000101')), 1,
  'generation records one unique occurrence');
select is((select status from tasks where id = (
  select generated_task_id from recurrence_occurrences where recurrence_id = (
    select id from task_recurrences where source_task_id =
      '30300000-0000-4000-8000-000000000101'))), 'todo'::task_status,
  'a completed source resets generated work to todo');
select is((select start_date::text || '/' || end_date::text from tasks where id = (
  select generated_task_id from recurrence_occurrences where recurrence_id = (
    select id from task_recurrences where source_task_id =
      '30300000-0000-4000-8000-000000000101'))), '2026-03-07/2026-03-09',
  'generated tasks preserve the source duration on the occurrence date');
select is((select count(*)::int from task_tags where task_id = (
  select generated_task_id from recurrence_occurrences where recurrence_id = (
    select id from task_recurrences where source_task_id =
      '30300000-0000-4000-8000-000000000101'))), 1, 'generated tasks copy tags');
select is((select count(*)::int from subtasks where task_id = (
  select generated_task_id from recurrence_occurrences where recurrence_id = (
    select id from task_recurrences where source_task_id =
      '30300000-0000-4000-8000-000000000101')) and done = false), 1,
  'generated tasks reset and copy subtasks');
select is((select next_occurrence_at from task_recurrences where source_task_id =
  '30300000-0000-4000-8000-000000000101'), timestamptz '2026-03-08 13:00:00+00',
  'the worker advances next occurrence in local time');
set local role service_role;
select is((select count(*)::int from generate_due_recurrences(
  25, '2026-03-07 14:01:00+00')), 0, 'a retry before the next instant is a no-op');

set local role postgres;
update task_recurrences set next_occurrence_at = '2026-03-07 14:00:00+00'
where source_task_id = '30300000-0000-4000-8000-000000000101';
set local role service_role;
select is((select count(*)::int from generate_due_recurrences(
  25, '2026-03-07 14:01:00+00')), 0,
  'an already-journaled occurrence cannot generate a duplicate');
set local role postgres;
select is((select count(*)::int from recurrence_occurrences where recurrence_id = (
  select id from task_recurrences where source_task_id =
    '30300000-0000-4000-8000-000000000101')), 1,
  'the occurrence journal remains unique after retry');
set local role service_role;
select is((select count(*)::int from generate_due_recurrences(
  25, '2026-03-08 13:01:00+00')), 1, 'the next due instant generates independently');
set local role postgres;
select is((select count(*)::int from recurrence_occurrences where recurrence_id = (
  select id from task_recurrences where source_task_id =
    '30300000-0000-4000-8000-000000000101')), 2,
  'separate scheduled instants have separate occurrence keys');
update task_recurrences set enabled = false where source_task_id =
  '30300000-0000-4000-8000-000000000101';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','30000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
select is((upsert_template_recurrence(
  (select id from project_templates where name = 'Delivery baseline'),
  'UTC', 'monthly', 1, timestamp '2026-04-01 08:00:00')).frequency,
  'monthly'::recurrence_frequency, 'admins can schedule a project template source');

set local role service_role;
select is((select count(*)::int from generate_due_recurrences(
  25, '2026-04-01 08:01:00+00')), 1, 'the worker instantiates a due template recurrence');
set local role postgres;
select is((select count(*)::int from projects where id = (
  select generated_project_id from recurrence_occurrences where recurrence_id = (
    select id from task_recurrences where source_template_id = (
      select id from project_templates where name = 'Delivery baseline')))), 1,
  'template recurrence journals its generated project');
select is((select count(*)::int from tasks where project_id = (
  select generated_project_id from recurrence_occurrences where recurrence_id = (
    select id from task_recurrences where source_template_id = (
      select id from project_templates where name = 'Delivery baseline')))), 2,
  'template recurrence creates all blueprint tasks');
select is((select count(*)::int from task_dependencies where predecessor_task_id in (
  select id from tasks where project_id = (
    select generated_project_id from recurrence_occurrences where recurrence_id = (
      select id from task_recurrences where source_template_id = (
        select id from project_templates where name = 'Delivery baseline'))))), 1,
  'template recurrence materializes blueprint dependencies');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','30000000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
select lives_ok(
  $$ select upsert_task_recurrence(
    '30300000-0000-4000-8000-000000000103', 'UTC', 'weekly', 1,
    timestamp '2026-05-01 07:00:00') $$,
  'a second active task can receive a recurrence');
set local role postgres;
update projects set archived_at = now() where id = '30200000-0000-4000-8000-000000000102';
set local role service_role;
select is((select count(*)::int from generate_due_recurrences(
  25, '2026-05-01 07:01:00+00')), 0,
  'an unavailable source does not generate partial work');
set local role postgres;
select is((select enabled from task_recurrences where source_task_id =
  '30300000-0000-4000-8000-000000000103'), false,
  'an unavailable source is disabled for operator review');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','30000000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
select is(delete_project_template((select id from project_templates
  where name = 'Delivery baseline')), true, 'admins can delete a project template');
select is((select count(*)::int from task_recurrences where source_template_id is not null), 0,
  'deleting a template cascades its recurrence definition and journal');

set local role postgres;
select ok((select relrowsecurity from pg_class where oid = 'project_templates'::regclass),
  'project templates have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'task_recurrences'::regclass),
  'task recurrences have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'recurrence_occurrences'::regclass),
  'occurrence history has RLS enabled');
select ok(has_table_privilege('authenticated', 'project_templates', 'select'),
  'authenticated users receive the explicit template select grant');
select ok(not has_table_privilege('authenticated', 'project_templates', 'insert'),
  'authenticated users cannot insert templates directly');
select ok(not has_table_privilege('authenticated', 'task_recurrences', 'update'),
  'authenticated users cannot update recurrence schedules directly');
select ok(has_function_privilege('service_role',
  'generate_due_recurrences(integer,timestamp with time zone)', 'execute'),
  'the service role may execute the scheduled generator');
select ok(not has_function_privilege('authenticated',
  'generate_due_recurrences(integer,timestamp with time zone)', 'execute'),
  'authenticated users cannot execute the scheduled generator');

select * from finish(true);
rollback;

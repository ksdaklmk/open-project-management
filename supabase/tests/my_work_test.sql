-- Cross-workspace personal task query stays bounded and RLS preserving.
begin;
select plan(13);
set local role postgres;

insert into auth.users (id, email) values
  ('83000000-0000-0000-0000-000000000001', 'my-work-a@test.dev'),
  ('83000000-0000-0000-0000-000000000002', 'my-work-b@test.dev');
insert into profiles (id, name) values
  ('83000000-0000-0000-0000-000000000001', 'My Work A'),
  ('83000000-0000-0000-0000-000000000002', 'My Work B')
on conflict (id) do nothing;
insert into workspaces (id, name, created_by) values
  ('83000000-0000-0000-0000-000000000011', 'Workspace A1',
   '83000000-0000-0000-0000-000000000001'),
  ('83000000-0000-0000-0000-000000000012', 'Workspace A2',
   '83000000-0000-0000-0000-000000000001'),
  ('83000000-0000-0000-0000-000000000013', 'Workspace B',
   '83000000-0000-0000-0000-000000000002');
insert into workspace_members (workspace_id, user_id, role) values
  ('83000000-0000-0000-0000-000000000011',
   '83000000-0000-0000-0000-000000000001', 'owner'),
  ('83000000-0000-0000-0000-000000000012',
   '83000000-0000-0000-0000-000000000001', 'owner'),
  ('83000000-0000-0000-0000-000000000013',
   '83000000-0000-0000-0000-000000000002', 'owner');
insert into projects (id, workspace_id, name, key) values
  ('83000000-0000-0000-0000-000000000021',
   '83000000-0000-0000-0000-000000000011', 'Project A1', 'AONE'),
  ('83000000-0000-0000-0000-000000000022',
   '83000000-0000-0000-0000-000000000012', 'Project A2', 'ATWO'),
  ('83000000-0000-0000-0000-000000000023',
   '83000000-0000-0000-0000-000000000013', 'Project B', 'BONE');

insert into tasks (
  id, project_id, workspace_id, ref, title, status, assignee_id, end_date, created_by
) values
  ('83000000-0000-0000-0000-000000000031',
   '83000000-0000-0000-0000-000000000021',
   '83000000-0000-0000-0000-000000000011', 'AONE-1', 'Overdue', 'todo',
   '83000000-0000-0000-0000-000000000001', current_date - 1,
   '83000000-0000-0000-0000-000000000001'),
  ('83000000-0000-0000-0000-000000000032',
   '83000000-0000-0000-0000-000000000022',
   '83000000-0000-0000-0000-000000000012', 'ATWO-1', 'Due soon', 'in_progress',
   '83000000-0000-0000-0000-000000000001', current_date + 2,
   '83000000-0000-0000-0000-000000000001'),
  ('83000000-0000-0000-0000-000000000033',
   '83000000-0000-0000-0000-000000000021',
   '83000000-0000-0000-0000-000000000011', 'AONE-2', 'Recent', 'backlog',
   '83000000-0000-0000-0000-000000000001', null,
   '83000000-0000-0000-0000-000000000001'),
  ('83000000-0000-0000-0000-000000000034',
   '83000000-0000-0000-0000-000000000021',
   '83000000-0000-0000-0000-000000000011', 'AONE-3', 'Old', 'todo',
   '83000000-0000-0000-0000-000000000001', null,
   '83000000-0000-0000-0000-000000000001'),
  ('83000000-0000-0000-0000-000000000035',
   '83000000-0000-0000-0000-000000000021',
   '83000000-0000-0000-0000-000000000011', 'AONE-4', 'Done overdue', 'done',
   '83000000-0000-0000-0000-000000000001', current_date - 2,
   '83000000-0000-0000-0000-000000000001'),
  ('83000000-0000-0000-0000-000000000036',
   '83000000-0000-0000-0000-000000000023',
   '83000000-0000-0000-0000-000000000013', 'BONE-1', 'Foreign', 'todo',
   '83000000-0000-0000-0000-000000000002', current_date,
   '83000000-0000-0000-0000-000000000002');
alter table tasks disable trigger trg_tasks_updated_at;
update tasks set updated_at = now() - interval '10 days'
where id = '83000000-0000-0000-0000-000000000034';
alter table tasks enable trigger trg_tasks_updated_at;
insert into task_tags (task_id, tag) values
  ('83000000-0000-0000-0000-000000000031', 'Frontend');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','83000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);

select is((select count(*)::int from query_my_work('assigned')), 5,
  'assigned scope combines accessible workspaces on the server');
select is((select count(distinct workspace_id)::int from query_my_work('assigned')), 2,
  'assigned scope spans both memberships');
select is((select count(*)::int from query_my_work('overdue')), 1,
  'overdue excludes completed work');
select is((select count(*)::int from query_my_work('due_soon')), 1,
  'due-soon uses the next seven calendar days');
select is((select count(*)::int from query_my_work('recent')), 4,
  'recent scope uses the bounded seven-day update window');
select is((select tags from query_my_work('overdue') limit 1), array['Frontend']::text[],
  'task tags are aggregated inside the bounded response');
select is((select count(*)::int from query_my_work('assigned', null, null, 1)), 2,
  'page returns one requested row plus one lookahead');
select is(
  (with first_page as (select * from query_my_work('assigned', null, null, 1) limit 1)
   select count(*)::int from query_my_work(
     'assigned',
     (select sort_value from first_page),
     (select id from first_page),
     1
   )),
  2,
  'stable sort-value/id cursor advances the personal page'
);
select is_empty(
  $$ select 1 from query_my_work('assigned')
     where workspace_id = '83000000-0000-0000-0000-000000000013' $$,
  'personal query preserves cross-tenant RLS');
select throws_ok($$ select * from query_my_work('invalid') $$, '22023', null,
  'invalid scopes are rejected');
select throws_ok(
  $$ select * from query_my_work('assigned', now(), null, 10) $$,
  '22023', null,
  'partial cursors are rejected'
);

set local role postgres;
select ok(to_regclass('tasks_assignee_updated_cursor_idx') is not null,
  'recent personal query index exists');
select ok(to_regclass('tasks_assignee_due_cursor_idx') is not null,
  'due personal query index exists');

select * from finish();
rollback;

-- Server-authored activity and transaction coupling.
begin;
select plan(17);
set local role postgres;

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-000000000001', 'activity-owner@test.dev'),
  ('60000000-0000-0000-0000-000000000002', 'activity-member@test.dev');
insert into workspaces (id, name, created_by) values
  ('61000000-0000-0000-0000-000000000001', 'Activity', '60000000-0000-0000-0000-000000000001');
insert into workspace_members (workspace_id, user_id, role) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'owner'),
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'member');
insert into projects (id, workspace_id, name, key) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Activity', 'ACT');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','60000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
select lives_ok($$ select create_task('62000000-0000-0000-0000-000000000001', 'Tracked task') $$,
  'task creation succeeds with its activity trigger');
select is((select count(*)::int from activity where verb = 'created' and actor_id =
  '60000000-0000-0000-0000-000000000001'), 1, 'task creation is server-authored');
select is((select task_title_snapshot from activity where verb = 'created' and actor_id =
  '60000000-0000-0000-0000-000000000001'), 'Tracked task', 'creation retains a title snapshot');

update tasks set status = 'done', assignee_id = '60000000-0000-0000-0000-000000000002'
where title = 'Tracked task';
select is((select count(*)::int from activity where verb = 'moved' and actor_id =
  '60000000-0000-0000-0000-000000000001'), 1, 'status change creates one moved event');
select is((select from_status::text || '>' || to_status::text from activity where verb = 'moved'),
  'backlog>done', 'moved event derives both statuses from trusted rows');
select is((select count(*)::int from activity where verb = 'assigned' and actor_id =
  '60000000-0000-0000-0000-000000000001'), 1, 'assignee change creates an assigned event');

update tasks set position = 42 where title = 'Tracked task';
select is((select count(*)::int from activity where actor_id =
  '60000000-0000-0000-0000-000000000001'), 3, 'untracked task changes create no event');

insert into comments (id, task_id, author_id, body)
select '63000000-0000-0000-0000-000000000001', id,
  '60000000-0000-0000-0000-000000000001', 'A tracked comment'
from tasks where title = 'Tracked task';
select is((select comment_id from activity where verb = 'commented'),
  '63000000-0000-0000-0000-000000000001'::uuid, 'comment event retains comment_id');
select is((select actor_id from activity where verb = 'commented'),
  '60000000-0000-0000-0000-000000000001'::uuid, 'comment event derives actor from JWT');

select throws_ok(
  $$ insert into activity (workspace_id, actor_id, verb)
     values ('61000000-0000-0000-0000-000000000001',
       '60000000-0000-0000-0000-000000000001', 'created') $$,
  '42501', null, 'members cannot fabricate activity');
select throws_ok($$ update activity set verb = 'created' where verb = 'moved' $$,
  '42501', null, 'members cannot rewrite activity');
select throws_ok($$ delete from activity where verb = 'moved' $$,
  '42501', null, 'members cannot erase activity');

delete from tasks where title = 'Tracked task';
select is((select count(*)::int from activity where verb = 'deleted'), 1,
  'task deletion creates a tombstone event');
select is((select task_ref_snapshot from activity where verb = 'deleted'), 'ACT-101',
  'deletion preserves the task ref snapshot');
select is((select task_id from activity where verb = 'deleted'), null,
  'deletion tombstone survives with a null task foreign key');

set local role postgres;
alter table activity add constraint activity_test_block_title
  check (task_title_snapshot is distinct from 'BLOCK EVENT');
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','60000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
select throws_ok(
  $$ select create_task('62000000-0000-0000-0000-000000000001', 'BLOCK EVENT') $$,
  '23514', null, 'activity failure rolls back task creation');
select is((select count(*)::int from tasks where title = 'BLOCK EVENT'), 0,
  'underlying task is absent after activity rollback');

select * from finish(true);
rollback;

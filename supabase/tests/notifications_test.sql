-- Watchers, normalized mentions, preference-aware notifications, read state,
-- tenant isolation, due scheduling, and the email-outbox worker boundary.
begin;
select plan(40);
set local role postgres;

insert into auth.users (id, email, email_confirmed_at) values
  ('20000000-0000-0000-0000-000000000001', 'notification-actor@test.dev', now()),
  ('20000000-0000-0000-0000-000000000002', 'notification-target@test.dev', now()),
  ('20000000-0000-0000-0000-000000000003', 'notification-foreign@test.dev', now()),
  ('20000000-0000-0000-0000-000000000004', 'notification-invitee@test.dev', now());

update profiles set name = case id
  when '20000000-0000-0000-0000-000000000001' then 'Notification Actor'
  when '20000000-0000-0000-0000-000000000002' then 'Notification Target'
  when '20000000-0000-0000-0000-000000000003' then 'Notification Foreign'
  else 'Notification Invitee' end
where id::text like '20000000-%';

insert into workspaces (id, name, created_by) values
  ('20000000-0000-0000-0000-000000000011', 'Notification A', '20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000012', 'Notification B', '20000000-0000-0000-0000-000000000003');
insert into workspace_members (workspace_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000002', 'member'),
  ('20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000003', 'owner');
insert into projects (id, workspace_id, name, key) values
  ('20000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000011', 'Notifications A', 'NA'),
  ('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000012', 'Notifications B', 'NB');
insert into tasks (
  id, project_id, workspace_id, ref, title, created_by, end_date
) values
  ('20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000021',
   '20000000-0000-0000-0000-000000000011', 'NA-101', 'Notification task',
   '20000000-0000-0000-0000-000000000001', current_date + 1),
  ('20000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000021',
   '20000000-0000-0000-0000-000000000011', 'NA-102', 'Self assignment',
   '20000000-0000-0000-0000-000000000001', null),
  ('20000000-0000-0000-0000-000000000033', '20000000-0000-0000-0000-000000000022',
   '20000000-0000-0000-0000-000000000012', 'NB-101', 'Foreign task',
   '20000000-0000-0000-0000-000000000003', null);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);

select is(set_task_watched('20000000-0000-0000-0000-000000000031', true), true,
  'a member can watch a task');
select is(is_task_watched('20000000-0000-0000-0000-000000000031'), true,
  'watch state is readable through the validated RPC');
select is((select count(*)::int from task_watchers), 1,
  'workspace members can read normalized watcher rows');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated')::text,
  true);
select is(set_task_watched('20000000-0000-0000-0000-000000000031', true), true,
  'a second member can watch the same task');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000003','role','authenticated')::text,
  true);
select is_empty($$ select 1 from task_watchers $$,
  'foreign tenants cannot read task watcher rows');
select throws_ok(
  $$ select is_task_watched('20000000-0000-0000-0000-000000000031') $$,
  '42501', null, 'foreign tenants cannot inspect watch state');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
update tasks set assignee_id = '20000000-0000-0000-0000-000000000002'
where id = '20000000-0000-0000-0000-000000000031';
select is((select count(*)::int from notifications
  where user_id = '20000000-0000-0000-0000-000000000002' and kind = 'assignment'), 0,
  'one user cannot read another user notification');

update tasks set assignee_id = '20000000-0000-0000-0000-000000000001'
where id = '20000000-0000-0000-0000-000000000032';
select is(get_unread_notification_count(), 0,
  'an actor never notifies themselves');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated')::text,
  true);
select is(get_unread_notification_count(), 1,
  'assignment creates one unread notification for the assignee');
select is((select count(*)::int from query_inbox()), 1,
  'Inbox returns only the signed-in user events');
select is((select task_ref from query_inbox() limit 1), 'NA-101',
  'Inbox retains a content-free task reference for deep links');
insert into notification_reads (notification_id, user_id)
select id, '20000000-0000-0000-0000-000000000002' from query_inbox() limit 1;
select is(get_unread_notification_count(), 0,
  'user-owned read state removes the event from the unread count');

insert into notification_preferences (user_id, status_changes)
values ('20000000-0000-0000-0000-000000000002', false);
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
update tasks set status = 'todo'
where id = '20000000-0000-0000-0000-000000000031';
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated')::text,
  true);
select is((select count(*)::int from notifications where kind = 'status_change'), 0,
  'disabled per-user status preferences suppress an event');

update notification_preferences set status_changes = true
where user_id = '20000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
update tasks set status = 'in_progress'
where id = '20000000-0000-0000-0000-000000000031';
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated')::text,
  true);
select is((select count(*)::int from notifications where kind = 'status_change'), 1,
  'enabled status preferences create one event for a watcher');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
select lives_ok(
  $$ select create_comment(
       '20000000-0000-0000-0000-000000000031', 'Hello @Notification Target',
       array['20000000-0000-0000-0000-000000000002']::uuid[]
     ) $$,
  'comments and normalized mentions are created atomically');
set constraints notification_comment_watchers immediate;
select is((select count(*)::int from comment_mentions), 1,
  'a selected member is persisted in the normalized mention relation');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated')::text,
  true);
select is((select count(*)::int from notifications where kind = 'mention'), 1,
  'a mention notifies the selected member');
select is((select count(*)::int from notifications where kind = 'watched_comment'), 0,
  'a mentioned watcher does not receive a duplicate watched-comment event');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
set constraints notification_comment_watchers deferred;
select create_comment('20000000-0000-0000-0000-000000000031', 'Watcher update', '{}'::uuid[]);
set constraints notification_comment_watchers immediate;
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated')::text,
  true);
select is((select count(*)::int from notifications where kind = 'watched_comment'), 1,
  'a comment on a watched task notifies non-author watchers');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
select throws_ok(
  $$ select create_comment(
       '20000000-0000-0000-0000-000000000031', 'Foreign mention',
       array['20000000-0000-0000-0000-000000000003']::uuid[]
     ) $$,
  '42501', null, 'foreign workspace users cannot be inserted as mentions');
select is((select count(*)::int from comment_mentions), 1,
  'a rejected foreign mention leaves normalized relations unchanged');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000003','role','authenticated')::text,
  true);
select is_empty($$ select 1 from comment_mentions $$,
  'foreign tenants cannot read normalized mention rows');

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
select cmp_ok(enqueue_due_notifications(3), '>=', 1::bigint,
  'due scheduler enqueues eligible targets across workspaces');
select is(enqueue_due_notifications(3), 0::bigint,
  'due scheduler is idempotent across repeated jobs');
select throws_ok($$ select enqueue_due_notifications(31) $$, '22023', null,
  'due scheduler rejects an unbounded window');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated')::text,
  true);
select is((select count(*)::int from notifications where kind = 'due_soon'), 1,
  'the assignee receives one due-soon event');

update notification_preferences set email_enabled = true
where user_id = '20000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
set constraints notification_comment_watchers deferred;
select create_comment('20000000-0000-0000-0000-000000000031', 'Email boundary', '{}'::uuid[]);
set constraints notification_comment_watchers immediate;

set local role postgres;
select is((select count(*)::int from notification_outbox), 1,
  'email-enabled events enqueue one outbox row in the task transaction');

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
select is((select count(*)::int from claim_notification_outbox(25)), 1,
  'the worker atomically claims queued delivery without task content');
select lives_ok(
  $$ select complete_notification_delivery(
       (select id from notification_outbox limit 1), true, null
     ) $$,
  'the worker can complete a claimed delivery');
set local role postgres;
select is((select status::text from notification_outbox limit 1), 'sent',
  'completed outbox delivery is retained as sent evidence');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
select lives_ok(
  $$ select upsert_workspace_invitation(
       '20000000-0000-0000-0000-000000000011',
       'notification-invitee@test.dev', 'member'
     ) $$,
  'inviting an existing account emits through the server workflow');
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000004','role','authenticated')::text,
  true);
select is((select count(*)::int from notifications where kind = 'invitation'), 1,
  'an invited existing user can read their invitation notification before membership');

select throws_ok(
  $$ insert into notifications (
       workspace_id, user_id, kind, invitation_id, dedupe_key
     ) values (
       '20000000-0000-0000-0000-000000000011',
       '20000000-0000-0000-0000-000000000004', 'invitation',
       (select id from workspace_invitations limit 1), 'forged'
     ) $$,
  '42501', null, 'authenticated users cannot forge notifications');
select is(mark_all_notifications_read(), 1::bigint,
  'mark all read creates only missing user-owned read state');
select is(get_unread_notification_count(), 0,
  'mark all read clears the invited user unread count');

select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
update tasks set assignee_id = '20000000-0000-0000-0000-000000000002'
where id = '20000000-0000-0000-0000-000000000032';
select lives_ok(
  $$ delete from tasks where id = '20000000-0000-0000-0000-000000000032' $$,
  'task deletion preserves notification history through a tombstone');
set local role postgres;
select is((select task_id from notifications
  where task_ref_snapshot = 'NA-102' limit 1), null::uuid,
  'a deleted task notification keeps only its safe ref snapshot');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
select lives_ok(
  $$ select remove_workspace_member(
       '20000000-0000-0000-0000-000000000011',
       '20000000-0000-0000-0000-000000000002'
     ) $$,
  'removing a member runs notification cleanup atomically');
select is((select count(*)::int from task_watchers
  where user_id = '20000000-0000-0000-0000-000000000002'), 0,
  'removed members no longer watch workspace tasks');
select set_config('request.jwt.claims',
  json_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated')::text,
  true);
select is((select count(*)::int from query_inbox()), 0,
  'former members lose access to workspace notification history');

select * from finish(true);
rollback;

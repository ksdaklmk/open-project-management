-- Phase 2 activation tracking: privacy-safe, idempotent, and tenant scoped.
begin;
select plan(26);
set local role postgres;

insert into auth.users (id, email) values
  ('82000000-0000-0000-0000-000000000001', 'activation-owner@test.dev'),
  ('82000000-0000-0000-0000-000000000002', 'activation-member@test.dev'),
  ('82000000-0000-0000-0000-000000000003', 'activation-outsider@test.dev');

insert into profiles (id, name) values
  ('82000000-0000-0000-0000-000000000001', 'Activation owner'),
  ('82000000-0000-0000-0000-000000000002', 'Activation member'),
  ('82000000-0000-0000-0000-000000000003', 'Activation outsider')
on conflict (id) do nothing;

insert into workspaces (id, name, created_by) values
  ('82000000-0000-0000-0000-000000000011', 'Activation workspace',
   '82000000-0000-0000-0000-000000000001'),
  ('82000000-0000-0000-0000-000000000012', 'Foreign workspace',
   '82000000-0000-0000-0000-000000000003');

insert into workspace_members (workspace_id, user_id, role) values
  ('82000000-0000-0000-0000-000000000011',
   '82000000-0000-0000-0000-000000000001', 'owner'),
  ('82000000-0000-0000-0000-000000000011',
   '82000000-0000-0000-0000-000000000002', 'member'),
  ('82000000-0000-0000-0000-000000000012',
   '82000000-0000-0000-0000-000000000003', 'owner');

insert into projects (id, workspace_id, name, key) values
  ('82000000-0000-0000-0000-000000000021',
   '82000000-0000-0000-0000-000000000011', 'Activation project', 'ACT');

insert into tasks (id, project_id, workspace_id, ref, title, created_by)
select
  ('82000000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  '82000000-0000-0000-0000-000000000021',
  '82000000-0000-0000-0000-000000000011',
  'ACT-' || number,
  'Task ' || number,
  '82000000-0000-0000-0000-000000000001'
from generate_series(31, 35) number;

insert into workspace_invitations (
  id, workspace_id, email_normalized, invited_by
) values (
  '82000000-0000-0000-0000-000000000041',
  '82000000-0000-0000-0000-000000000011',
  'activation-invite@test.dev',
  '82000000-0000-0000-0000-000000000001'
);
update workspace_invitations set accepted_at = now()
where id = '82000000-0000-0000-0000-000000000041';

select is(
  (select count(*)::int from activation_events
   where workspace_id = '82000000-0000-0000-0000-000000000011'
     and event_name = 'workspace_created'),
  1,
  'workspace creation is captured once'
);
select is(
  (select count(*)::int from activation_events
   where workspace_id = '82000000-0000-0000-0000-000000000011'
     and event_name = 'project_created'),
  1,
  'project creation is captured once'
);
select is(
  (select count(*)::int from activation_events
   where workspace_id = '82000000-0000-0000-0000-000000000011'
     and event_name = 'task_created'),
  5,
  'five task subjects are captured without content'
);
select is(
  (select count(*)::int from activation_events
   where event_name = 'invitation_sent'
     and subject_id = '82000000-0000-0000-0000-000000000041'),
  1,
  'invitation send is captured once'
);
select is(
  (select count(*)::int from activation_events
   where event_name = 'invitation_accepted'
     and subject_id = '82000000-0000-0000-0000-000000000041'),
  1,
  'invitation acceptance is captured once'
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','82000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
select lives_ok(
  $$ select record_activation_signal(
       '82000000-0000-0000-0000-000000000011', 'member_active'
     ) $$,
  'owner activity signal is accepted'
);
select lives_ok(
  $$ select record_activation_signal(
       '82000000-0000-0000-0000-000000000011', 'member_active'
     ) $$,
  'repeating an activity signal is idempotent'
);
select is(
  (select count(*)::int from activation_events
   where workspace_id = '82000000-0000-0000-0000-000000000011'
     and event_name = 'member_active'
     and actor_id = '82000000-0000-0000-0000-000000000001'),
  1,
  'repeated activity stores one event'
);

select set_config('request.jwt.claims',
  json_build_object('sub','82000000-0000-0000-0000-000000000002','role','authenticated')::text,
  true);
select lives_ok(
  $$ select record_activation_signal(
       '82000000-0000-0000-0000-000000000011', 'member_active'
     ) $$,
  'second member activity is accepted'
);

select set_config('request.jwt.claims',
  json_build_object('sub','82000000-0000-0000-0000-000000000001','role','authenticated')::text,
  true);
select lives_ok(
  $$ select record_activation_signal(
       '82000000-0000-0000-0000-000000000011', 'workload_viewed'
     ) $$,
  'core planning view signal is accepted'
);

select ok((select workspace_created from get_activation_status(
  '82000000-0000-0000-0000-000000000011')), 'status reports workspace creation');
select ok((select project_created from get_activation_status(
  '82000000-0000-0000-0000-000000000011')), 'status reports project creation');
select is((select task_count from get_activation_status(
  '82000000-0000-0000-0000-000000000011')), 5, 'status reports task progress');
select ok((select invitation_sent from get_activation_status(
  '82000000-0000-0000-0000-000000000011')), 'status reports invitation progress');
select ok((select second_member_active from get_activation_status(
  '82000000-0000-0000-0000-000000000011')), 'status reports two active members');
select ok((select core_view_opened from get_activation_status(
  '82000000-0000-0000-0000-000000000011')), 'status reports core planning value');
select ok((select checklist_complete from get_activation_status(
  '82000000-0000-0000-0000-000000000011')), 'the complete checklist is measurable');
select ok((select activated_within_7_days from get_activation_status(
  '82000000-0000-0000-0000-000000000011')), 'seven-day activation is measurable');

select throws_ok(
  $$ select record_activation_signal(
       '82000000-0000-0000-0000-000000000011', 'task_created'
     ) $$,
  '22023', null,
  'the client cannot forge server-authored milestones'
);
select throws_ok(
  $$ insert into activation_events (workspace_id, event_name)
     values ('82000000-0000-0000-0000-000000000011', 'member_active') $$,
  '42501', null,
  'members cannot insert activation rows directly'
);

select lives_ok(
  $$ insert into onboarding_dismissals (workspace_id, user_id)
     values ('82000000-0000-0000-0000-000000000011',
             '82000000-0000-0000-0000-000000000001') $$,
  'a user can dismiss its own checklist'
);
select ok((select dismissed from get_activation_status(
  '82000000-0000-0000-0000-000000000011')), 'dismissal is reflected in status');
select throws_ok(
  $$ insert into onboarding_dismissals (workspace_id, user_id)
     values ('82000000-0000-0000-0000-000000000011',
             '82000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  'a user cannot dismiss another member checklist'
);

select set_config('request.jwt.claims',
  json_build_object('sub','82000000-0000-0000-0000-000000000003','role','authenticated')::text,
  true);
select is_empty(
  $$ select 1 from activation_events
     where workspace_id = '82000000-0000-0000-0000-000000000011' $$,
  'activation events are tenant isolated'
);
select throws_ok(
  $$ select * from get_activation_status(
       '82000000-0000-0000-0000-000000000011'
     ) $$,
  '42501', null,
  'activation aggregate rejects a foreign member'
);

set local role postgres;
select columns_are(
  'public',
  'activation_events',
  array['id','workspace_id','actor_id','event_name','subject_id','occurred_at'],
  'activation events contain identifiers and timestamps only'
);

select * from finish();
rollback;

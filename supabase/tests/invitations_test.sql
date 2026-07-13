-- Secure invitation state, permissions, and verified-email acceptance.
begin;
select plan(26);
set local role postgres;

insert into auth.users (id, email, email_confirmed_at) values
  ('50000000-0000-0000-0000-000000000001', 'invite-owner@test.dev', now()),
  ('50000000-0000-0000-0000-000000000002', 'invite-admin@test.dev', now()),
  ('50000000-0000-0000-0000-000000000003', 'invite-member@test.dev', now()),
  ('50000000-0000-0000-0000-000000000004', 'invite-outsider@test.dev', now()),
  ('50000000-0000-0000-0000-000000000005', 'new-member@test.dev', null),
  ('50000000-0000-0000-0000-000000000006', 'expired@test.dev', now()),
  ('50000000-0000-0000-0000-000000000007', 'revoked@test.dev', now());
insert into workspaces (id, name, created_by) values
  ('51000000-0000-0000-0000-000000000001', 'Invites A', '50000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000002', 'Invites B', '50000000-0000-0000-0000-000000000004');
insert into workspace_members (workspace_id, user_id, role) values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'owner'),
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'admin'),
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'member'),
  ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004', 'owner');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','50000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
select is(
  (upsert_workspace_invitation('51000000-0000-0000-0000-000000000001',
    ' New-Member@Test.Dev ', 'member')).email_normalized,
  'new-member@test.dev', 'owner can invite and email is normalized');
select is(
  (upsert_workspace_invitation('51000000-0000-0000-0000-000000000001',
    'new-member@test.dev', 'admin')).role,
  'admin'::member_role, 'owner can resend while changing the role');
select is((select count(*)::int from workspace_invitations where workspace_id =
  '51000000-0000-0000-0000-000000000001' and email_normalized = 'new-member@test.dev'),
  1, 'resend reuses the active invitation');
select cmp_ok((select expires_at from workspace_invitations where email_normalized =
  'new-member@test.dev'), '>', now() + interval '6 days', 'resend refreshes expiry');
select throws_ok(
  $$ select upsert_workspace_invitation('51000000-0000-0000-0000-000000000001',
       'bad address', 'member') $$,
  '22023', null, 'invalid email is rejected');
select throws_ok(
  $$ select upsert_workspace_invitation('51000000-0000-0000-0000-000000000001',
       'owner@test.dev', 'owner') $$,
  '22023', null, 'invitations cannot grant ownership');

select set_config('request.jwt.claims',
  json_build_object('sub','50000000-0000-0000-0000-000000000002','role','authenticated')::text, true);
select is(
  (upsert_workspace_invitation('51000000-0000-0000-0000-000000000001',
    'admin-invite@test.dev', 'member')).role,
  'member'::member_role, 'admin can invite a member');
select throws_ok(
  $$ select upsert_workspace_invitation('51000000-0000-0000-0000-000000000001',
       'admin-role@test.dev', 'admin') $$,
  '42501', null, 'admin cannot invite another admin');

select set_config('request.jwt.claims',
  json_build_object('sub','50000000-0000-0000-0000-000000000003','role','authenticated')::text, true);
select throws_ok(
  $$ select upsert_workspace_invitation('51000000-0000-0000-0000-000000000001',
       'denied@test.dev', 'member') $$,
  '42501', null, 'ordinary member cannot invite');
select is((select count(*)::int from workspace_invitations), 0,
  'ordinary member cannot read invitations through RLS');
select throws_ok(
  $$ insert into workspace_invitations (workspace_id, email_normalized, invited_by)
     values ('51000000-0000-0000-0000-000000000001', 'forged@test.dev',
       '50000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'authenticated users cannot directly insert invitations');

select set_config('request.jwt.claims',
  json_build_object('sub','50000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
select throws_ok(
  $$ select upsert_workspace_invitation('51000000-0000-0000-0000-000000000002',
       'foreign@test.dev', 'member') $$,
  '42501', null, 'owner cannot invite into a foreign workspace');
select is((select count(*)::int from workspace_invitations), 2,
  'owner sees only invitations in their workspace');

set local role postgres;
insert into workspace_invitations (
  id, workspace_id, email_normalized, role, invited_by, expires_at, created_at
) values
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
   'expired@test.dev', 'member', '50000000-0000-0000-0000-000000000001', now() - interval '1 day',
   now() - interval '8 days'),
  ('52000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001',
   'revoked@test.dev', 'member', '50000000-0000-0000-0000-000000000001', now() + interval '1 day',
   now() - interval '1 day');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','50000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
select ok((revoke_workspace_invitation('52000000-0000-0000-0000-000000000002')).revoked_at is not null,
  'owner can revoke a pending invitation');
select ok((revoke_workspace_invitation('52000000-0000-0000-0000-000000000002')).revoked_at is not null,
  'revocation is idempotent');

select set_config('request.jwt.claims',
  json_build_object('sub','50000000-0000-0000-0000-000000000005','role','authenticated')::text, true);
select is(accept_workspace_invitations(), 0::bigint,
  'an unverified user cannot accept an invitation');
select is((select count(*)::int from workspace_members where user_id =
  '50000000-0000-0000-0000-000000000005' and workspace_id =
  '51000000-0000-0000-0000-000000000001'), 0, 'unverified user gains no membership');

set local role postgres;
update auth.users set email_confirmed_at = now()
where id = '50000000-0000-0000-0000-000000000005';
select is((select role from workspace_members where user_id =
  '50000000-0000-0000-0000-000000000005' and workspace_id =
  '51000000-0000-0000-0000-000000000001'), 'admin'::member_role,
  'verification trigger atomically adds the invited membership');
select ok((select accepted_at is not null from workspace_invitations where email_normalized =
  'new-member@test.dev'), 'verification trigger marks the invitation accepted');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','50000000-0000-0000-0000-000000000005','role','authenticated')::text, true);
select is(accept_workspace_invitations(), 0::bigint, 'acceptance is idempotent');

select set_config('request.jwt.claims',
  json_build_object('sub','50000000-0000-0000-0000-000000000006','role','authenticated')::text, true);
select is(accept_workspace_invitations(), 0::bigint, 'expired invitation cannot be accepted');
select is((select count(*)::int from workspace_members where user_id =
  '50000000-0000-0000-0000-000000000006' and workspace_id =
  '51000000-0000-0000-0000-000000000001'), 0, 'expired invite grants no membership');

select set_config('request.jwt.claims',
  json_build_object('sub','50000000-0000-0000-0000-000000000007','role','authenticated')::text, true);
select is(accept_workspace_invitations(), 0::bigint, 'revoked invitation cannot be accepted');
select is((select count(*)::int from workspace_members where user_id =
  '50000000-0000-0000-0000-000000000007' and workspace_id =
  '51000000-0000-0000-0000-000000000001'), 0, 'revoked invite grants no membership');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$ select accept_workspace_invitations() $$, '42501', null,
  'anonymous caller cannot accept invitations');
select throws_ok(
  $$ select upsert_workspace_invitation(gen_random_uuid(), 'anon@test.dev', 'member') $$,
  '42501', null, 'anonymous caller cannot invite');

select * from finish(true);
rollback;

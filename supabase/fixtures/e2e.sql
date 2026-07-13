-- Deterministic authenticated browser fixture. Local/CI only.
set search_path = public, extensions;

delete from workspaces where id = '91000000-0000-0000-0000-000000000001';
delete from auth.users where id in (
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
    'phase1-owner@example.invalid', crypt('Phase1-release-owner-2026!', gen_salt('bf')),
    now(), '', '', '', '', '{"provider":"email","providers":["email"]}',
    '{"name":"Phase One Owner"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '90000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
    'phase1-member@example.invalid', crypt('Phase1-release-member-2026!', gen_salt('bf')),
    now(), '', '', '', '', '{"provider":"email","providers":["email"]}',
    '{"name":"Phase One Member"}', now(), now()
  );

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (
    '90000000-0000-0000-0000-000000000011',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    '{"sub":"90000000-0000-0000-0000-000000000001","email":"phase1-owner@example.invalid"}',
    'email', now(), now(), now()
  ),
  (
    '90000000-0000-0000-0000-000000000012',
    '90000000-0000-0000-0000-000000000002',
    '90000000-0000-0000-0000-000000000002',
    '{"sub":"90000000-0000-0000-0000-000000000002","email":"phase1-member@example.invalid"}',
    'email', now(), now(), now()
  );

update profiles set name = 'Phase One Owner', color = '#6d5ef0'
where id = '90000000-0000-0000-0000-000000000001';
update profiles set name = 'Phase One Member', color = '#14b8a6'
where id = '90000000-0000-0000-0000-000000000002';

insert into workspaces (id, name, created_by) values
  ('91000000-0000-0000-0000-000000000001', 'Phase One Release',
   '90000000-0000-0000-0000-000000000001');
insert into workspace_members (workspace_id, user_id, role, capacity_per_week) values
  ('91000000-0000-0000-0000-000000000001',
   '90000000-0000-0000-0000-000000000001', 'owner', 40),
  ('91000000-0000-0000-0000-000000000001',
   '90000000-0000-0000-0000-000000000002', 'member', 32);
insert into projects (id, workspace_id, name, key) values
  ('92000000-0000-0000-0000-000000000001',
   '91000000-0000-0000-0000-000000000001', 'Release validation', 'P1G');

insert into tasks (
  id, project_id, workspace_id, ref, title, description, status, priority,
  assignee_id, start_date, end_date, points, position, created_by
) values
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001',
   '91000000-0000-0000-0000-000000000001', 'P1G-101', 'Chromium realtime fixture', '',
   'todo', 'high', '90000000-0000-0000-0000-000000000001', current_date, current_date + 2, 5, 1024,
   '90000000-0000-0000-0000-000000000001'),
  ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001',
   '91000000-0000-0000-0000-000000000001', 'P1G-102', 'Firefox realtime fixture', '',
   'todo', 'medium', '90000000-0000-0000-0000-000000000002', current_date + 7, current_date + 9, 3, 2048,
   '90000000-0000-0000-0000-000000000001'),
  ('93000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000001',
   '91000000-0000-0000-0000-000000000001', 'P1G-103', 'WebKit realtime fixture', '',
   'in_progress', 'urgent', null, null, null, 2, 3072,
   '90000000-0000-0000-0000-000000000001');

insert into task_tags (task_id, tag) values
  ('93000000-0000-0000-0000-000000000001', 'Frontend'),
  ('93000000-0000-0000-0000-000000000002', 'Backend');

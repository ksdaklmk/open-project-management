-- Northwind demo seed
-- Insert order matters:
--   1. auth.users first; the production handle_new_user trigger creates only
--      a bare profile and never grants workspace access.
--   2. Upsert profiles to set name/color on the trigger-created row.
--   3. Workspaces, then explicit local-only demo memberships. Hosted
--      environments must never apply this file.
--   4. Projects, tasks (workspace_id auto-filled by set_task_workspace trigger).
--   5. Tags and activity.

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'demo@northwind.dev');

-- Upsert: handle_new_user already inserted a bare profile row; update it with
-- the display name and brand color.  Using ON CONFLICT also keeps this safe for
-- a fresh `supabase db reset` where the same trigger fires.
insert into profiles (id, name, color)
  values ('10000000-0000-0000-0000-000000000001', 'Demo Owner', '#6d5ef0')
  on conflict (id) do update set name = excluded.name, color = excluded.color;

insert into workspaces (id, name, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'Northwind', '10000000-0000-0000-0000-000000000001');

insert into workspace_members (workspace_id, user_id, role, capacity_per_week) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner', 40);

insert into projects (id, workspace_id, name, key, color) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Nimbus', 'NIM', '#6d5ef0');

insert into tasks (project_id, ref, type, title, status, priority, assignee_id, start_date, end_date, points, position, created_by) values
  ('30000000-0000-0000-0000-000000000001', 'NIM-101', 'feature', 'Design login screen',  'in_progress', 'high',   '10000000-0000-0000-0000-000000000001', '2026-06-22', '2026-06-26', 5, 1, '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'NIM-102', 'bug',     'Fix board drag jitter', 'todo',       'urgent', '10000000-0000-0000-0000-000000000001', '2026-06-24', '2026-06-25', 3, 2, '10000000-0000-0000-0000-000000000001')
on conflict (project_id, ref) do nothing;

insert into tasks (project_id, ref, type, title, status, priority, assignee_id, start_date, end_date, points, position, created_by) values
  ('30000000-0000-0000-0000-000000000001', 'NIM-103', 'feature',     'Auth rate limiting', 'in_progress', 'high',   '10000000-0000-0000-0000-000000000001', '2026-06-29', '2026-07-03', 5, 3, '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'NIM-104', 'chore',       'Billing webhooks',   'todo',        'medium', '10000000-0000-0000-0000-000000000001', '2026-07-06', '2026-07-10', 3, 4, '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'NIM-105', 'improvement', 'Onboarding emails',  'backlog',     'low',    '10000000-0000-0000-0000-000000000001', null,         null,         2, 5, '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'NIM-106', 'chore',       'Dark-mode polish',   'backlog',     'low',    '10000000-0000-0000-0000-000000000001', null,         null,         1, 6, '10000000-0000-0000-0000-000000000001')
on conflict (project_id, ref) do nothing;

insert into task_tags (task_id, tag)
  select id, 'Frontend' from tasks where ref = 'NIM-101';

insert into activity (workspace_id, actor_id, task_id, verb, to_status)
  select '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', id, 'created', 'todo'
  from tasks where ref = 'NIM-101';

-- Second member + Workload-shaping data (added with the Workload view)
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000002', 'dana@northwind.dev')
on conflict (id) do nothing;

insert into profiles (id, name, color)
  values ('10000000-0000-0000-0000-000000000002', 'Dana Lee', '#14b8a6')
  on conflict (id) do update set name = excluded.name, color = excluded.color;

insert into workspace_members (workspace_id, user_id, role, capacity_per_week) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'member', 8)
on conflict (workspace_id, user_id) do update set role = excluded.role, capacity_per_week = excluded.capacity_per_week;

update workspace_members set capacity_per_week = 10
  where workspace_id = '20000000-0000-0000-0000-000000000001'
    and user_id = '10000000-0000-0000-0000-000000000001';

update tasks set points = 13 where project_id = '30000000-0000-0000-0000-000000000001' and ref = 'NIM-103';
update tasks set points = 9  where project_id = '30000000-0000-0000-0000-000000000001' and ref = 'NIM-104';

insert into tasks (project_id, ref, type, title, status, priority, assignee_id, start_date, end_date, points, position, created_by) values
  ('30000000-0000-0000-0000-000000000001', 'NIM-107', 'feature', 'Search indexing',     'in_progress', 'high',   '10000000-0000-0000-0000-000000000002', '2026-06-29', '2026-07-01', 8,  7, '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'NIM-108', 'chore',   'Log retention sweep', 'todo',        'medium', '10000000-0000-0000-0000-000000000002', '2026-07-13', '2026-07-15', 10, 8, '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'NIM-109', 'feature', 'Public API docs',     'todo',        'medium', null,                                   '2026-07-06', '2026-07-08', 6,  9, '10000000-0000-0000-0000-000000000001')
on conflict (project_id, ref) do nothing;

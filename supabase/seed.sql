-- Northwind demo seed
-- Insert order matters:
--   1. auth.users first (no Northwind workspace yet, so handle_new_user creates
--      a bare profile but skips workspace_members auto-join).
--   2. Upsert profiles to set name/color on the trigger-created row.
--   3. Workspaces, then members with the desired owner role.
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
  ('30000000-0000-0000-0000-000000000001', 'NIM-102', 'bug',     'Fix board drag jitter', 'todo',       'urgent', '10000000-0000-0000-0000-000000000001', '2026-06-24', '2026-06-25', 3, 2, '10000000-0000-0000-0000-000000000001');

insert into task_tags (task_id, tag)
  select id, 'Frontend' from tasks where ref = 'NIM-101';

insert into activity (workspace_id, actor_id, task_id, verb, to_status)
  select '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', id, 'created', 'todo'
  from tasks where ref = 'NIM-101';

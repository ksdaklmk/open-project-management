-- Deterministic Phase 1C fixture: 10 workspaces, 100 users/members,
-- 50 projects, 50,000 tasks, plus tags, comments, subtasks, and activity.
-- Local/staging performance environments only. Never apply to production.
-- Re-running is safe; all fixture identities are derived from stable md5 UUIDs.

set statement_timeout = '5min';
set client_min_messages = warning;

insert into auth.users (id, email)
select md5('scale-user-' || n)::uuid, 'scale-user-' || n || '@example.invalid'
from generate_series(1, 100) n
on conflict (id) do nothing;

update profiles
set name = 'Scale User ' || fixture.n,
    color = case fixture.n % 4
      when 0 then '#6d5ef0' when 1 then '#14b8a6'
      when 2 then '#f59e0b' else '#e5484d' end
from generate_series(1, 100) fixture(n)
where profiles.id = md5('scale-user-' || fixture.n)::uuid;

insert into workspaces (id, name, created_by)
select md5('scale-workspace-' || n)::uuid,
       'Scale Workspace ' || n,
       md5('scale-user-' || ((n - 1) * 10 + 1))::uuid
from generate_series(1, 10) n
on conflict (id) do nothing;

insert into workspace_members (workspace_id, user_id, role, capacity_per_week)
select md5('scale-workspace-' || workspace_n)::uuid,
       md5('scale-user-' || ((workspace_n - 1) * 10 + member_n))::uuid,
       case when member_n = 1 then 'owner'::member_role else 'member'::member_role end,
       32 + (member_n % 3) * 8
from generate_series(1, 10) workspace_n
cross join generate_series(1, 10) member_n
on conflict (workspace_id, user_id) do nothing;

insert into projects (id, workspace_id, name, key, color)
select md5('scale-project-' || project_n)::uuid,
       md5('scale-workspace-' || (((project_n - 1) / 5) + 1))::uuid,
       'Scale Project ' || project_n,
       'S' || lpad(project_n::text, 2, '0'),
       '#6d5ef0'
from generate_series(1, 50) project_n
on conflict (id) do nothing;

insert into tasks (
  id, project_id, ref, type, title, description, status, priority,
  assignee_id, start_date, end_date, points, position, created_by
)
select md5('scale-task-' || task_n)::uuid,
       md5('scale-project-' || (((task_n - 1) / 1000) + 1))::uuid,
       'S' || lpad((((task_n - 1) / 1000) + 1)::text, 2, '0') ||
         '-' || lpad((((task_n - 1) % 1000) + 1)::text, 4, '0'),
       (array['feature','bug','chore','improvement']::task_type[])[1 + task_n % 4],
       'Deterministic scale task ' || task_n,
       'Privacy-safe generated description for performance fixture ' || task_n,
       (array['backlog','todo','in_progress','in_review','done']::task_status[])[1 + task_n % 5],
       (array['urgent','high','medium','low']::task_priority[])[1 + task_n % 4],
       case when task_n % 7 = 0 then null else
         md5('scale-user-' || ((((task_n - 1) / 5000) * 10) + (task_n % 10) + 1))::uuid end,
       case when task_n % 9 = 0 then null else
         date '2026-01-05' + (task_n % 364) end,
       case when task_n % 9 = 0 then null else
         date '2026-01-05' + (task_n % 364) + (task_n % 10) end,
       task_n % 14,
       ((task_n - 1) % 1000 + 1) * 1024.0,
       md5('scale-user-' || ((((task_n - 1) / 5000) * 10) + 1))::uuid
from generate_series(1, 50000) task_n
on conflict (id) do nothing;

insert into task_tags (task_id, tag)
select md5('scale-task-' || task_n)::uuid,
       (array['Frontend','Backend','Design','Research'])[1 + task_n % 4]
from generate_series(1, 50000) task_n
where task_n % 3 = 0
on conflict do nothing;

insert into subtasks (id, task_id, title, done, position)
select md5('scale-subtask-' || task_n)::uuid,
       md5('scale-task-' || task_n)::uuid,
       'Generated subtask ' || task_n,
       task_n % 4 = 0,
       1024
from generate_series(1, 50000) task_n
where task_n % 2 = 0
on conflict (id) do nothing;

insert into comments (id, task_id, author_id, body, created_at)
select md5('scale-comment-' || task_n)::uuid,
       md5('scale-task-' || task_n)::uuid,
       md5('scale-user-' || ((((task_n - 1) / 5000) * 10) + 1))::uuid,
       'Generated fixture comment ' || task_n,
       timestamptz '2026-01-01 00:00:00+00' + task_n * interval '1 second'
from generate_series(1, 50000) task_n
where task_n % 5 = 0
on conflict (id) do nothing;

analyze tasks;
analyze task_tags;
analyze comments;
analyze activity;

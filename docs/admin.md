# Admin Runbook (admin-by-SQL)

This app deliberately has no UI for workspace, project, or member management —
the owner administers by SQL (post-v1 roadmap decision, spec
`2026-07-07-make-it-adoptable-design.md`). Run these in the Supabase SQL editor
(hosted) or `psql` (local); both run as a privileged role, bypassing RLS by design.

Local psql:

    podman exec -it supabase_db_open-project-management psql -U postgres -d postgres

## Create a workspace (and make yourself its owner)

    insert into workspaces (name, created_by)
      values ('Acme Team', (select id from auth.users where email = 'you@example.com'))
      returning id;
    insert into workspace_members (workspace_id, user_id, role)
      values ('<workspace-id-from-above>',
              (select id from auth.users where email = 'you@example.com'),
              'owner');

Do **not** name a real workspace with the demo seed UUID
`20000000-0000-0000-0000-000000000001`; the name "Northwind" is fine —
auto-join is pinned to that UUID, not the name.

## Add a member (they must have signed up first)

    insert into workspace_members (workspace_id, user_id, role)
      values ('<workspace-id>',
              (select id from auth.users where email = 'teammate@example.com'),
              'member');

## Create a project (key becomes the task-ref prefix, e.g. ACME-101)

    insert into projects (workspace_id, name, key)
      values ('<workspace-id>', 'Acme Website', 'ACME');

## Fix a profile name (blank names render as "Someone")

    update profiles set name = 'Real Name'
      where id = (select id from auth.users where email = 'teammate@example.com');

## Remove a member (their tasks stay; assignee falls back to unassigned display)

    delete from workspace_members
      where workspace_id = '<workspace-id>'
        and user_id = (select id from auth.users where email = 'teammate@example.com');

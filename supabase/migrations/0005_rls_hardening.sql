-- 0005_rls_hardening.sql
-- docs/AUDIT.md finding 3: membership-only UPDATE policies plus blanket
-- table-level UPDATE grants (0002) let a dual-workspace member re-parent rows
-- across tenants (task -> other workspace's project, project -> other
-- workspace, subtask/comment/tag -> other workspace's task) and rewrite
-- provenance (created_by, author_id, ref, ids, timestamps).
--
-- Fix at the privilege layer: revoke table-level UPDATE and re-grant only the
-- content columns the app edits. Identity, tenancy, parent keys, refs,
-- authorship and timestamps become immutable to the API roles; RLS policies
-- remain the row-level gate on the columns that stay writable. Proven by the
-- dual-membership section of supabase/tests/rls_test.sql.
-- (updated_at stays server-maintained by 0003's trigger — a BEFORE trigger
-- assigns NEW columns without the caller holding the column privilege.)

revoke update on
  profiles, workspaces, workspace_members, projects, tasks,
  subtasks, task_tags, comments, activity
from authenticated;

grant update (name, color) on profiles to authenticated;
grant update (name, color) on projects to authenticated;
grant update (title, description, status, priority, type, points,
              start_date, end_date, assignee_id, position)
  on tasks to authenticated;
grant update (title, done, position) on subtasks to authenticated;
grant update (body) on comments to authenticated;
-- workspaces / workspace_members / activity: no update policy exists, so no
-- update grant either. task_tags: the app mutates tags via delete+insert
-- (the PK is the whole row), so UPDATE stays revoked entirely.

-- PostgREST caches column privileges in its schema cache.
notify pgrst, 'reload schema';

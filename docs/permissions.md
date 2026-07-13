# Workspace permissions

This document is the product and security contract for workspace roles. The database row-level
security (RLS) policies are authoritative; interface controls must reflect these permissions but
must not be treated as the security boundary.

## Role matrix

| Capability                                          | Owner | Admin | Member |
| --------------------------------------------------- | ----: | ----: | -----: |
| Read workspace, project, and task data              |   Yes |   Yes |    Yes |
| Create and edit tasks, subtasks, tags, and comments |   Yes |   Yes |    Yes |
| Delete tasks                                        |   Yes |   Yes |    Yes |
| Create, edit, and archive projects                  |   Yes |   Yes |     No |
| Invite and remove members, and edit capacity        |   Yes |   Yes |     No |
| Promote and demote admins                           |   Yes |    No |     No |
| Transfer ownership and delete the workspace         |   Yes |    No |     No |

Ordinary members may delete tasks in the initial permission model. This preserves the existing
collaborative workflow and is a product decision, not a configurable workspace setting yet.

## Invariants

- A caller must belong to the workspace before reading or changing workspace data.
- Every workspace must retain at least one owner. The final owner cannot be demoted or removed.
- Only owners may grant or revoke the admin role.
- Role, membership, and capacity changes use audited administration operations; browser clients
  cannot update those fields directly.
- A task assignee must be a member of the task's workspace. Removing a member must unassign their
  tasks atomically before deleting the membership.
- The server derives tenant, authorship, and other provenance fields; clients cannot forge them.
- Anonymous and non-member callers have no workspace access.

## Implementation references

- RLS and invariant coverage: `supabase/tests/rls_test.sql`
- Workspace settings controls: `src/features/settings/` (introduced by Phase 1 Task 1.5)

Any permission change must update this contract, the relevant interface states, and positive and
negative RLS tests in the same change.

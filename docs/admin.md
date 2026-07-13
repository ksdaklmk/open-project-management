# Workspace administration

Normal workspace administration uses authenticated database RPCs. Do not edit `workspaces`,
`projects`, or `workspace_members` directly in the SQL editor: direct membership writes are
revoked, and bypassing the RPCs would skip their permission checks and transactional behaviour.

The settings interface introduced by Phase 1 Task 1.5 calls these operations. Until that interface
is available, they can be exercised through an authenticated Supabase client with `supabase.rpc`.

| Operation                              | RPC                            | Required role      |
| -------------------------------------- | ------------------------------ | ------------------ |
| Create a workspace and initial project | `create_workspace`             | Authenticated user |
| Rename a workspace                     | `update_workspace`             | Owner or admin     |
| Create a project                       | `create_project`               | Owner or admin     |
| Rename a project                       | `update_project`               | Owner or admin     |
| Archive a project                      | `archive_project`              | Owner or admin     |
| Promote or demote an admin             | `set_member_role`              | Owner              |
| Change weekly capacity                 | `set_member_capacity`          | Owner or admin     |
| Remove a member                        | `remove_workspace_member`      | Owner or admin     |
| Transfer ownership                     | `transfer_workspace_ownership` | Owner              |

Member invitations are deliberately not replaced by an insecure “add user ID” RPC. Secure email
invitations and acceptance are introduced by Phase 1 Task 1.6.

## Safety guarantees

- RPCs authenticate with `auth.uid()` and return the same authorisation error for missing and
  foreign-tenant resources.
- Workspace creation, its owner membership, and the initial project commit or roll back together.
- A workspace always retains an owner. Ownership transfer promotes the replacement before
  demoting the previous owner.
- Member removal unassigns their tasks before deleting membership and reports the affected task
  count. If removal fails, both changes roll back.
- Project keys are normalised to uppercase and remain immutable after creation.
- Anonymous callers cannot execute administration RPCs.

For emergency operator intervention, follow the incident and change-control procedures in
`docs/operations.md`; privileged SQL is not a normal product administration path.

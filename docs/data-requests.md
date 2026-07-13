# Account, membership, export, and deletion requests

## Intake and authorization

1. Create a private request record with requester, UTC time, scope, jurisdiction/contract deadline,
   and assigned operator/reviewer. Never copy task or comment content into the ticket by default.
2. Reauthenticate the requester. For workspace data, require a current owner and independently
   verify the workspace ID. A profile owner may request only workspaces they can access.
3. Place legal/retention holds before export or deletion. Record the approved retention decision.

## Export

1. Use a short-lived least-privilege operator session against a restored/read-only environment when
   practical. Keep RLS enabled.
2. Export only authorized workspace rows and related projects, tasks, tags, subtasks, comments,
   activity, memberships, and invitations. Exclude password hashes, tokens, provider secrets, and
   data from other tenants.
3. Encrypt the artifact, deliver it through the approved expiring channel, and communicate the key
   separately. Record row counts and reviewer approval, then delete working copies on schedule.

## Member or account deletion

1. Preview owned workspaces, memberships, assigned tasks, invitations, and historical attribution.
2. A sole owner must transfer ownership or delete the workspace first. Use the application/RPC
   paths; never bypass RLS with ad-hoc client SQL.
3. Revoke invitations and active sessions, remove memberships, then delete the Auth user. Existing
   attribution foreign keys intentionally become null while historical activity survives.
4. Verify Auth, database, storage, integrations, logs, and derived analytics according to policy.
   Record counts before/after and reviewer sign-off.

## Workspace deletion

Require a second owner confirmation containing the workspace name, a backup/retention decision,
and an independent reviewer. Disable outbound integrations, delete through a reviewed privileged
operation, verify all cascaded tenant rows and storage objects, and retain only the minimum audit
record allowed by policy.

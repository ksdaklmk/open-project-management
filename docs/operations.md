# Operations

## Service ownership and signals

Assign a named primary and backup on-call owner before production launch. Monitor frontend
exceptions, page-load failures, mutation failures, p95 task-list latency, Supabase database/API/Auth
health, Realtime reconnects, Edge Function errors, email delivery, backup status, and dependency
advisories. Customer task content, comments, emails, tokens, and credentials must be redacted.

The frontend emits release-tagged `opm:telemetry` browser events and calls
`window.__OPM_TELEMETRY__.capture` when a monitoring adapter is installed before the app starts.
The built-in allowlist accepts only view/operation/status/duration/metric/reconnect/error-name
metadata; it drops all other fields. Configure the hosted provider adapter and release ID without
adding task titles, descriptions, comment bodies, email addresses, workspace names, or tokens.
The invitation Edge Function logs one structured JSON record containing only request ID, status,
outcome, and duration. The notification worker logs only claimed and delivered counts; recipient
addresses and task/comment content are excluded.

Alert when `notification_outbox` has `dead` rows or old `pending` rows beyond the delivery SLO.
The service-role worker is the only delivery process: task/comment transactions enqueue identifiers
and commit without waiting for the email provider. Before replaying a failed batch, verify provider
health and sender configuration; idempotent notification keys prevent a repeated product event from
creating another outbox row.

## Routine checks

- Every release: run all CI gates, post-deploy smoke, migration status, and error-rate comparison.
- Daily: check availability, error budget, Auth/email failures, database saturation, and backups.
- Weekly: review slow queries, failed mutations, Realtime reconnects, dependency advisories, and
  security alerts.
- Monthly: test alert routing, review access and secrets, and verify restore documentation.

## Incident response

1. Acknowledge and assign an incident lead; record UTC start time and affected tenant surface.
2. Contain exposure. Disable a faulty frontend release or feature flag; never disable RLS to
   restore service.
3. Preserve privacy-safe logs, release identifiers, migration versions, and relevant query plans.
4. Choose rollback for frontend-only changes. Database migrations are append-only: restore only
   for catastrophic data loss; otherwise deploy a reviewed forward-fix migration.
5. Validate tenant isolation, Auth, reads, writes, and background/realtime behaviour before closing.
6. Communicate impact and recovery, then record causes, actions, owners, and deadlines.

## Backup and restore

Enable hosted point-in-time recovery or scheduled backups based on recovery-point objectives.
Quarterly, restore the latest backup to an isolated disposable project, time the operation, verify
migration version and row counts, run pgTAP, and perform a sign-in/task smoke test. Never connect a
restored environment to production email, OAuth callbacks, webhooks, or analytics.

Record the achieved recovery point and recovery time after each rehearsal. Delete the disposable
project after evidence and follow-up actions are retained.

Run `npm run test:restore` for the repository's local logical-dump rehearsal. It recreates
database-level Realtime publication membership (schema-filtered dumps do not carry it), compares
source and restored application row counts, verifies the current migration version, and runs restore-specific
pgTAP checks in a disposable database. A passing local run supplements but does not replace the
hosted backup/PITR rehearsal above.

## Rollback and forward-fix

- Frontend: redeploy the previous immutable artefact, confirm its expected schema compatibility,
  and run smoke checks.
- Database: do not edit or reverse an applied migration casually. Add a new migration that safely
  repairs schema/data and can coexist with both frontend versions during rollout.
- Credentials: rotate the affected key in Supabase/provider settings, update encrypted deployment
  secrets, redeploy, revoke the old key, and verify no client bundle contains it.

## Data and account requests

Authenticate requesters and verify workspace ownership before exports or destructive action.
Export only the requester's authorised tenant data. Account/workspace deletion requires a preview,
explicit confirmation, backup/retention decision, audit record, and verification that Auth,
database, storage, integrations, and derived analytics are removed according to policy.

Use the detailed [data-request runbook](data-requests.md) and [key-rotation runbook](key-rotation.md).

## Local database troubleshooting

Re-derive `DOCKER_HOST` after a Podman machine restart. Under Podman, `supabase start` and
`supabase db reset` can hang during service restart; apply migrations with `supabase migration up`
and run pgTAP with `npm run test:db`. Inspect the database container with
`podman logs supabase_db_open-project-management` and query with `podman exec -i`.

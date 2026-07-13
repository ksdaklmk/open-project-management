# Deployment

This runbook separates hosted production settings from `supabase/config.toml`, which is local-only.
Use distinct Supabase projects and deployment environments for staging and production.

## Required environment

The frontend build receives only:

- `VITE_SUPABASE_URL`: hosted project API URL over HTTPS;
- `VITE_SUPABASE_ANON_KEY`: hosted anon/publishable key.

Never expose the service-role key in Vite variables, browser bundles, logs, or analytics. Keep
Supabase access tokens and database credentials in the deployment platform's encrypted secrets.

The `invite-member` and `deliver-notifications` Edge Functions receive `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` from the hosted Supabase runtime; invitations also use the runtime anon
key. Set server-only URL and email-provider secrets without a `VITE_` prefix:

```sh
supabase secrets set \
  SITE_URL=https://app.example.com \
  RESEND_API_KEY=replace-with-provider-key \
  NOTIFICATION_FROM_EMAIL=notifications@example.com \
  --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy invite-member --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy deliver-notifications --project-ref "$SUPABASE_PROJECT_REF"
```

Configure the hosted scheduler to POST to `deliver-notifications` with the service-role bearer token
every five minutes. The worker idempotently creates due-soon events, claims up to 25 outbox rows
with `SKIP LOCKED`, and records retry/dead-letter state. Never place the service-role token in the
frontend or scheduler logs.

## Hosted Supabase configuration

Configure each hosted project in the Supabase dashboard rather than copying local
`supabase/config.toml`:

- set the exact canonical site URL and allow only required staging/production callback URLs;
- enable email confirmation and secure email-change/password-change behaviour;
- require at least twelve characters and an appropriate password complexity policy;
- configure custom SMTP with a verified sender and test delivery/failure reporting;
- configure Google/GitHub OAuth secrets and exact callback URLs if those providers are enabled;
- enable CAPTCHA and tune Auth/email rate limits for expected traffic;
- verify API-exposed schemas, explicit grants, RLS policies, and Realtime publication membership;
- enable daily backups or point-in-time recovery appropriate to the service tier;
- configure log retention, privacy-safe error monitoring, and release identifiers.

## Promotion

1. Require green unit, coverage, lint, formatting, build, pgTAP, and browser-smoke CI checks.
2. Back up production and record the current frontend release and migration version.
3. Link the Supabase CLI to staging and run `supabase migration list`.
4. Apply append-only migrations with `supabase db push` or the approved CI promotion job.
5. Regenerate types locally and ensure CI's generated-type drift check is clean.
6. Deploy both Edge Functions with the exact `SITE_URL`, verified sender, and provider secrets;
   enable the five-minute notification schedule.
7. Deploy the frontend to staging and run the golden-path smoke test.
8. Promote the same immutable frontend artefact, migrations, and Edge Function to production.
9. Run post-deploy sign-in, invitation acceptance, workspace read, task read/write, and RLS
   isolation smoke checks.

Run the privacy-safe automated portion with a dedicated least-privilege smoke account:

```sh
SITE_URL=https://app.example.com \
SUPABASE_URL=https://project.supabase.co \
SUPABASE_ANON_KEY=... SMOKE_EMAIL=... SMOKE_PASSWORD=... \
SMOKE_DENIED_WORKSPACE_ID=existing-foreign-workspace-uuid \
node scripts/post-deploy-smoke.mjs
```

Use an existing workspace that the smoke account does not belong to for
`SMOKE_DENIED_WORKSPACE_ID`; a made-up UUID is not a meaningful isolation check. The script logs
status and timing only. It creates and deletes one opaque smoke task, leaving only the intentional
activity audit trail and consumed task reference. It never logs the email, access token, or task
content.
Use `VITE_FEATURE_REALTIME` and `VITE_FEATURE_ADMIN` as the reversible rollout controls documented
in [the release gate](release-gate.md).

Do not run `supabase/seed.sql` against staging or production. Do not rewrite an applied migration;
ship a forward-fix migration.

Migration `0011_remove_demo_auto_join.sql` makes the production signup trigger profile-only. The
Northwind workspace and its explicit memberships exist solely in `supabase/seed.sql`. After
promotion, verify both paths in staging: an arbitrary confirmed signup has a profile and zero
workspace memberships, while a confirmed invited signup receives only its live, unexpired,
non-revoked invitation memberships.

## Production checklist

- [ ] Canonical site URL and exact Auth redirect URLs are correct.
- [ ] Email confirmation, verified custom SMTP, and delivery alerts are enabled.
- [ ] Password length/complexity and secure password-change settings are approved.
- [ ] CAPTCHA and Auth/API/email rate limits are enabled and tested.
- [ ] OAuth secrets are environment-specific and callbacks are verified.
- [ ] No service-role key or production credential exists in the browser bundle.
- [ ] Both Edge Functions are deployed with the exact canonical `SITE_URL` secret.
- [ ] The notification worker schedule, verified sender, retry path, and dead-letter alert are tested.
- [ ] Arbitrary signups receive no workspace; verified invitation acceptance grants only invited
      memberships.
- [ ] All migrations, grants, RLS tests, schema drift, and generated types pass from zero.
- [ ] Realtime publication contains only intended tables.
- [ ] Backups/PITR are enabled and a restore rehearsal has succeeded.
- [ ] Error monitoring, release tags, health checks, and alert ownership are configured.
- [ ] Key rotation owner, schedule, and emergency procedure are recorded.
- [ ] Rollback/forward-fix commands and the previous frontend artefact are available.

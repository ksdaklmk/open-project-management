# Deployment

This runbook separates hosted production settings from `supabase/config.toml`, which is local-only.
Use distinct Supabase projects and deployment environments for staging and production.

## Required environment

The frontend build receives only:

- `VITE_SUPABASE_URL`: hosted project API URL over HTTPS;
- `VITE_SUPABASE_ANON_KEY`: hosted anon/publishable key.

Never expose the service-role key in Vite variables, browser bundles, logs, or analytics. Keep
Supabase access tokens and database credentials in the deployment platform's encrypted secrets.

## Hosted Supabase configuration

Configure each hosted project in the Supabase dashboard rather than copying local
`supabase/config.toml`:

- set the exact canonical site URL and allow only required staging/production callback URLs;
- enable email confirmation and secure email-change/password-change behaviour;
- require at least eight characters and an appropriate password complexity policy;
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
6. Deploy the frontend to staging and run the golden-path smoke test.
7. Promote the same immutable frontend artefact and migrations to production.
8. Run post-deploy sign-in, workspace read, task read/write, and RLS isolation smoke checks.

Do not run `supabase/seed.sql` against staging or production. Do not rewrite an applied migration;
ship a forward-fix migration.

## Production checklist

- [ ] Canonical site URL and exact Auth redirect URLs are correct.
- [ ] Email confirmation, verified custom SMTP, and delivery alerts are enabled.
- [ ] Password length/complexity and secure password-change settings are approved.
- [ ] CAPTCHA and Auth/API/email rate limits are enabled and tested.
- [ ] OAuth secrets are environment-specific and callbacks are verified.
- [ ] No service-role key or production credential exists in the browser bundle.
- [ ] All migrations, grants, RLS tests, schema drift, and generated types pass from zero.
- [ ] Realtime publication contains only intended tables.
- [ ] Backups/PITR are enabled and a restore rehearsal has succeeded.
- [ ] Error monitoring, release tags, health checks, and alert ownership are configured.
- [ ] Key rotation owner, schedule, and emergency procedure are recorded.
- [ ] Rollback/forward-fix commands and the previous frontend artefact are available.

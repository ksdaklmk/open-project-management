# Phase 1 production release gate

Repository automation can prove build, database, browser, accessibility, dependency, and scale
properties. Hosted configuration and recovery evidence require an accountable operator and must
not be checked off from local code alone.

## Environment record

Record these in the private release system, not this repository:

- staging and production Supabase project refs, regions, and owners;
- frontend immutable release ID and migration version;
- SMTP sender/domain, OAuth callback verification, and Auth abuse-protection owner;
- backup/PITR policy, recovery point objective, recovery time objective, and alert route;
- primary/backup incident owners and key-rotation owner.

## Promotion evidence

- [x] `npm run test`, `test:coverage`, `build`, `lint`, and `format:check` pass.
- [x] `npm run test:db -- --repeat 3` passes from a clean migration replay.
- [x] Chromium, Firefox, and WebKit golden paths and automated Axe checks pass.
- [ ] Manual keyboard and screen-reader smoke is recorded.
- [x] Two-browser Realtime test passes with `VITE_FEATURE_REALTIME=true`.
- [ ] The 50k fixture meets [performance budgets](performance.md) on staging.
- [ ] Permission/RLS matrix has an independent reviewer.
- [x] `npm audit` has no critical/high advisory.
- [ ] Custom SMTP, confirmation, redirect, password, CAPTCHA, and rate limits are verified.
- [ ] Backups/PITR are healthy and a restore rehearsal is recorded below.
- [ ] `scripts/post-deploy-smoke.mjs` passes against staging, then production.

## Repository evidence — 2026-07-13

- 64 Vitest files / 304 tests passed; coverage was 87.69% statements, 74.63% branches, 85.42%
  functions, and 91.24% lines.
- All 12 Playwright tests passed in Chromium, Firefox, and WebKit. The suite covers authenticated
  create/edit/comment flows, all views, 320px layout, keyboard skip navigation, Axe, and two
  independent Realtime browser contexts.
- The complete database suite passed three consecutive runs. Local logical restore rehearsals
  completed in 1–2 seconds with migration `0017`, exact row-count parity, restored RLS/read-write
  smoke, query contracts, and Realtime publication verification.
- The deterministic 50,000-task fixture measured 6.24ms local query p95 against the 2,000ms
  budget. Initial compressed JS + CSS measured 140.6 KiB against 220 KiB. The fixtures were removed.
- The post-deploy script passed locally through frontend/Auth health, sign-in, bounded reads,
  existing foreign-workspace denial, temporary task creation, and cleanup.
- `npm audit --audit-level=high` reported zero vulnerabilities.

Local evidence does not check the staging performance, hosted configuration, hosted backup/PITR,
independent-review, manual assistive-technology, or staging/production smoke boxes above.

Validate the private staging/production record without committing it:

```sh
npm run validate:release-env -- /secure/path/release-environments.json
```

## Restore rehearsal record

Copy this block into the private incident/release system for every rehearsal:

```text
Rehearsal UTC:
Operator / reviewer:
Source backup timestamp:
Disposable restore project:
Recovery point achieved:
Restore started / usable:
Measured RTO:
Migration version and row counts verified:
pgTAP / sign-in / task smoke results:
Production email, OAuth, webhooks, analytics disconnected:
Gaps, owners, deadlines:
Disposable project deleted UTC:
```

For a local logical-dump rehearsal, run `npm run test:restore`. This checks exact application row
counts, migration version, restored structure, tenant isolation, writes, query contracts, and the
Realtime publication in a disposable database. It does not replace a hosted backup/PITR restore.

## Reversible rollout

`VITE_FEATURE_REALTIME=false` disables workspace subscriptions while leaving query refetch and
mutations available. `VITE_FEATURE_ADMIN=false` hides privileged settings while retaining the
server-side RPC permission boundary. These are build-time flags: roll back by redeploying the
previous immutable artefact or rebuild the same commit with the flag disabled. Never disable RLS.

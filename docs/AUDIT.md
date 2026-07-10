# Project Audit

Date: 2026-07-10
Branch: `feat/make-it-adoptable`
Commit reviewed: `0e3c498`

## Scope

This audit covered the codebase, handoff state, adoption plan, Supabase schema/RLS migrations, data repositories, hooks, UI workflows, tests, build, and dependency posture. Tasks 4-7 in the adoption plan remain intentionally pending, so missing planned features from those tasks are not counted as defects unless the current plan would introduce or preserve a correctness issue.

## Findings

1. **High: cached tenant data can cross account boundaries.** The global QueryClient survives auth changes, query keys omit the user ID, and fresh data remains cached for 30 seconds ([`src/main.tsx`](../src/main.tsx#L17), [`src/lib/queryClient.ts`](../src/lib/queryClient.ts#L3), [`src/lib/hooks/useWorkspaces.ts`](../src/lib/hooks/useWorkspaces.ts#L5)). Task 6's planned sign-out could let user B briefly see user A's cached workspaces and tasks. Clear the cache on identity changes, scope keys and workspace storage by user, and add an account-switch integration test.

2. **High: independent session hooks create a write race.** Every mutation mounts another `useSession()` initially containing `null`, then substitutes an empty actor UUID ([`src/lib/hooks/useSession.ts`](../src/lib/hooks/useSession.ts#L5), [`src/lib/hooks/useCreateTask.ts`](../src/lib/hooks/useCreateTask.ts#L10), [`src/lib/hooks/useComments.ts`](../src/lib/hooks/useComments.ts#L13)). Fast create/comment operations can fail; a move can persist without activity. Use one `SessionProvider` and never issue mutations without a valid user ID.

3. **High: RLS permits cross-tenant reparenting and provenance changes.** Full-table update privileges plus membership-only policies allow a dual-workspace member to move a task from workspace A into a project in workspace B, exposing its children to B members ([`supabase/migrations/0002_rls.sql`](../supabase/migrations/0002_rls.sql#L105)). Project workspace moves can also desynchronise existing tasks, and `created_by` can be forged. Make IDs, parent keys, tenant keys, refs, authorship, and timestamps immutable; grant update only on editable columns; add dual-membership pgTAP cases.

4. **High: the 1,000-row API limit silently loses tasks and breaks task-ref allocation.** `listTasks` and the new ref scan are unpaginated, while Supabase caps responses at 1,000 rows ([`supabase/config.toml`](../supabase/config.toml#L18), [`src/data/tasksRepo.ts`](../src/data/tasksRepo.ts#L67)). Above that threshold, creation can repeatedly choose an existing ref. Replace client numbering with a transactional database counter/RPC and paginate task reads.

5. **High conditional: demo auto-join remains a deployment footgun.** Every signup joins the magic workspace UUID whenever it exists ([`supabase/migrations/0004_adoption.sql`](../supabase/migrations/0004_adoption.sql#L20)); the seed creates that UUID ([`supabase/seed.sql`](../supabase/seed.sql#L20)). Keep auto-join logic in local seed/bootstrap only and make the production trigger profile-only.

6. **Medium: core domain invariants are not enforced.** The database accepts empty titles, negative points/capacity, and reversed or extreme date ranges ([`supabase/migrations/0001_schema.sql`](../supabase/migrations/0001_schema.sql#L39)). The drawer saves these values directly ([`src/features/taskDrawer/DrawerFields.tsx`](../src/features/taskDrawer/DrawerFields.tsx#L50)), which can corrupt Workload or produce invalid Gantt geometry. Add database `CHECK` constraints and accessible UI validation.

7. **Medium: the drawer has three state-loss races.** It reports loading/error as "Task not found" ([`src/features/taskDrawer/TaskDrawer.tsx`](../src/features/taskDrawer/TaskDrawer.tsx#L13)); Task 4 plans to open a new ref before `useCreateTask` has put that task in cache ([`src/lib/hooks/useCreateTask.ts`](../src/lib/hooks/useCreateTask.ts#L27)); Escape can discard title/description because they save only on blur. Seed the cache on create success, render explicit loading/error states, and flush or explicitly save dirty fields before closing.

8. **Medium: the planned member-removal runbook is incorrect.** It claims assignments become unassigned but only deletes membership ([`docs/superpowers/plans/2026-07-07-make-it-adoptable.md`](superpowers/plans/2026-07-07-make-it-adoptable.md#L1380)). Workload then silently drops that user's points. Additionally, historical profile FKs block Auth user deletion. Use a transaction to unassign tasks before removal, protect the last owner, and migrate attribution FKs to `ON DELETE SET NULL`.

9. **Medium: pagination and ordering have other correctness failures.** Comments return the oldest 100, so comment 101 disappears after refetch ([`src/data/commentsRepo.ts`](../src/data/commentsRepo.ts#L10)). Subtask positions use cached array length and collide after deletion or concurrent creation ([`src/lib/hooks/useSubtasks.ts`](../src/lib/hooks/useSubtasks.ts#L11)). Board reorder calculations use only filtered tasks, potentially colliding with hidden ranks ([`src/features/boardView/BoardView.tsx`](../src/features/boardView/BoardView.tsx#L27)).

10. **Medium: the stated responsive/WCAG contract is not met.** Board, Gantt, and Timeline task openers are pointer-only; Board movement has no keyboard/touch operation ([`src/features/boardView/TaskCard.tsx`](../src/features/boardView/TaskCard.tsx#L47)). The List table lacks column headers, status is color-only in planning views, Slate navigation contrast is insufficient, and the fixed 200px shell is not mobile-responsive ([`src/app/Shell.tsx`](../src/app/Shell.tsx#L36)).

11. **Medium: OAuth configuration is currently broken locally.** OAuth provides no `redirectTo` ([`src/app/LoginPage.tsx`](../src/app/LoginPage.tsx#L22)); Supabase points to port 3000 while Vite runs on 5173 ([`supabase/config.toml`](../supabase/config.toml#L155)). Provider errors are ignored and provider setup is undocumented.

12. **Medium: delivery controls are incomplete.** There is no CI, README, tracked admin runbook, lint/coverage gate, or automated pgTAP execution. The test suite passes but emits React `act()` and undefined-query warnings. `npm audit` reports one critical, one high, and three moderate development-tool advisories; production dependencies are clean.

## Assessment

The architecture and test coverage are stronger than a typical prototype, but this branch is not merge- or deployment-ready. Task 3 is committed at `0e3c498`, despite the stale handoff ledger saying it is in flight; Tasks 4-7 remain intentionally pending and should be handled with the corrections above before rollout.

Recommended remediation order:

1. Fix auth isolation and centralise session ownership.
2. Add an RLS/schema hardening migration and expanded pgTAP suite.
3. Move ref creation server-side and paginate task reads.
4. Correct the Task 4-7 plan for cache seeding, error states, transactional admin SQL, and sign-out cache clearing.
5. Add CI and clean all test warnings.
6. Run desktop/mobile accessibility smoke tests, then prioritise Realtime before broad multi-user rollout.

## Verification

- `177/177` unit tests passed during the audit.
- The production build succeeded during the audit.
- pgTAP could not be rerun because the Podman VM was stopped.
- No runtime or product code was changed for this audit document.

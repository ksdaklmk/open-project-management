# Make It Adoptable — Design Spec

**Date**: 2026-07-07
**Status**: Approved design → ready for implementation plan
**Build step**: #1 of the post-v1 roadmap (below). Extends `2026-06-26-project-management-design.md` after all seven master build steps shipped.

## Post-v1 roadmap context (agreed 2026-07-07)

Goal: **real multi-user use by the owner's team(s)** — the owner is the admin; no self-serve tenancy.

| # | Step | Why |
|---|------|-----|
| 1 | **Make it adoptable** (this spec) | A team can't adopt an app it can't create tasks in. |
| 2 | Deploy (hosted Supabase + static host + OAuth) | Start dogfooding. |
| 3 | Realtime (workspace channel → TanStack invalidations) | Live boards once ≥2 people are in. |
| 4 | E2E (Playwright smoke, golden paths) | Flows are stable and depended-upon. |
| 5 | Correctness tail: atomic move RPC; comment edit/delete | Small, real, unglamorous. |
| 6 | Only-if-asked: activity filters, subtask reordering | Wait for a human to complain. |

**Killed** (deferred forever until someone asks): workspace-create/invite UI and project-create UI (admin-by-SQL instead — see runbook), avatar-popover assignee editor, board swimlanes/WIP limits, shared `StatusChip` extraction, `comment_id` on activity rows, position rebalancing.

## Goal

Turn the demo into a tool a real team can adopt: **create and delete tasks in the UI**, **capture names at signup**, **stop auto-joining strangers into the team workspace** (with a sane zero-workspace state), and **document the admin-by-SQL operations** we deliberately didn't build UI for.

## Non-Goals

- No project-creation, workspace-creation, invite, or name-editing UI (admin runbook covers all four).
- No per-view quick-adds; no Board column "+" (a later second call-site of the same mutation).
- No Realtime, no E2E (roadmap steps 3–4).
- No subtask/comment behaviour changes.
- No new tables. One migration (`0004`) touches only the `handle_new_user` trigger.

## Architecture

```
src/
  data/
    projectsRepo.ts     (new — listProjects: id/name/key per workspace)
    tasksRepo.ts        (add createTask + nextRef helper + deleteTask)
    activityRepo.ts     (add logCreate — verb 'created', mirrors logComment)
  lib/hooks/
    useProjects.ts      (new — query ['projects', ws])
    useCreateTask.ts    (new — one hook per file, matching useUpdateTask/useMoveTask)
    useDeleteTask.ts    (new)
  features/
    toolbar/Toolbar.tsx (add "+ New task" → inline title input)
    taskDrawer/TaskDrawer.tsx (footer: Delete task, two-step confirm)
    activityView/       (ActivityRow: 'created' renderer + "(deleted task)" fallback)
  app/
    LoginPage.tsx       (optional Name field → options.data.name on sign-up)
    Shell.tsx           (zero-workspace empty state)
supabase/
  migrations/0004_adoption.sql  (harden handle_new_user)
  tests/rls_test.sql            (extend: auto-join UUID pin; task delete policies)
docs/
  admin.md              (new — admin-by-SQL runbook)
```

Supabase client stays inside `data/` (+ existing auth carve-outs); `architecture.test.ts` must stay green.

## Task creation

- **Repo owns ref generation.** `createTask({ workspaceId, projectId, projectKey, title, createdBy })`:
  1. `select ref from tasks where project_id = …` → pure `nextRef(refs, key)` → `KEY-<max numeric suffix + 1>`, or `KEY-101` for an empty project (matches seed convention; no sub-three-digit refs).
  2. Insert `{ project_id, workspace_id, ref, title, created_by }` — DB defaults supply status `backlog`, priority `medium`, type `feature`, position `0`. `.select().single()` returns the row.
  3. On unique-violation `23505` (two members racing): re-select refs, recompute, retry **once**, then throw. Repos must preserve the Postgres error code when wrapping (`Object.assign(new Error(msg), { code })`) — today's `new Error(error.message)` drops it. `// ponytail:` comment names the ceiling; upgrade is a DB-side counter RPC, pairing with roadmap step 5's atomic-move RPC migration.
- **Project resolution**: `useProjects(ws)` (new repo, `select id, name, key order by name`). One project → implicit. More than one → a small labelled `<select>` beside the title input, defaulting to the first.
- **Hook** `useCreateTask(ws)`: reads `useSession` for the uid (the `task_insert` policy pins `created_by = auth.uid()`); on success invalidate `['tasks', ws]` and best-effort `logCreate({ workspaceId, taskId, actorId })` — log failure = toast only, task survives (the established `logComment` pattern). Returns the created task.
- **Toolbar UI**: "+ New task" button, rendered wherever the toolbar mounts (list/board/gantt/timeline). Click → inline title input (autofocused; Enter creates, Esc cancels). On success: clear draft via per-call `onSuccess` (draft survives failure), `setTaskRef(task.ref)` → the existing drawer opens for fleshing out. Board/Gantt/Timeline surface the new task per their own rules (backlog column / unscheduled) — no special-casing.

## Task deletion

- `tasksRepo.deleteTask(id)`; `useDeleteTask(ws)` invalidates `['tasks', ws]` + `['activity', ws]`, then `setTaskRef(null)`.
- Drawer footer: **Delete task** → two-step inline confirm swap ("Delete this task? **Delete** / Cancel") — no native `confirm()`. Failure: toast, drawer stays open.
- DB cascades subtasks/tags/comments; `activity.task_id` goes `set null` → `ActivityRow` **already** renders "a task" for a null task join (`TaskRef` fallback) — deletion needs no feed changes.
- `ActivityRow` gains the `'created'` verb renderer ("created **NIM-107** · Title"); the existing unknown-verb and null-task fallbacks stay.

## Signup names

- `LoginPage`: optional **Name** input; `signUp({ email, password, options: { data: { name } } })`. Sign-in ignores it. (The trigger already reads `raw_user_meta_data->>'name'`.)
- Migration `0004_adoption.sql` — `create or replace function handle_new_user()`:
  - Name: `coalesce(->>'name', ->>'full_name', ->>'user_name', '')` — covers Google/GitHub metadata variance.
  - Demo auto-join: pinned to the seed workspace **UUID** `20000000-0000-0000-0000-000000000001` instead of `name = 'Northwind'`. Local dev (seeded) keeps the convenience; production (never demo-seeded) no-ops; naming a real workspace "Northwind" is no longer a footgun.
- No name-edit UI; typos are an admin-SQL fix; OAuth names arrive automatically.

## Zero-workspace empty state

`Shell`: when workspaces have loaded and `activeId === null` → replace the layout with a centred panel (theme tokens, UK English):

> **No workspace yet.** Ask your workspace admin to add you.

plus a **Sign out** button. This is all a stray signup on the hosted instance can see or do.

## Admin runbook (`docs/admin.md`)

Copy-paste SQL for the Supabase SQL editor / `psql`, one snippet each: create a workspace; add a member by email (join through `auth.users`); create a project (name + key); fix a profile name; remove a member. Each notes the RLS context (run as service role / table owner, bypasses RLS by design).

## Edge cases & error handling

- **Ref race** (two creates, same moment): one retry on `23505`, then a toast surfaces the error; draft preserved.
- **Stale cache never mints a duplicate ref** — generation reads fresh refs from the DB, not the TanStack cache.
- **Create in a project-less workspace** (fresh real workspace before admin adds a project): "+ New task" disabled with title `Create a project first (see docs/admin.md)`.
- **Deleting the task the drawer is showing** is the only path (delete lives in the drawer); close-on-success prevents a "Task not found" flash.
- **Delete + concurrent edit elsewhere**: their optimistic update rolls back on invalidation refetch; standard TanStack behaviour, no special handling.
- **Blank names remain possible** (email signup, name left empty) → existing "Someone"/blank fallbacks stand; runbook fixes.

## Accessibility

- Inline title input: `<label>`ed (visually hidden), autofocus on reveal, Esc restores the button, focus returns to the button on cancel/success.
- Delete confirm: focus moves to **Cancel** on reveal (destructive-action default); both buttons keyboard-reachable inside the drawer's existing trap.
- Empty state: heading + button reachable; Sign out is a real `<button>`.

## Testing

- **Unit (Vitest)**: `nextRef` (empty project → 101, gaps, non-numeric suffixes ignored, key mismatch ignored); `createTask` retry-once-on-23505 against mocked `supabase-js` (assert second insert's ref, and that other errors don't retry); `deleteTask`; `projectsRepo`; `useCreateTask` logs `'created'` best-effort (log failure ≠ create failure).
- **Component (RTL)**: toolbar create flow (button → input → Enter → `setTaskRef` with new ref; Esc cancels; draft survives failure); drawer delete two-step confirm (+ failure keeps drawer open); LoginPage passes `name` on sign-up only; Shell empty state at `activeId === null`; ActivityRow `'created'` renderer (null-task fallback already covered by existing tests — verify, don't duplicate).
- **RLS (pgTAP, extend `rls_test.sql`)**: member **can** insert a task in own workspace with `created_by = auth.uid()` and **cannot** with a spoofed `created_by` (may exist — verify); member **can** delete own-workspace task, **cannot** delete workspace B's (task survives); trigger: new signup auto-joins the demo workspace by UUID; a workspace merely *named* 'Northwind' does **not** attract auto-joins.
- **Architecture**: `architecture.test.ts` green (Toolbar/Drawer/Shell/LoginPage touch hooks only; LoginPage keeps its existing auth carve-out).

## Build order (plan shape — ~6 TDD tasks)

1. Migration `0004_adoption.sql` (trigger hardening) + pgTAP extensions.
2. `projectsRepo` + `useProjects`; `tasksRepo.createTask`/`nextRef` (+ error-code-preserving wrap) + `activityRepo.logCreate` + `useCreateTask`.
3. Toolbar "+ New task" flow → drawer opens on the new ref.
4. `deleteTask` + `useDeleteTask` + drawer footer confirm; ActivityRow `'created'` renderer.
5. LoginPage name capture; Shell zero-workspace empty state.
6. `docs/admin.md`; browser smoke (create → flesh out → delete; both themes); UK-English copy check.

Spec + plan committed on `main` first, then branch — matching all prior steps.

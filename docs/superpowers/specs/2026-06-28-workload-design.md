# Workload — Design Spec

**Date**: 2026-06-28
**Extends**: `docs/superpowers/specs/2026-06-26-project-management-design.md` (view #6 Workload; build order #6)
**Status**: Approved — ready for implementation plan

## Goal

A **read-only** capacity view, mounted as the `workload` tab: a **heatmap** of
**Σ task `points` per assignee per week** measured against each assignee's
`capacity_per_week`. Rows are people, columns are weeks, and each cell is tinted by
its load ÷ capacity ratio so over-committed weeks pop at a glance.

Like Gantt/Timeline, this is pure presentation over existing data — **no new data
layer, table, RLS policy, or Realtime work**. A pure aggregator turns
`tasks + members + now` into a heatmap model; the component renders it.

## Data model (existing — no schema change, no new data layer)

Consumes two existing read hooks for the active workspace:

- `useTasks(ws)` → `['tasks', ws]` (already invalidated by `useMoveTask`/`useUpdateTask`,
  so the view refreshes live). `Task` provides `status`, `assignee_id | null`,
  `points` (number), `start_date | null` (`'YYYY-MM-DD'`).
- `useMembers(ws)` → `['members', ws]`. `Member` provides `user_id`,
  `capacity_per_week` (number), `name` (may be `''`).

Dates are parsed as **local midnight** via `weeks.ts#parseDate` (never `new Date(iso)` —
UTC drift). Weeks are **Monday-anchored** via `weeks.ts#startOfWeek`.

**Decisions baked into the aggregation (from brainstorm):**

- **Window**: a fixed **6-week forward window** — `startOfWeek(now)` and the next 5 weeks.
  Past weeks are intentionally off-screen (workload is forward planning).
- **Exclude `done`**: a workload view shows *remaining* burden, so `status === 'done'`
  tasks never count.
- **Unscheduled** (no `start_date`) and **out-of-window** (dated before/after the window)
  points can't occupy a visible cell → they are summed into a "**not shown**" footer
  (broken down as unscheduled vs out-of-range), **never silently dropped**.
- **Unassigned** (`assignee_id` null) load → a single **"Unassigned" row** appended at the
  bottom, **only if it carries load**; its cells are **neutral** (no capacity to compare).
- Members with **zero load still render** (all-empty row) so you can see who is free.

## Components

### 1. Aggregator — `src/features/workloadView/workload.ts` (pure)

The one piece of real logic; unit-tested.

```ts
type Level = 'none' | 'under' | 'near' | 'over'
interface Cell { points: number; ratio: number | null; level: Level }
interface Row  { id: string; name: string; capacity: number | null; cells: Cell[]; total: number }
interface WeekCol { key: string; label: string }          // key = local 'YYYY-MM-DD' of the Monday
interface Workload {
  weeks: WeekCol[]                                         // exactly 6, in order
  rows: Row[]                                              // members (sorted) + 'Unassigned' iff loaded
  unscheduledPoints: number                               // non-done, no start_date
  outOfRangePoints: number                                // non-done, dated outside the 6-week window
}
export function buildWorkload(tasks: Task[], members: Member[], now: Date): Workload
```

Algorithm:

1. `weeks` = `[0..5].map(i => addDays(startOfWeek(now), i*7))` → `{ key, label }`.
   `key` is the **local** `'YYYY-MM-DD'` of the Monday (a small local formatter — *not*
   `toISOString`, which is UTC); `label` mirrors Gantt's `"Jun 22"`
   (`toLocaleDateString('en-US', { month:'short', day:'numeric' })`).
2. Drop `status === 'done'`. For each remaining task, classify by `points` placement:
   - `start_date` null → `unscheduledPoints += points`.
   - else `wk = key(startOfWeek(parseDate(start_date)))`; if `wk` ∉ window keys →
     `outOfRangePoints += points`; else accumulate `load[assignee_id ?? '__unassigned__'][wk] += points`.
   (`points` of 0 contribute nothing everywhere — no-op.)
3. One `Row` per member: `cells = weeks.map(...)` with
   `points = load[user_id]?.[key] ?? 0`, `ratio = capacity > 0 ? points/capacity : null`,
   and `level`:
   - `points === 0` → `none`
   - `ratio === null` (capacity ≤ 0) → `none` (neutral; no divide-by-zero)
   - `ratio ≤ 0.8` → `under` · `ratio ≤ 1.0` → `near` · else → `over`.
   `name = member.name.trim() || 'Someone'`; `total = Σ cell.points`.
4. Sort member rows by `name` (`localeCompare`), then append the **Unassigned** row
   (`id '__unassigned__'`, `name 'Unassigned'`, `capacity null`, cells all `level: 'none'`
   regardless of points) **iff** it has any load.

### 2. View — `src/features/workloadView/WorkloadView.tsx`

- Signature mirrors Gantt's injectable clock: `function WorkloadView({ now = new Date() }: { now?: Date } = {})`.
  Shell mounts `<WorkloadView />` (no prop); tests inject a fixed `now`.
- Reads `useActiveWorkspace()` (gate on `wsLoading`), `useTasks(activeId)`, `useMembers(activeId)`.
- **States** (mirror List/Board/Activity/Gantt): **loading** (`wsLoading` or either query
  loading) → skeleton `role="status"`; **error** (either query) → `role="alert"`; **empty**
  (`members.length === 0 || tasks.length === 0`) → empty state. Otherwise the grid (which
  may legitimately be all-`none` + a footer).
- **Grid = a semantic `<table>`** (`table-layout: fixed`): `<thead>` with a blank corner +
  6 `<th scope="col">` week labels; one `<tbody>` row per `Row` with `<th scope="row">`
  (name + a `capacity` sub-label, or "no cap" for Unassigned) and 6 `<td>` cells. Native
  table header association does the a11y — no reinvented ARIA grid.
- **Cell**: an inner tinted box showing `points` (or `·` when `none`); `!` appended on
  `over` plus an `sr-only` " over capacity". Tint via
  `color-mix(in oklab, <levelHex> ~18%, var(--surface))` — **never hex+opacity** (the Slate
  wash-out lesson); `none` cells stay on `var(--surface)`/faint. The `level → hex` map is
  **guarded** (`?? var(--muted)`). Load palette (independent of the status taxonomy):
  `under #2bb673 · near #f5a623 · over #e5484d`.
- **Footer**: a muted line "`N points not shown`" rendered only when
  `unscheduledPoints + outOfRangePoints > 0`, with a `title` breaking it down
  ("3 unscheduled · 0 outside window"). A small legend (under / near / over swatches) is an
  impeccable-pass detail.

### 3. Mount — `src/app/Shell.tsx`

Replace the `${view} view — coming next.` fallback's `workload` case: `view === 'workload'`
→ `<WorkloadView />`. (`workload` already exists in `VIEWS`/`LABEL`.)

### 4. Seed data — `supabase/seed.sql` + live insert

**Current state makes a flat, un-smokeable chart** (verified via `psql`): all 3 members have
`capacity_per_week = 40` while tasks are 1–13 pts (every cell trivially deep-"under"), the
only unassigned task (NIM-102) is `done` (excluded → no Unassigned row), and only Demo Owner
carries load. A top-up is required to exercise under/near/over, a second assignee row, the
Unassigned row, and the footer. **Target** (Nimbus project `30000000-…0001`,
`created_by` = Demo Owner `10000000-…0001`; `workspace_id` auto-filled by `set_task_workspace`):

- **Capacities** (rescaled to a points budget so the comparison is meaningful): Demo Owner → **10**,
  a second assignee → **8**. (Leave the remaining member as-is → an all-empty "free" row.)
- **Demo Owner** (cap 10): keep NIM-101 (Jun 22, 5 → under); NIM-103 → **13** (Jun 29 → over);
  NIM-104 → **9** (Jul 6 → near).
- **Second assignee** (cap 8): + NIM-107 `in_progress` 2026-06-29 **8** (near); + NIM-108 `todo`
  2026-07-13 **10** (over). The plan picks the assignee after re-checking live members — prefer a
  properly **seeded** second member (reproducible in `seed.sql`) over a throwaway local signup
  (random UUID, not reproducible).
- **Unassigned** (non-done, in-window): + NIM-109 `todo` 2026-07-06 **6**, `assignee_id` null → Unassigned row.
- **Footer**: keep NIM-105 (2) + NIM-106 (1) unscheduled = "3 points not shown". Keep NIM-102
  `done` (proves exclude-done).

Apply **live via `psql`** (since `db reset` hangs on Podman) and update `seed.sql` for the
reproducible parts (capacities, Demo-Owner/unassigned tasks, and the second member if seeded),
adding `on conflict` so re-seeding is idempotent (the existing NIM-101/102 insert lacks it —
folds in the pre-existing seed fast-follow). Exact SQL lives in the plan; re-verify live values first.

## Data flow

`useTasks(ws)` + `useMembers(ws)` → TanStack Query caches → `buildWorkload(tasks, members, now)`
→ render. No writes. A status/move/assignee edit elsewhere invalidates `['tasks', ws]`, so the
heatmap re-derives and re-renders automatically. No new repo, hook, table, or RLS policy.

## Error handling

- Repo errors surface through either hook → the view's `role="alert"` error state (no toast;
  read-only view), matching the other views.
- Unknown `level` (defensive) → guarded color lookup yields a neutral fallback; never white-screens.
- Capacity ≤ 0 → ratio `null` → neutral cell (no divide-by-zero).
- Empty (no members or no tasks) is an explicit state, not a blank screen.

## Theming & accessibility

- Layout colors via theme CSS vars. Cell **backgrounds are pale tints** → use
  `color-mix(in oklab, <levelHex> …, var(--surface))`, the required pattern for tinted
  surfaces on Slate (saturated bars/dots may use a hex directly, but these are pale fills).
- Semantic `<table>` with `scope="col"`/`scope="row"` headers; `over` cells carry an
  `sr-only` "over capacity"; the visible numbers + headers convey the rest.
- `now` is injectable for deterministic tests (never assert against the real clock — the
  date-relative-test lesson from Gantt/Timeline).
- Final task of the feature = an **impeccable** visual pass + browser smoke in both themes.

## Testing

- **Unit** — `workload.test.ts` (the core), fixed `now` + fixture asserting: 6 week
  columns with correct keys/labels; per-cell `points` and `level` across `under/near/over/none`;
  `done` excluded; **unscheduled → `unscheduledPoints`** and **out-of-window → `outOfRangePoints`**
  (neither in the grid); **Unassigned row** present + neutral when it has load (and absent when
  it doesn't); blank name → `"Someone"`; capacity-0 guard → `none`.
- **Component** — `WorkloadView.test.tsx` with injected `now`: a known cell renders its points,
  an `over` cell shows `!`, the footer shows the not-shown count; plus loading / error / empty
  (`role="status"` / `role="alert"`).
- **Shell** — extend `Shell.test` to assert `view === 'workload'` mounts `WorkloadView`.
- No RLS/pgTAP work (no schema change; `tasks`/`workspace_members` already policied).

## Out of scope (v1 — deferred)

- Drill-down / click-to-filter a cell, drag-to-rebalance, per-week paging, capacity editing
  (that belongs to member management), any charting library.
- The shared filter/sort toolbar and task drawer (`?task=`) — their own later build step (#7).
- Supabase Realtime, the `task_tags` join, and the `handle_new_user` name gap — the queued
  cross-view passes, not this view.

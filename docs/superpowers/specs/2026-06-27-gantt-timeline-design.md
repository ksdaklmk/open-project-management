# Gantt + Timeline — Design Spec

**Date**: 2026-06-27
**Extends**: `docs/superpowers/specs/2026-06-26-project-management-design.md` (views #3 Gantt, #4 Timeline; build order #5)
**Status**: Approved — ready for implementation plan

## Goal

Two **read-only** date-driven views over the existing `tasks` data, mounted as the
`gantt` and `timeline` tabs. They are deliberately **distinct presentations**, not one
engine with two skins (the schema has no task dependencies or milestones, so a shared
bar-engine would render near-identically):

- **Gantt** — one row per scheduled task, a status-colored duration **bar** positioned
  on a horizontal, Monday-start week axis; a "today" marker; an Unscheduled footer.
- **Timeline** — a vertical **agenda**: tasks bucketed by start date relative to today
  (`Earlier · This week · Next week · Later`) plus `Unscheduled`.

v1 is read-only: bars and items reflect dates, they do not edit them. Rescheduling is a
later concern (the shared task drawer will edit dates with a native `<input type="date">`).

## Data model (existing — no schema change, no new data layer)

Both views consume the existing read hook `useTasks(workspaceId)` (`['tasks', ws]`,
already invalidated by `useMoveTask`/`useUpdateTask`, so both refresh live). `listTasks`
already `select('*')`; the `Task` row provides everything used here:

- `ref`, `title`, `status` (`Status` ∈ backlog/todo/in_progress/in_review/done),
  `type`, `start_date | null`, `end_date | null`.
- Dates are `'YYYY-MM-DD'` strings. **Parse as local midnight** (`new Date(y, m-1, d)`),
  never `new Date(iso)` (UTC parse drifts a day for negative-UTC users — same class of
  bug noted for `relativeTime`).

**Scheduled-ness is defined per view:**

- **Gantt-scheduled** ⟺ `start_date` AND `end_date` are both non-null (a bar needs both).
- **Timeline-scheduled** ⟺ `start_date` is non-null (the agenda anchors on start; end optional).

Tasks failing a view's predicate go to that view's **Unscheduled** group — never dropped.

## Components

### 1. Shared date helpers — `src/lib/weeks.ts` (pure)

```ts
export function parseDate(iso: string): Date          // local midnight from 'YYYY-MM-DD'
export function addDays(d: Date, n: number): Date
export function startOfWeek(d: Date): Date            // Monday 00:00, local
export function daysBetween(a: Date, b: Date): number // whole calendar days, b - a
```

The only logic shared by both views (Monday-week math + safe parsing). One test file.

### 2. Gantt scale — `src/features/ganttView/timeScale.ts` (pure)

```ts
interface GanttScale {
  weeks: { start: Date; label: string }[]  // Monday-start weeks covering min(start)→max(end)
  rangeStart: Date                         // Monday of the first week
  rangeDays: number                        // weeks.length * 7
  todayPct: number | null                  // % offset of today, or null if outside range
  position(start: Date, end: Date): { leftPct: number; widthPct: number }
}
export function splitGantt(tasks: Task[]): { scheduled: Task[]; unscheduled: Task[] }
export function buildScale(scheduled: Task[], now: Date): GanttScale
```

- `weeks` span `startOfWeek(min start_date)` → the week containing `max end_date`,
  inclusive; `label` = e.g. `"Jun 22"`.
- `position`: `leftPct = daysBetween(rangeStart, start) / rangeDays * 100`;
  `widthPct = (daysBetween(start, end) + 1) / rangeDays * 100` (**inclusive** end — a
  same-day task is 1 day wide). Clamp `leftPct ≥ 0` and `leftPct + widthPct ≤ 100`.
  A CSS `min-width` on the bar keeps 1-day bars visible; the helper returns raw %.
- `buildScale` on empty input is never called (the view shows the no-scheduled state first).

### 3. Gantt view — `src/features/ganttView/GanttView.tsx`

- Reads the active workspace (same `WorkspaceProvider` plumbing as List/Board: gate on
  `wsLoading`), then `useTasks(workspaceId)`.
- States (mirror List/Board/Activity): **loading** skeleton; **error** `role="alert"`;
  **empty** (no tasks at all); **no-scheduled** sub-state (tasks exist but none gantt-scheduled —
  show the Unscheduled list, no chart).
- On data: `splitGantt` → `buildScale(scheduled, new Date())`. Render:
  - a week-header row (label per week, aligned to the track),
  - one row per scheduled task (ordered by `start_date`, then `ref`): left label `ref · title`;
    a track with the positioned bar. Bar fill = **guarded** status color
    `STATUSES.find(s => s.id === status)?.color` → `var(--muted)` fallback if missing (never
    throws — same hardening as Activity's `StatusChip`),
  - the today marker (only when `todayPct !== null`),
  - an `⊘ Unscheduled — N` footer listing the unscheduled tasks.
- a11y: each bar carries `role="img"` + `aria-label` (e.g. `"In Review · Jun 22 – Jun 26"`);
  the visible row label already conveys ref + title.

### 4. Timeline buckets — `src/features/timelineView/buckets.ts` (pure)

```ts
type BucketId = 'earlier' | 'this_week' | 'next_week' | 'later' | 'unscheduled'
export function bucketTasks(
  tasks: Task[], now: Date,
): { id: BucketId; label: string; tasks: Task[] }[]   // fixed order; callers hide empties
```

- `this_week` = the Monday-start week containing `now`; `next_week` = the following week;
  `earlier` = `start_date` before this week's Monday; `later` = after next week's Sunday;
  `unscheduled` = no `start_date`.
- Returned in order `earlier, this_week, next_week, later, unscheduled`; within each,
  tasks sorted by `start_date` then `ref` (unscheduled by `ref`).
- `now` is a parameter (deterministic tests, like `relativeTime`).

### 5. Timeline view — `src/features/timelineView/TimelineView.tsx`

- Same workspace/tasks plumbing and the same loading/error/empty states.
- On data: `bucketTasks(tasks, new Date())`, render each **non-empty** bucket as a section
  (heading + items). Each item: status dot (guarded color) · `ref` · `title` · date range
  (`Jun 22 – 26`, or `Jun 29 →` if no end). Unscheduled items show no date.
- a11y: buckets are a list; visible text carries all info.

### 6. Mount — `src/app/Shell.tsx`

Replace the `coming next` fallback for two branches: `view === 'gantt'` → `<GanttView/>`,
`view === 'timeline'` → `<TimelineView/>`. (`gantt`/`timeline` already exist in `VIEWS`.)

### 7. Seed data — `supabase/seed.sql` + live insert

The DB has only 2 tasks, both in one week — too thin to demo either view. Add 4 more to the
Nimbus project (`30000000-…0001`), assignee/creator Demo Owner (`10000000-…0001`); explicit
refs (no ref trigger exists — `ref` is a plain `unique(project_id, ref)` text column):

| ref | type | title | status | start | end |
|-----|------|-------|--------|-------|-----|
| NIM-103 | feature | Auth rate limiting | in_progress | 2026-06-29 | 2026-07-03 |
| NIM-104 | chore | Billing webhooks | todo | 2026-07-06 | 2026-07-10 |
| NIM-105 | improvement | Onboarding emails | backlog | *(null)* | *(null)* |
| NIM-106 | chore | Dark-mode polish | backlog | *(null)* | *(null)* |

This yields Gantt bars across 3 weeks + 2 Unscheduled, and Timeline buckets in
This week / Next week / Later + Unscheduled. Update `seed.sql` (correct for future resets)
**and** insert live via `psql` (since `db reset` hangs on Podman). `workspace_id` is
auto-filled by the `set_task_workspace` trigger.

## Data flow

`useTasks(ws)` → TanStack Query cache `['tasks', ws]` → pure split/scale/bucket → render.
No writes. A status change or move elsewhere invalidates `['tasks', ws]`, so both views
re-derive and re-render automatically. No new repo, hook, table, or RLS policy.

## Error handling

- Repo errors surface through `useTasks` → the view's `role="alert"` error state (no toast;
  these are read views). Matches List/Board/Activity.
- Unknown `status` (taxonomy drift / stale client) → guarded color lookup yields a neutral
  fallback; the view never white-screens.
- Empty / no-scheduled / all-unscheduled are explicit states, not blank screens.

## Theming & accessibility

- Layout colors via theme CSS vars. Status **bars/dots use the status hex directly** — a
  saturated fill stays legible on both Bloom and Slate (unlike pale chip *backgrounds*, which
  is where the `color-mix(in oklab, <hex> …, var(--surface))` tint is required). If the
  impeccable pass adds any tinted chip/surface, it uses that `color-mix` pattern (mirrors
  `.opm-chip`/`.opm-tag`).
- The final task of the feature is an **impeccable** visual pass + browser smoke in both themes.

## Testing

- **Unit** — `weeks` (parse/startOfWeek/addDays/daysBetween incl. a TZ-stable parse case);
  `timeScale` (week columns from a range; `position` left/width incl. inclusive-end and clamp;
  `todayPct` null when out of range; `splitGantt`); `buckets` (each bucket against a fixed `now`;
  ordering; unscheduled split).
- **Component** — GanttView renders the right bar count + a today marker from a fixture and
  lists unscheduled; TimelineView renders the expected non-empty buckets; both cover
  loading / error / empty / no-scheduled.
- No RLS/pgTAP work (no schema change; `tasks` is already policied).

## Out of scope (v1 — deferred)

- Drag/resize to reschedule (writes `start_date`/`end_date`) — revisit with the task drawer.
- Axis zoom (day/week/month switch) — fixed week granularity for now.
- Grouping Gantt rows by project/status, dependency arrows, milestones — none in the schema.
- The shared filter/sort toolbar and task drawer (`?task=`) — their own later build step.

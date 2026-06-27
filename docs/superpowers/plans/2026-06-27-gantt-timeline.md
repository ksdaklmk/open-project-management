# Gantt + Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only `gantt` and `timeline` views — Gantt = status-colored duration bars on a Monday-start week axis; Timeline = a vertical agenda bucketed by start date relative to today.

**Architecture:** Both views are pure presentation over the existing `useTasks(workspaceId)` hook (no new data layer, table, or RLS). Date math lives in tested pure helpers: shared `src/lib/weeks.ts`, plus per-view `ganttView/timeScale.ts` and `timelineView/buckets.ts`. The views mirror the loading/error/empty state pattern of `BoardView`/`ActivityView` and mount in `Shell` via the existing ternary chain.

**Tech Stack:** Vite + React + TS + Tailwind, TanStack Query (already wired), Vitest + React Testing Library. Supabase only for the (existing) tasks read.

## Global Constraints

- **Type-check with `tsc -b`, never plain `tsc`** — use `npm run build` (root tsconfig is `files: []` + project references; bare `tsc` checks nothing).
- **The `@supabase/supabase-js` client is forbidden in feature code** — these views import nothing from `src/lib/supabase.ts`; they only call `useTasks`. `src/architecture.test.ts` fails the suite on a violation.
- **Themes are CSS variables** — style with `var(--text)`, `var(--border)`, `var(--surface)`, `var(--primary)`, `var(--muted)`. Never hard-code a theme hex. The only literal colors allowed are the **status hexes read from `STATUSES`** (data-driven bar/dot fills), looked up **guarded**: `COLOR[status] ?? 'var(--muted)'` — never throw on an unknown status.
- **Taxonomies are client constants** in `src/types/constants.ts` (`STATUSES` = backlog/todo/in_progress/in_review/done, each `{ id, label, color }`).
- **Parse dates as local midnight** (`new Date(y, m-1, d)`), never `new Date(iso)` (UTC parse drifts a day for negative-UTC users).
- **Read-only v1** — no writes, no new repo/hook/table/RLS/migration.
- **Supabase runs on Podman** — `db reset`/`start` hang; for the seed, apply via `psql` through `podman exec`, with `DOCKER_HOST` set per shell.
- Pure helpers take `Task[]` and an injectable `now: Date`; tests are colocated `*.test.ts`.

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/seed.sql` (modify) | Add 4 demo tasks (2 dated across later weeks, 2 undated) so both views demo. |
| `src/lib/weeks.ts` (create) | Shared pure date helpers: `parseDate`, `addDays`, `startOfWeek`, `daysBetween`. |
| `src/lib/weeks.test.ts` (create) | Unit tests for the above. |
| `src/features/ganttView/timeScale.ts` (create) | `splitGantt` (dated/undated) + `buildScale` (week columns, `position`, `todayPct`). |
| `src/features/ganttView/timeScale.test.ts` (create) | Unit tests for the scale. |
| `src/features/ganttView/GanttView.tsx` (create) | The Gantt view: states + week header + bars + today marker + Unscheduled footer. |
| `src/features/ganttView/GanttView.test.tsx` (create) | Component tests (mocked hooks). |
| `src/features/timelineView/buckets.ts` (create) | `bucketTasks` — order Earlier/This week/Next week/Later/Unscheduled by start date. |
| `src/features/timelineView/buckets.test.ts` (create) | Unit tests for bucketing. |
| `src/features/timelineView/TimelineView.tsx` (create) | The Timeline view: states + non-empty bucket sections. |
| `src/features/timelineView/TimelineView.test.tsx` (create) | Component tests (mocked hooks). |
| `src/app/Shell.tsx` (modify) | Mount `<GanttView/>` and `<TimelineView/>` (replace the `coming next` fallback). |
| `src/app/Shell.test.tsx` (modify) | Mock the two new views + assert they mount on their tabs. |

---

### Task 1: Seed demo tasks

**Files:**
- Modify: `supabase/seed.sql` (append rows to the existing `insert into tasks …`)

**Interfaces:**
- Consumes: existing seed ids — Nimbus project `30000000-0000-0000-0000-000000000001`, Demo Owner `10000000-0000-0000-0000-000000000001`. `workspace_id` is auto-filled by the `set_task_workspace` trigger; `ref` is a plain `unique(project_id, ref)` column (no trigger).
- Produces: tasks NIM-103/104 (dated) + NIM-105/106 (undated) in the live DB and in `seed.sql`.

This task is data, not TDD — its check is a `psql` query, not a unit test.

- [ ] **Step 1: Append the 4 rows to `supabase/seed.sql`**

Find the existing `insert into tasks (...) values` block (currently NIM-101, NIM-102) and add a second statement after it:

```sql
insert into tasks (project_id, ref, type, title, status, priority, assignee_id, start_date, end_date, points, position, created_by) values
  ('30000000-0000-0000-0000-000000000001', 'NIM-103', 'feature',     'Auth rate limiting', 'in_progress', 'high',   '10000000-0000-0000-0000-000000000001', '2026-06-29', '2026-07-03', 5, 3, '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'NIM-104', 'chore',       'Billing webhooks',   'todo',        'medium', '10000000-0000-0000-0000-000000000001', '2026-07-06', '2026-07-10', 3, 4, '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'NIM-105', 'improvement', 'Onboarding emails',  'backlog',     'low',    '10000000-0000-0000-0000-000000000001', null,         null,         2, 5, '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'NIM-106', 'chore',       'Dark-mode polish',   'backlog',     'low',    '10000000-0000-0000-0000-000000000001', null,         null,         1, 6, '10000000-0000-0000-0000-000000000001')
on conflict (project_id, ref) do nothing;
```

- [ ] **Step 2: Apply the same rows to the running DB** (db reset hangs on Podman — insert directly)

```bash
export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
podman exec -i supabase_db_open-project-management psql -U postgres -d postgres -c "
insert into tasks (project_id, ref, type, title, status, priority, assignee_id, start_date, end_date, points, position, created_by) values
  ('30000000-0000-0000-0000-000000000001','NIM-103','feature','Auth rate limiting','in_progress','high','10000000-0000-0000-0000-000000000001','2026-06-29','2026-07-03',5,3,'10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001','NIM-104','chore','Billing webhooks','todo','medium','10000000-0000-0000-0000-000000000001','2026-07-06','2026-07-10',3,4,'10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001','NIM-105','improvement','Onboarding emails','backlog','low','10000000-0000-0000-0000-000000000001',null,null,2,5,'10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001','NIM-106','chore','Dark-mode polish','backlog','low','10000000-0000-0000-0000-000000000001',null,null,1,6,'10000000-0000-0000-0000-000000000001')
on conflict (project_id, ref) do nothing;"
```

- [ ] **Step 3: Verify** — expect 6 rows, 4 with dates, 2 null

```bash
podman exec -i supabase_db_open-project-management psql -U postgres -d postgres -c "select ref, status, start_date, end_date from tasks order by ref;"
```
Expected: NIM-101…NIM-106; NIM-105/106 have null start/end.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "seed(gantt-timeline): add dated + undated demo tasks (NIM-103..106)"
```

---

### Task 2: Shared date helpers — `src/lib/weeks.ts`

**Files:**
- Create: `src/lib/weeks.ts`
- Test: `src/lib/weeks.test.ts`

**Interfaces:**
- Produces:
  - `parseDate(iso: string): Date` — local-midnight Date from `'YYYY-MM-DD'`
  - `addDays(d: Date, n: number): Date`
  - `startOfWeek(d: Date): Date` — Monday 00:00 local
  - `daysBetween(a: Date, b: Date): number` — whole days, `b - a`

- [ ] **Step 1: Write the failing test**

`src/lib/weeks.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseDate, addDays, startOfWeek, daysBetween } from './weeks'

describe('weeks', () => {
  it('parseDate builds a local-midnight date (no UTC drift)', () => {
    const d = parseDate('2026-06-22')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 22])
  })
  it('startOfWeek returns the Monday of the week', () => {
    // 2026-06-27 is a Saturday; its Monday is 2026-06-22
    const mon = startOfWeek(parseDate('2026-06-27'))
    expect([mon.getMonth(), mon.getDate()]).toEqual([5, 22])
  })
  it('addDays adds calendar days across a month boundary', () => {
    const d = addDays(parseDate('2026-06-29'), 7)
    expect([d.getMonth(), d.getDate()]).toEqual([6, 6]) // Jul 6
  })
  it('daysBetween counts whole days', () => {
    expect(daysBetween(parseDate('2026-06-22'), parseDate('2026-06-27'))).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- weeks`
Expected: FAIL — `weeks` module / exports not found.

- [ ] **Step 3: Write the implementation**

`src/lib/weeks.ts`:
```ts
// Pure date helpers. All local-time to avoid the UTC parse drift that bites
// negative-UTC users (`new Date('2026-06-22')` is UTC midnight → prev day there).

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (r.getDay() + 6) % 7 // Mon=0 … Sun=6
  r.setDate(r.getDate() - dow)
  return r
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- weeks`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/weeks.ts src/lib/weeks.test.ts
git commit -m "feat(gantt-timeline): weeks.ts — local-safe Monday-week date helpers"
```

---

### Task 3: Gantt scale — `src/features/ganttView/timeScale.ts`

**Files:**
- Create: `src/features/ganttView/timeScale.ts`
- Test: `src/features/ganttView/timeScale.test.ts`

**Interfaces:**
- Consumes: `parseDate`, `startOfWeek`, `addDays`, `daysBetween` from `../../lib/weeks`; `Task` from `../../data/tasksRepo`.
- Produces:
  - `splitGantt(tasks: Task[]): { scheduled: Task[]; unscheduled: Task[] }` — scheduled ⟺ both `start_date` and `end_date` set.
  - `interface GanttScale { weeks: { start: Date; label: string }[]; rangeStart: Date; rangeDays: number; todayPct: number | null; position(start: Date, end: Date): { leftPct: number; widthPct: number } }`
  - `buildScale(scheduled: Task[], now: Date): GanttScale` — caller guarantees `scheduled.length > 0`.

- [ ] **Step 1: Write the failing test**

`src/features/ganttView/timeScale.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { splitGantt, buildScale } from './timeScale'
import { parseDate } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', ...over,
})

describe('splitGantt', () => {
  it('separates fully-dated tasks from the rest', () => {
    const { scheduled, unscheduled } = splitGantt([
      t({ id: 'a', start_date: '2026-06-22', end_date: '2026-06-26' }),
      t({ id: 'b', start_date: '2026-06-22', end_date: null }),
      t({ id: 'c', start_date: null, end_date: null }),
    ])
    expect(scheduled.map((x) => x.id)).toEqual(['a'])
    expect(unscheduled.map((x) => x.id)).toEqual(['b', 'c'])
  })
})

describe('buildScale', () => {
  const scheduled = [
    t({ id: 'a', start_date: '2026-06-22', end_date: '2026-06-26' }),
    t({ id: 'b', start_date: '2026-07-06', end_date: '2026-07-10' }),
  ]
  const scale = buildScale(scheduled, parseDate('2026-06-27'))

  it('spans whole Monday weeks from first start to last end', () => {
    expect(scale.weeks.map((w) => w.label)).toEqual(['Jun 22', 'Jun 29', 'Jul 6'])
    expect(scale.rangeDays).toBe(21)
  })
  it('positions a bar with inclusive end width', () => {
    const p = scale.position(parseDate('2026-06-22'), parseDate('2026-06-26'))
    expect(p.leftPct).toBe(0)
    expect(p.widthPct).toBeCloseTo((5 / 21) * 100, 5) // 5 inclusive days
  })
  it('clamps a bar to the range and sets todayPct inside the range', () => {
    const p = scale.position(parseDate('2026-07-06'), parseDate('2026-07-10'))
    expect(p.leftPct).toBeCloseTo((14 / 21) * 100, 5)
    expect(scale.todayPct).toBeCloseTo((5 / 21) * 100, 5)
  })
  it('returns null todayPct when now is outside the range', () => {
    expect(buildScale(scheduled, parseDate('2026-09-01')).todayPct).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- timeScale`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Write the implementation**

`src/features/ganttView/timeScale.ts`:
```ts
import { parseDate, startOfWeek, addDays, daysBetween } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

export function splitGantt(tasks: Task[]): { scheduled: Task[]; unscheduled: Task[] } {
  const scheduled: Task[] = []
  const unscheduled: Task[] = []
  for (const t of tasks) (t.start_date && t.end_date ? scheduled : unscheduled).push(t)
  return { scheduled, unscheduled }
}

export interface GanttScale {
  weeks: { start: Date; label: string }[]
  rangeStart: Date
  rangeDays: number
  todayPct: number | null
  position(start: Date, end: Date): { leftPct: number; widthPct: number }
}

const LABEL = { month: 'short', day: 'numeric' } as const

export function buildScale(scheduled: Task[], now: Date): GanttScale {
  const starts = scheduled.map((t) => parseDate(t.start_date!).getTime())
  const ends = scheduled.map((t) => parseDate(t.end_date!).getTime())
  const rangeStart = startOfWeek(new Date(Math.min(...starts)))
  const lastWeek = startOfWeek(new Date(Math.max(...ends)))
  const weekCount = Math.floor(daysBetween(rangeStart, lastWeek) / 7) + 1
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const start = addDays(rangeStart, i * 7)
    return { start, label: start.toLocaleDateString('en-US', LABEL) }
  })
  const rangeDays = weekCount * 7
  const todayOffset = daysBetween(rangeStart, now)
  const todayPct = todayOffset >= 0 && todayOffset <= rangeDays ? (todayOffset / rangeDays) * 100 : null

  return {
    weeks,
    rangeStart,
    rangeDays,
    todayPct,
    position(start, end) {
      const leftPct = Math.max(0, (daysBetween(rangeStart, start) / rangeDays) * 100)
      const widthPct = Math.min(((daysBetween(start, end) + 1) / rangeDays) * 100, 100 - leftPct)
      return { leftPct, widthPct }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- timeScale`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/ganttView/timeScale.ts src/features/ganttView/timeScale.test.ts
git commit -m "feat(gantt): timeScale — week columns, bar positions, today marker"
```

---

### Task 4: Gantt view + Shell mount

**Files:**
- Create: `src/features/ganttView/GanttView.tsx`
- Test: `src/features/ganttView/GanttView.test.tsx`
- Modify: `src/app/Shell.tsx` (import + `gantt` branch)
- Modify: `src/app/Shell.test.tsx` (mock `GanttView` + mount assertion)

**Interfaces:**
- Consumes: `useTasks` (`{ data: Task[]|undefined, isLoading, error }`), `useActiveWorkspace` (`{ activeId, loading }`), `STATUSES`, `splitGantt`/`buildScale`, `parseDate`.
- Produces: `export function GanttView(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

`src/features/ganttView/GanttView.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Task } from '../../data/tasksRepo'

const { useTasks, useActiveWorkspace } = vi.hoisted(() => ({
  useTasks: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))

import { GanttView } from './GanttView'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('GanttView', () => {
  it('renders one bar per scheduled task, a today marker, and the unscheduled list', () => {
    useTasks.mockReturnValue({
      data: [
        t({ id: 'a', ref: 'NIM-101', title: 'Login', start_date: '2026-06-22', end_date: '2026-06-26' }),
        t({ id: 'b', ref: 'NIM-105', title: 'Emails', start_date: null, end_date: null }),
      ],
      isLoading: false, error: null,
    })
    render(<GanttView />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByTestId('gantt-today')).toBeInTheDocument()
    expect(screen.getByText(/Unscheduled/i)).toBeInTheDocument()
    expect(screen.getByText('NIM-105')).toBeInTheDocument()
  })

  it('shows the no-scheduled message when every task is undated', () => {
    useTasks.mockReturnValue({ data: [t({ ref: 'NIM-105', start_date: null, end_date: null })], isLoading: false, error: null })
    render(<GanttView />)
    expect(screen.getByText(/no scheduled tasks/i)).toBeInTheDocument()
    expect(screen.queryByTestId('gantt-today')).toBeNull()
  })

  it('shows loading / error / empty states', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { rerender } = render(<GanttView />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    rerender(<GanttView />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    rerender(<GanttView />)
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- GanttView`
Expected: FAIL — `GanttView` not found.

- [ ] **Step 3: Write the implementation**

`src/features/ganttView/GanttView.tsx`:
```tsx
import { useTasks } from '../../lib/hooks/useTasks'
import { useActiveWorkspace } from '../../lib/workspace'
import { STATUSES } from '../../types/constants'
import { splitGantt, buildScale } from './timeScale'
import { parseDate } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

const COLOR: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.id, s.color]))
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const LABEL_COL = 160

export function GanttView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')

  if (wsLoading || isLoading) return <GanttSkeleton />
  if (error) return <GanttError />

  const all = tasks ?? []
  if (all.length === 0) return <GanttEmpty />

  const { scheduled, unscheduled } = splitGantt(all)
  const ordered = [...scheduled].sort((a, b) =>
    a.start_date! < b.start_date! ? -1 : a.start_date! > b.start_date! ? 1 : a.ref.localeCompare(b.ref),
  )

  return (
    <div className="mx-auto max-w-4xl">
      {ordered.length === 0 ? (
        <p className="mb-6 text-sm text-[var(--muted)]">No scheduled tasks yet — add start and due dates to place them on the timeline.</p>
      ) : (
        <GanttChart ordered={ordered} />
      )}
      {unscheduled.length > 0 && (
        <div className="mt-6 border-t border-dashed border-[var(--border)] pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">⊘ Unscheduled — {unscheduled.length}</p>
          <ul className="mt-2 space-y-1">
            {unscheduled.map((t) => (
              <li key={t.id} className="text-sm text-[var(--text)]">
                <span className="font-mono text-[11px] text-[var(--muted)]">{t.ref}</span> {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function GanttChart({ ordered }: { ordered: Task[] }) {
  const scale = buildScale(ordered, new Date())
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="grid" style={{ gridTemplateColumns: `${LABEL_COL}px 1fr` }}>
        <div />
        <div className="relative h-5 text-[11px] text-[var(--muted)]">
          {scale.weeks.map((w, i) => (
            <span key={i} className="absolute" style={{ left: `${(i / scale.weeks.length) * 100}%` }}>{w.label}</span>
          ))}
        </div>
      </div>
      <div className="relative">
        {scale.todayPct !== null && (
          <div
            data-testid="gantt-today"
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--primary)]"
            style={{ left: `calc(${LABEL_COL}px + (100% - ${LABEL_COL}px) * ${scale.todayPct / 100})` }}
          />
        )}
        {ordered.map((t) => {
          const { leftPct, widthPct } = scale.position(parseDate(t.start_date!), parseDate(t.end_date!))
          return (
            <div key={t.id} className="grid items-center" style={{ gridTemplateColumns: `${LABEL_COL}px 1fr`, height: 30 }}>
              <div className="truncate pr-3 text-xs text-[var(--text)]">
                <span className="font-mono text-[10px] text-[var(--muted)]">{t.ref}</span> {t.title}
              </div>
              <div className="relative h-5">
                <div
                  role="img"
                  aria-label={`${t.title} · ${fmt(parseDate(t.start_date!))} – ${fmt(parseDate(t.end_date!))}`}
                  className="absolute top-0.5 h-4 rounded"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 6, background: COLOR[t.status] ?? 'var(--muted)' }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GanttSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <span className="sr-only">Loading timeline…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="opm-skel h-3 w-32 rounded" />
          <div className="opm-skel h-4 flex-1 rounded" />
        </div>
      ))}
    </div>
  )
}

function GanttError() {
  return (
    <div role="alert" className="mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load tasks.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function GanttEmpty() {
  return (
    <div className="mx-auto flex max-w-4xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">No tasks yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Create a task with dates to see it on the Gantt.</p>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- GanttView`
Expected: PASS (3 tests).

- [ ] **Step 5: Mount in Shell**

In `src/app/Shell.tsx`, add the import near the other view imports:
```tsx
import { GanttView } from '../features/ganttView/GanttView'
```
Then add a branch to the `<main>` ternary chain (before the `coming next` fallback):
```tsx
          ) : view === 'gantt' ? (
            <GanttView />
```

- [ ] **Step 6: Update Shell.test and assert the mount**

In `src/app/Shell.test.tsx`, add the mock alongside the others:
```tsx
vi.mock('../features/ganttView/GanttView', () => ({
  GanttView: () => <div>gantt mounted</div>,
}))
```
Add a test inside `describe('Shell', …)`:
```tsx
  it('mounts the Gantt view on the Gantt tab', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Gantt' }))
    expect(screen.getByTestId('view-region')).toHaveTextContent('gantt mounted')
  })
```

- [ ] **Step 7: Run the affected tests + build**

Run: `npm run test -- GanttView Shell` then `npm run build`
Expected: both files PASS; `tsc -b && vite build` exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/features/ganttView/GanttView.tsx src/features/ganttView/GanttView.test.tsx src/app/Shell.tsx src/app/Shell.test.tsx
git commit -m "feat(gantt): GanttView — bars, today marker, unscheduled list; mount in Shell"
```

---

### Task 5: Timeline buckets — `src/features/timelineView/buckets.ts`

**Files:**
- Create: `src/features/timelineView/buckets.ts`
- Test: `src/features/timelineView/buckets.test.ts`

**Interfaces:**
- Consumes: `parseDate`, `startOfWeek`, `addDays` from `../../lib/weeks`; `Task` from `../../data/tasksRepo`.
- Produces:
  - `type BucketId = 'earlier' | 'this_week' | 'next_week' | 'later' | 'unscheduled'`
  - `bucketTasks(tasks: Task[], now: Date): { id: BucketId; label: string; tasks: Task[] }[]` — always all 5, fixed order; the view hides empty ones.

- [ ] **Step 1: Write the failing test**

`src/features/timelineView/buckets.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { bucketTasks } from './buckets'
import { parseDate } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', ...over,
})

const at = (id: string) => (r: ReturnType<typeof bucketTasks>) =>
  r.find((b) => b.id === id)!.tasks.map((x) => x.ref)

describe('bucketTasks', () => {
  const now = parseDate('2026-06-27') // Saturday; this week = Jun 22–28
  const result = bucketTasks(
    [
      t({ ref: 'EARLY', start_date: '2026-06-15' }),
      t({ ref: 'THIS', start_date: '2026-06-22' }),
      t({ ref: 'NEXT', start_date: '2026-06-29' }),
      t({ ref: 'LATER', start_date: '2026-07-06' }),
      t({ ref: 'NONE', start_date: null }),
    ],
    now,
  )

  it('keeps all five buckets in fixed order', () => {
    expect(result.map((b) => b.id)).toEqual(['earlier', 'this_week', 'next_week', 'later', 'unscheduled'])
  })
  it('routes each task to its bucket relative to now', () => {
    expect(at('earlier')(result)).toEqual(['EARLY'])
    expect(at('this_week')(result)).toEqual(['THIS'])
    expect(at('next_week')(result)).toEqual(['NEXT'])
    expect(at('later')(result)).toEqual(['LATER'])
    expect(at('unscheduled')(result)).toEqual(['NONE'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- buckets`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Write the implementation**

`src/features/timelineView/buckets.ts`:
```ts
import { parseDate, startOfWeek, addDays } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

export type BucketId = 'earlier' | 'this_week' | 'next_week' | 'later' | 'unscheduled'

const ORDER: { id: BucketId; label: string }[] = [
  { id: 'earlier', label: 'Earlier' },
  { id: 'this_week', label: 'This week' },
  { id: 'next_week', label: 'Next week' },
  { id: 'later', label: 'Later' },
  { id: 'unscheduled', label: 'Unscheduled' },
]

export function bucketTasks(tasks: Task[], now: Date): { id: BucketId; label: string; tasks: Task[] }[] {
  const monThis = startOfWeek(now)
  const monNext = addDays(monThis, 7)
  const monAfter = addDays(monThis, 14)
  const groups: Record<BucketId, Task[]> = { earlier: [], this_week: [], next_week: [], later: [], unscheduled: [] }

  for (const t of tasks) {
    if (!t.start_date) { groups.unscheduled.push(t); continue }
    const s = parseDate(t.start_date)
    if (s < monThis) groups.earlier.push(t)
    else if (s < monNext) groups.this_week.push(t)
    else if (s < monAfter) groups.next_week.push(t)
    else groups.later.push(t)
  }

  const byStart = (a: Task, b: Task) =>
    (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.ref.localeCompare(b.ref)
  for (const id of Object.keys(groups) as BucketId[]) {
    groups[id].sort(id === 'unscheduled' ? (a, b) => a.ref.localeCompare(b.ref) : byStart)
  }
  return ORDER.map((b) => ({ ...b, tasks: groups[b.id] }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- buckets`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/timelineView/buckets.ts src/features/timelineView/buckets.test.ts
git commit -m "feat(timeline): buckets — Earlier/This/Next/Later/Unscheduled by start date"
```

---

### Task 6: Timeline view + Shell mount

**Files:**
- Create: `src/features/timelineView/TimelineView.tsx`
- Test: `src/features/timelineView/TimelineView.test.tsx`
- Modify: `src/app/Shell.tsx` (import + `timeline` branch)
- Modify: `src/app/Shell.test.tsx` (mock `TimelineView` + mount assertion)

**Interfaces:**
- Consumes: `useTasks`, `useActiveWorkspace`, `STATUSES`, `bucketTasks`, `parseDate`.
- Produces: `export function TimelineView(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

`src/features/timelineView/TimelineView.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Task } from '../../data/tasksRepo'

const { useTasks, useActiveWorkspace } = vi.hoisted(() => ({
  useTasks: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))

import { TimelineView } from './TimelineView'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('TimelineView', () => {
  it('renders only the non-empty buckets with their tasks', () => {
    useTasks.mockReturnValue({
      data: [
        t({ ref: 'NIM-101', title: 'Login', start_date: '2026-06-22', end_date: '2026-06-26' }),
        t({ ref: 'NIM-105', title: 'Emails', start_date: null }),
      ],
      isLoading: false, error: null,
    })
    render(<TimelineView />)
    expect(screen.getByText('NIM-101')).toBeInTheDocument()
    expect(screen.getByText(/Unscheduled/i)).toBeInTheDocument()
    expect(screen.queryByText('Earlier')).toBeNull() // empty bucket hidden
  })

  it('shows loading / error / empty states', () => {
    useTasks.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { rerender } = render(<TimelineView />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    rerender(<TimelineView />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    useTasks.mockReturnValue({ data: [], isLoading: false, error: null })
    rerender(<TimelineView />)
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- TimelineView`
Expected: FAIL — `TimelineView` not found.

- [ ] **Step 3: Write the implementation**

`src/features/timelineView/TimelineView.tsx`:
```tsx
import { useTasks } from '../../lib/hooks/useTasks'
import { useActiveWorkspace } from '../../lib/workspace'
import { STATUSES } from '../../types/constants'
import { bucketTasks } from './buckets'
import { parseDate } from '../../lib/weeks'
import type { Task } from '../../data/tasksRepo'

const COLOR: Record<string, string> = Object.fromEntries(STATUSES.map((s) => [s.id, s.color]))
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function range(t: Task): string {
  if (!t.start_date) return ''
  const start = fmt(parseDate(t.start_date))
  return t.end_date ? `${start} – ${fmt(parseDate(t.end_date))}` : `${start} →`
}

export function TimelineView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')

  if (wsLoading || isLoading) return <TimelineSkeleton />
  if (error) return <TimelineError />

  const all = tasks ?? []
  if (all.length === 0) return <TimelineEmpty />

  const buckets = bucketTasks(all, new Date()).filter((b) => b.tasks.length > 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {buckets.map((b) => (
        <section key={b.id}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--primary)]">{b.label}</h2>
          <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)]">
            {b.tasks.map((t) => (
              <li key={t.id} className="opm-row flex items-center gap-3 px-4 py-3">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[t.status] ?? 'var(--muted)' }} />
                <span className="font-mono text-[11px] text-[var(--muted)]">{t.ref}</span>
                <span className="flex-1 truncate text-sm text-[var(--text)]">{t.title}</span>
                {range(t) && <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">{range(t)}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-2xl space-y-3">
      <span className="sr-only">Loading timeline…</span>
      {[0, 1, 2].map((i) => <div key={i} className="opm-skel h-12 rounded-xl" />)}
    </div>
  )
}

function TimelineError() {
  return (
    <div role="alert" className="mx-auto flex max-w-2xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load tasks.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function TimelineEmpty() {
  return (
    <div className="mx-auto flex max-w-2xl min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">No tasks yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Create a task to see it on the Timeline.</p>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- TimelineView`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount in Shell**

In `src/app/Shell.tsx`, add the import:
```tsx
import { TimelineView } from '../features/timelineView/TimelineView'
```
Add the branch after the `gantt` branch:
```tsx
          ) : view === 'timeline' ? (
            <TimelineView />
```

- [ ] **Step 6: Update Shell.test and assert the mount**

In `src/app/Shell.test.tsx`, add:
```tsx
vi.mock('../features/timelineView/TimelineView', () => ({
  TimelineView: () => <div>timeline mounted</div>,
}))
```
And a test:
```tsx
  it('mounts the Timeline view on the Timeline tab', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    expect(screen.getByTestId('view-region')).toHaveTextContent('timeline mounted')
  })
```

- [ ] **Step 7: Run the affected tests + build**

Run: `npm run test -- TimelineView Shell` then `npm run build`
Expected: PASS; `tsc -b && vite build` exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/features/timelineView/TimelineView.tsx src/features/timelineView/TimelineView.test.tsx src/app/Shell.tsx src/app/Shell.test.tsx
git commit -m "feat(timeline): TimelineView — agenda buckets; mount in Shell"
```

---

### Task 7: Impeccable visual pass + browser smoke

**Files:**
- Modify: `src/features/ganttView/GanttView.tsx`, `src/features/timelineView/TimelineView.tsx` (visual only — no logic/test changes)
- Possibly: `src/index.css` (only if a shared primitive is genuinely reused)

**Interfaces:** none changed. Tests stay green throughout.

This task uses the **impeccable** skill (project directive). It is visual refinement only — do not change component logic, props, or behavior, so the Task 4/6 tests keep passing unchanged.

- [ ] **Step 1: Invoke the impeccable skill** and apply a visual pass to both views, holding these invariants:
  - All colors via theme CSS vars; the only literal colors are the status hexes from `STATUSES` (bars, dots), looked up guarded with the `?? 'var(--muted)'` fallback.
  - Verify legibility in **both** Bloom and Slate. Bars/dots are saturated fills (fine on dark); if any *tinted* chip/surface is added, use `color-mix(in oklab, <hex> …, var(--surface))` (mirror `.opm-chip`/`.opm-tag` in `src/index.css`).
  - Keep the a11y already in place: `role="img"` + `aria-label` on Gantt bars, `role="status"`/`role="alert"` states, the week axis readable.
  - Gantt: tidy the week gridlines, today marker, bar radius/height, row rhythm, label-column truncation. Timeline: bucket heading rhythm, row hover (`opm-row`), date alignment.

- [ ] **Step 2: Run the full suite + build**

Run: `npm run test` then `npm run build`
Expected: all tests PASS (incl. the unchanged GanttView/TimelineView/Shell tests); `tsc -b && vite build` exits 0.

- [ ] **Step 3: Browser smoke (controller-run, both themes)**

Start the dev server (`npm run dev`; Vite uses `:5174` if `:5173` is busy), sign in to Northwind, and verify:
  - Gantt: NIM-101/102 (this week), NIM-103 (next), NIM-104 (later) render as bars across the week axis; today marker present; NIM-105/106 in the Unscheduled footer.
  - Timeline: This week / Next week / Later / Unscheduled sections populated; empty buckets hidden.
  - Toggle to Slate — bars/dots/chips stay legible.
  - Switch away and back; edit a status in List → both views reflect the cache update (shared `['tasks', ws]`).

- [ ] **Step 4: Commit**

```bash
git add src/features/ganttView/GanttView.tsx src/features/timelineView/TimelineView.tsx
git commit -m "style(gantt-timeline): impeccable visual pass — bars, axis, agenda, both themes"
```

---

## Self-Review

**1. Spec coverage:**
- Gantt (bars/week axis/today/unscheduled, both-dates rule) → Tasks 3–4. ✓
- Timeline (vertical agenda, start-date buckets relative to today, start-only rule) → Tasks 5–6. ✓
- Shared `weeks.ts` with local-midnight parse → Task 2. ✓
- No new data layer; reuse `useTasks` / `['tasks', ws]` live refresh → Tasks 4, 6 (mocked in tests; live in Task 7 smoke). ✓
- States (loading/error/empty + no-scheduled) → Tasks 4, 6. ✓
- Theming + a11y + guarded status color → all view tasks + Task 7. ✓
- Seed data → Task 1. ✓
- Shell mount both → Tasks 4, 6. ✓
- Out-of-scope items (drag, zoom, grouping, drawer) → not built. ✓

**2. Placeholder scan:** No TBD/TODO; every code/test/command step is concrete. ✓

**3. Type consistency:** `splitGantt`/`buildScale`/`GanttScale.position` names + signatures match between Task 3 (definition) and Task 4 (use). `bucketTasks`/`BucketId` match between Task 5 and Task 6. `parseDate`/`startOfWeek`/`addDays`/`daysBetween` defined in Task 2, used with identical signatures in Tasks 3 & 5. The `t(over: Partial<Task>): Task` fixture is identical across all test files. ✓

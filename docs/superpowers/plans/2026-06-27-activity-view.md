# Activity View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only workspace Activity feed — a flat, newest-first list rendered from the existing `activity` table (today only `verb='moved'` rows exist).

**Architecture:** Mirrors the shipped List/Board views exactly: a repo reader (`activityRepo.listActivity`) → a TanStack Query read hook (`useActivity`) → a view component (`ActivityView`) with loading/error/empty states → a per-row renderer (`ActivityRow`) that switches on `verb`. Supabase access stays confined to `src/data/`. No schema change, no migration, no new RLS — the `activity` table is already member-scoped and read-policied.

**Tech Stack:** Vite + React + TS + Tailwind, TanStack Query, Supabase JS (in `data/` only), Vitest + Testing Library, `Intl.RelativeTimeFormat` (native — no date dependency).

## Global Constraints

- **Type-check with `tsc -b`, never plain `tsc`** — root `tsconfig.json` uses project references + `files: []`; bare `tsc` checks nothing. `npm run build` runs `tsc -b && vite build`.
- **Supabase client only in `src/lib/supabase.ts` + `src/data/`** — features/components call `data/` repos through hooks. `src/architecture.test.ts` fails the suite on any violation. `ActivityView`/`ActivityRow` must NOT import `supabase`.
- **Themes are CSS variables** — style with `var(--surface)`, `var(--text)`, `var(--muted)`, `var(--border)`, `var(--bg)`, `var(--primary)`. Never hard-code theme hexes. (Taxonomy hexes from `STATUSES` in `src/types/constants.ts` are data, not theme tokens — using them for status chips is correct.)
- **Status/priority/type taxonomies are client constants** in `src/types/constants.ts` — reuse `STATUSES`, never query a DB table for them.
- **Design/UI work uses the `impeccable` skill** (project directive) — that is Task 4.
- **Commit scoped paths only** — never `git add -A`; `.superpowers/`, `.env.local`, `*.tsbuildinfo`, `HANDOFF.md` are gitignored.
- **Run tests:** `npm run test` (all) or `npm run test -- <name>` (one file).
- **Branch:** create `activity-view` off current `main` (`a7fdb77`, which has the spec) before Task 1; FF-merge back at the end (the per-view pattern).

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `src/lib/relativeTime.ts` (create) | Pure "2 hours ago" formatter via `Intl.RelativeTimeFormat`. No deps. | 1 |
| `src/lib/relativeTime.test.ts` (create) | Unit-tests the unit thresholds with an injected `now`. | 1 |
| `src/data/activityRepo.ts` (modify) | Add `ActivityItem` type + `listActivity(ws)` reader (joins actor+task). | 2 |
| `src/data/activityRepo.test.ts` (modify) | Add `listActivity` query/shape/error tests. | 2 |
| `src/lib/hooks/useActivity.ts` (create) | `['activity', ws]` read hook. Mirrors `useMembers`. | 3 |
| `src/features/activityView/ActivityView.tsx` (create) | View shell: states + flat `<ol>` of rows. | 3 |
| `src/features/activityView/ActivityRow.tsx` (create) | Per-row renderer; switches on `verb`; avatar + status chips + relative time; null-safe. | 3 |
| `src/features/activityView/ActivityView.test.tsx` (create) | States + moved-row content + unknown-verb/null fallbacks. | 3 |
| `src/app/Shell.tsx` (modify) | Mount `<ActivityView />` for `view === 'activity'`. | 3 |
| `src/app/Shell.test.tsx` (modify) | Mock `ActivityView`; assert the Activity tab mounts it. | 3 |

---

### Task 1: `relativeTime` helper

**Files:**
- Create: `src/lib/relativeTime.ts`
- Test: `src/lib/relativeTime.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `relativeTime(iso: string, now?: number): string` — `now` defaults to `Date.now()`; injectable for deterministic tests.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/relativeTime.test.ts
import { describe, it, expect } from 'vitest'
import { relativeTime } from './relativeTime'

const NOW = Date.parse('2026-06-27T12:00:00Z')

describe('relativeTime', () => {
  it('returns "just now" under 45 seconds', () => {
    expect(relativeTime('2026-06-27T11:59:50Z', NOW)).toBe('just now')
  })
  it('formats minutes', () => {
    expect(relativeTime('2026-06-27T11:55:00Z', NOW)).toBe('5 minutes ago')
  })
  it('formats hours', () => {
    expect(relativeTime('2026-06-27T09:00:00Z', NOW)).toBe('3 hours ago')
  })
  it('formats days', () => {
    expect(relativeTime('2026-06-25T12:00:00Z', NOW)).toBe('2 days ago')
  })
  it('falls back to an absolute date past a week', () => {
    expect(relativeTime('2026-05-28T12:00:00Z', NOW)).toBe('May 28')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- relativeTime`
Expected: FAIL — `relativeTime` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/relativeTime.ts
const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

// ponytail: native Intl, no date library. Largest sensible unit; absolute date past a week.
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000) // negative = past
  const abs = Math.abs(diffSec)
  if (abs < 45) return 'just now'
  if (abs < 3600) return RTF.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return RTF.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 604800) return RTF.format(Math.round(diffSec / 86400), 'day')
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- relativeTime`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/relativeTime.ts src/lib/relativeTime.test.ts
git commit -m "feat(activity): relativeTime helper (native Intl, no date dep)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `activityRepo.listActivity`

**Files:**
- Modify: `src/data/activityRepo.ts` (add type + reader alongside existing `logMove`)
- Test: `src/data/activityRepo.test.ts` (extend the existing file)

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase`; `Status` (already aliased at the top of `activityRepo.ts` as `Database['public']['Enums']['task_status']`).
- Produces:
  - `interface ActivityItem { id: string; verb: string; from_status: Status | null; to_status: Status | null; created_at: string; actor: { name: string; color: string } | null; task: { ref: string; title: string } | null }`
  - `listActivity(workspaceId: string): Promise<ActivityItem[]>` — newest-first, capped at 100.

**Schema note (already verified, no action needed):** `activity.actor_id → profiles.id` and `activity.task_id → tasks.id` are real FKs, so the PostgREST embeds `actor:profiles!actor_id(name,color)` and `task:tasks!task_id(ref,title)` resolve directly.

- [ ] **Step 1: Write the failing tests**

The existing test file mocks the Supabase client with `vi.hoisted`. Replace its hoisted mock block so the chain covers BOTH `insert` (existing `logMove`) AND `select().eq().order().limit()` (new reader), then add the `listActivity` describe block.

Replace lines 3–10 (the `vi.hoisted` block) with:

```ts
const { insert, limit, order, eq, select, from } = vi.hoisted(() => {
  const insert = vi.fn()
  const limit = vi.fn()
  const order = vi.fn(() => ({ limit }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ insert, select }))
  return { insert, limit, order, eq, select, from }
})
```

Then add, after the existing `logMove` describe block:

```ts
import { logMove, listActivity } from './activityRepo' // <-- update the existing import line to add listActivity

const ROW = {
  id: 'a1', verb: 'moved', from_status: 'todo', to_status: 'done',
  created_at: '2026-06-27T10:00:00Z',
  actor: { name: 'Dana', color: '#abc' }, task: { ref: 'NIM-101', title: 'Fix login' },
}

describe('activityRepo.listActivity', () => {
  it('reads workspace activity newest-first, capped at 100, with actor + task joined', async () => {
    limit.mockResolvedValueOnce({ data: [ROW], error: null })
    const items = await listActivity('w1')
    expect(from).toHaveBeenCalledWith('activity')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('actor:profiles!actor_id'))
    expect(select).toHaveBeenCalledWith(expect.stringContaining('task:tasks!task_id'))
    expect(eq).toHaveBeenCalledWith('workspace_id', 'w1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(100)
    expect(items[0]).toEqual(ROW)
  })

  it('maps null actor/task without throwing', async () => {
    limit.mockResolvedValueOnce({
      data: [{ id: 'a2', verb: 'moved', from_status: null, to_status: null, created_at: 'x', actor: null, task: null }],
      error: null,
    })
    const [item] = await listActivity('w1')
    expect(item.actor).toBeNull()
    expect(item.task).toBeNull()
  })

  it('throws on a Supabase error', async () => {
    limit.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listActivity('w1')).rejects.toThrow('boom')
  })
})
```

(Update the existing `import { logMove } from './activityRepo'` line to `import { logMove, listActivity } from './activityRepo'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- activityRepo`
Expected: FAIL — `listActivity` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/data/activityRepo.ts` (keep the existing `logMove` and the `Status` alias):

```ts
export interface ActivityItem {
  id: string
  verb: string
  from_status: Status | null
  to_status: Status | null
  created_at: string
  actor: { name: string; color: string } | null
  task: { ref: string; title: string } | null
}

export async function listActivity(workspaceId: string): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('activity')
    .select(
      'id, verb, from_status, to_status, created_at, actor:profiles!actor_id(name,color), task:tasks!task_id(ref,title)',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const row = r as unknown as ActivityItem
    return {
      id: row.id,
      verb: row.verb,
      from_status: row.from_status,
      to_status: row.to_status,
      created_at: row.created_at,
      actor: row.actor ?? null,
      task: row.task ?? null,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- activityRepo`
Expected: PASS (existing `logMove` tests + 3 new `listActivity` tests). Also run `npm run test -- architecture` and expect PASS (Supabase stays in `data/`).

- [ ] **Step 5: Commit**

```bash
git add src/data/activityRepo.ts src/data/activityRepo.test.ts
git commit -m "feat(activity): activityRepo.listActivity — joined feed, newest-first, capped

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `useActivity` hook + `ActivityView` + `ActivityRow` + Shell mount

**Files:**
- Create: `src/lib/hooks/useActivity.ts`
- Create: `src/features/activityView/ActivityView.tsx`
- Create: `src/features/activityView/ActivityRow.tsx`
- Create: `src/features/activityView/ActivityView.test.tsx`
- Modify: `src/app/Shell.tsx`
- Modify: `src/app/Shell.test.tsx`

**Interfaces:**
- Consumes: `listActivity` + `ActivityItem` (Task 2); `relativeTime` (Task 1); `useActiveWorkspace` from `../../lib/workspace` (returns `{ activeId: string | null; loading: boolean }`); `STATUSES` + `Status` from `../../types/constants`.
- Produces:
  - `useActivity(workspaceId: string)` → TanStack Query result `{ data: ActivityItem[] | undefined; isLoading: boolean; error: Error | null }`, key `['activity', workspaceId]`.
  - `ActivityView` (default render for `view === 'activity'`).
  - `ActivityRow({ item }: { item: ActivityItem })`.

- [ ] **Step 1: Write the failing view test**

```tsx
// src/features/activityView/ActivityView.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useActivity, useActiveWorkspace } = vi.hoisted(() => ({
  useActivity: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useActivity', () => ({ useActivity }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))

import { ActivityView } from './ActivityView'

const MOVED = {
  id: 'a1', verb: 'moved', from_status: 'in_progress', to_status: 'in_review',
  created_at: '2026-06-27T10:00:00Z',
  actor: { name: 'Dana', color: '#6d5ef0' }, task: { ref: 'NIM-101', title: 'Fix login redirect' },
}

beforeEach(() => vi.clearAllMocks())

describe('ActivityView', () => {
  it('renders a moved activity row with actor, task, and from/to statuses', () => {
    useActivity.mockReturnValue({ data: [MOVED], isLoading: false, error: null })
    render(<ActivityView />)
    expect(screen.getByText('Dana')).toBeInTheDocument()
    expect(screen.getByText('NIM-101')).toBeInTheDocument()
    expect(screen.getByText(/Fix login redirect/)).toBeInTheDocument()
    expect(screen.getByText(/moved/)).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('In Review')).toBeInTheDocument()
  })

  it('shows the loading state', () => {
    useActivity.mockReturnValue({ data: undefined, isLoading: true, error: null })
    render(<ActivityView />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows the error state', () => {
    useActivity.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x') })
    render(<ActivityView />)
    expect(screen.getByText(/couldn't load activity/i)).toBeInTheDocument()
  })

  it('shows the empty state when there is no activity', () => {
    useActivity.mockReturnValue({ data: [], isLoading: false, error: null })
    render(<ActivityView />)
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })

  it('falls back gracefully for an unknown verb and null actor/task', () => {
    useActivity.mockReturnValue({
      data: [{ id: 'a2', verb: 'sneezed', from_status: null, to_status: null, created_at: '2026-06-27T10:00:00Z', actor: null, task: null }],
      isLoading: false, error: null,
    })
    render(<ActivityView />)
    expect(screen.getByText(/someone/i)).toBeInTheDocument()
    expect(screen.getByText(/sneezed/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ActivityView`
Expected: FAIL — `ActivityView` module not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/lib/hooks/useActivity.ts
import { useQuery } from '@tanstack/react-query'
import { listActivity } from '../../data/activityRepo'

export function useActivity(workspaceId: string) {
  return useQuery({
    queryKey: ['activity', workspaceId],
    queryFn: () => listActivity(workspaceId),
    enabled: !!workspaceId,
  })
}
```

- [ ] **Step 4: Implement the row renderer**

```tsx
// src/features/activityView/ActivityRow.tsx
import { STATUSES } from '../../types/constants'
import { relativeTime } from '../../lib/relativeTime'
import type { ActivityItem } from '../../data/activityRepo'
import type { Status } from '../../types/constants'

const STATUS_META = Object.fromEntries(STATUSES.map((s) => [s.id, s])) as Record<
  Status,
  (typeof STATUSES)[number]
>

function StatusChip({ status }: { status: Status | null }) {
  if (!status) return null
  const s = STATUS_META[status]
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ background: `${s.color}1f`, color: s.color }}
    >
      {s.label}
    </span>
  )
}

export function ActivityRow({ item }: { item: ActivityItem }) {
  const name = item.actor?.name || 'Someone'
  const color = item.actor?.color || 'var(--muted)'

  return (
    <div className="flex items-start gap-3 border-b border-[var(--border)] px-3 py-3">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{ background: color }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--text)]">
          <span className="font-medium">{name}</span>
          {item.verb === 'moved' ? (
            <>
              <span className="text-[var(--muted)]"> moved </span>
              {item.task ? (
                <span>
                  <span className="text-[var(--muted)]">{item.task.ref}</span> {item.task.title}
                </span>
              ) : (
                <span className="text-[var(--muted)]">a task</span>
              )}
            </>
          ) : (
            <span className="text-[var(--muted)]"> {item.verb}</span>
          )}
        </p>
        {item.verb === 'moved' && (
          <div className="mt-1 flex items-center gap-1.5">
            <StatusChip status={item.from_status} />
            <span className="text-[var(--muted)]" aria-hidden="true">→</span>
            <StatusChip status={item.to_status} />
          </div>
        )}
      </div>
      <time
        dateTime={item.created_at}
        title={new Date(item.created_at).toLocaleString()}
        className="shrink-0 text-xs text-[var(--muted)]"
      >
        {relativeTime(item.created_at)}
      </time>
    </div>
  )
}
```

- [ ] **Step 5: Implement the view (with states)**

```tsx
// src/features/activityView/ActivityView.tsx
import { useActivity } from '../../lib/hooks/useActivity'
import { useActiveWorkspace } from '../../lib/workspace'
import { ActivityRow } from './ActivityRow'

export function ActivityView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: items, isLoading, error } = useActivity(activeId ?? '')

  if (wsLoading || isLoading) return <ActivitySkeleton />
  if (error) return <ActivityError />

  const feed = items ?? []
  if (feed.length === 0) return <ActivityEmpty />

  return (
    <ol className="mx-auto flex max-w-2xl flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)]">
      {feed.map((item) => (
        <li key={item.id}>
          <ActivityRow item={item} />
        </li>
      ))}
    </ol>
  )
}

function ActivitySkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto flex max-w-2xl flex-col gap-2">
      <span className="sr-only">Loading activity…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="opm-skel h-7 w-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="opm-skel h-3 w-2/3 rounded" />
            <div className="opm-skel h-3 w-24 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ActivityError() {
  return (
    <div
      role="alert"
      className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"
    >
      <p className="text-base font-semibold text-[var(--text)]">Couldn't load activity.</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Check your connection and try again.</p>
    </div>
  )
}

function ActivityEmpty() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-base font-semibold text-[var(--text)]">No activity yet</p>
      <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
        Move a card on the Board to start the feed.
      </p>
    </div>
  )
}
```

(`opm-skel` is the existing skeleton-shimmer primitive used by `BoardView`.)

- [ ] **Step 6: Run the view test to verify it passes**

Run: `npm run test -- ActivityView`
Expected: PASS (5 tests).

- [ ] **Step 7: Write the failing Shell mount test**

In `src/app/Shell.test.tsx`, add a mock for `ActivityView` next to the existing view mocks:

```tsx
vi.mock('../features/activityView/ActivityView', () => ({
  ActivityView: () => <div>activity feed mounted</div>,
}))
```

And add a test inside the `describe('Shell', …)` block:

```tsx
it('mounts the Activity view on the Activity tab', async () => {
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: 'Activity' }))
  expect(screen.getByTestId('view-region')).toHaveTextContent('activity feed mounted')
})
```

- [ ] **Step 8: Run the Shell test to verify it fails**

Run: `npm run test -- Shell`
Expected: FAIL — view-region shows the `"activity view — coming next."` placeholder, not `"activity feed mounted"`.

- [ ] **Step 9: Mount the view in the Shell**

In `src/app/Shell.tsx`, add the import near the other view imports:

```tsx
import { ActivityView } from '../features/activityView/ActivityView'
```

Replace the `<main>` body's view switch:

```tsx
{view === 'list' ? <ListView /> : view === 'board' ? <BoardView /> : `${view} view — coming next.`}
```

with:

```tsx
{view === 'list' ? (
  <ListView />
) : view === 'board' ? (
  <BoardView />
) : view === 'activity' ? (
  <ActivityView />
) : (
  `${view} view — coming next.`
)}
```

- [ ] **Step 10: Run the full suite + type-check**

Run: `npm run test` then `npm run build`
Expected: all tests PASS (incl. `architecture` and `Shell`); `tsc -b && vite build` clean.

- [ ] **Step 11: Commit**

```bash
git add src/lib/hooks/useActivity.ts src/features/activityView/ActivityView.tsx src/features/activityView/ActivityRow.tsx src/features/activityView/ActivityView.test.tsx src/app/Shell.tsx src/app/Shell.test.tsx
git commit -m "feat(activity): Activity feed view — useActivity hook, view + row, Shell mount

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Impeccable visual pass + browser smoke

**Files:**
- Modify: `src/features/activityView/ActivityView.tsx`, `src/features/activityView/ActivityRow.tsx` (visual refinement only — no behavior/signature changes)

**Interfaces:**
- Consumes / Produces: unchanged from Task 3. This task only refines appearance; the tests written in Task 3 must remain green (adjust test queries only if markup changes break a selector, never to weaken an assertion).

**REQUIRED SKILL:** Invoke the `impeccable` skill (project directive — design/UI work uses impeccable, not frontend-design).

- [ ] **Step 1: Invoke impeccable and refine the feed**

Apply an impeccable visual pass to `ActivityView` + `ActivityRow`, holding to the theme-variable rule (no hard-coded theme hexes; `STATUSES` taxonomy hexes for chips are fine). Focus areas: row rhythm/density and alignment, avatar treatment, the from→to chip pairing and arrow, timestamp placement, the empty/error/loading states, and a tasteful container width/elevation consistent with List/Board. Keep accessibility intact (`role=status` skeleton, `role=alert` error, `<time>` with `dateTime` + absolute `title`, decorative elements `aria-hidden`).

- [ ] **Step 2: Run the full suite + type-check + build**

Run: `npm run test` then `npm run build`
Expected: all tests PASS; `tsc -b && vite build` clean. If a markup change broke a Task 3 selector, update the query to match the new DOM (e.g. role/regex), never to weaken the assertion.

- [ ] **Step 3: Browser smoke (Bloom + Slate)**

Start the stack and dev server, sign in to the seeded Northwind workspace, generate a few activity rows by dragging cards on the Board, then open the Activity view and verify both themes.

```bash
export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
npm run dev   # http://localhost:5173 — sign up any email+password (local, no confirmation)
```

Verify in the browser (Claude-in-Chrome): the feed renders newest-first; actor avatar + name, `ref · title`, and from→to status chips read correctly; relative timestamps look right; loading/empty/error states are sound; toggle the theme and confirm Bloom **and** Slate both look impeccable with no hard-coded-color bleed. Screenshot both themes.

- [ ] **Step 4: Commit**

```bash
git add src/features/activityView/ActivityView.tsx src/features/activityView/ActivityRow.tsx
git commit -m "style(activity): impeccable visual pass — feed rows, chips, states

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## After all tasks

- Final whole-feature review (opus) per the per-view pattern (`superpowers:requesting-code-review`) — it earns its cost (caught a Critical on Board the per-task gates missed).
- Then `superpowers:finishing-a-development-branch`: FF-merge `activity-view` → `main`, push, delete the branch. Update `.superpowers/sdd/progress.md`.

## Self-Review

**Spec coverage:**
- listActivity reader (join, newest-first, limit 100) → Task 2 ✓
- useActivity hook keyed `['activity', ws]` (invalidated by useMoveTask) → Task 3 ✓
- ActivityView states (loading/error/empty/loaded) → Task 3 (tests) + Task 4 (polish) ✓
- ActivityRow verb switch + status chips + avatar + null/unknown fallbacks → Task 3 ✓
- relativeTime (native Intl, no dep) → Task 1 ✓
- Shell mount at `view === 'activity'` → Task 3 ✓
- architecture.test stays green (Supabase only in repo) → Task 2 Step 4 + Task 3 Step 10 ✓
- impeccable visual pass + browser smoke (Bloom+Slate) → Task 4 ✓
- Out-of-scope items (other verbs, pagination, filtering, row→drawer nav, realtime) → not implemented, by design ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code; every command shows expected output. ✓

**Type consistency:** `ActivityItem` (Task 2) is consumed unchanged by `useActivity`/`ActivityRow` (Task 3). `relativeTime(iso, now?)` (Task 1) called as `relativeTime(item.created_at)` (Task 3) — default `now` ✓. `Status` from `constants` matches `STATUSES` ids ✓. `useActiveWorkspace()` shape (`activeId`, `loading`) matches `src/lib/workspace.tsx` ✓. Supabase mock chain `from().select().eq().order().limit()` matches the implementation's call order ✓.

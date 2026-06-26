# Board View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Kanban board (one column per status) with native drag-and-drop that moves cards across columns (status change) and reorders within a column (position change), logging an `activity` row on every status move — shared with the List view's inline status edit.

**Architecture:** New `activityRepo.logMove` + an optimistic `useMoveTask` hook (status + position + conditional activity log); a `features/boardView/` (columns from `STATUSES`, cards by `position`) with native HTML5 DnD; the List's status `<select>` retrofitted to route through `useMoveTask`. Realtime deferred.

**Tech Stack:** React 18, TypeScript, TanStack Query v5, Tailwind (CSS-var themes), sonner, Vitest + RTL, `@supabase/supabase-js` (in `data/` only).

## Global Constraints

From `docs/superpowers/specs/2026-06-26-board-view-design.md` and the foundation/List view.

- Built on `main` (foundation + List). **`@supabase/supabase-js`/`supabase` only in `src/lib/supabase.ts` + `src/data/`** — `src/architecture.test.ts` fails the suite otherwise.
- **Type-check with `npx tsc -b`** (plain `tsc` is a no-op). Tests mock `supabase-js`; no Supabase runtime needed for tests.
- Themes via CSS variables; status/priority/type/tag colors from `src/types/constants.ts`. Never hard-code theme hexes.
- Mock consts in `vi.mock()` factories go in `vi.hoisted()`.
- Activity is logged **only when status changes** (`toStatus !== fromStatus`); a pure intra-column reorder updates `position` only. `logMove` is best-effort (if the status update succeeds but the log fails, the move stays + we toast; refetch reconciles).
- `boardColumns` shows **all 5** `STATUSES` in order, each sorted by `position` asc, empty columns kept. `computeDropPosition` measures against the target column **excluding the dragged card**.
- Cache keys: `['tasks', ws]`, `['members', ws]`, `['activity', ws]`. Moves are optimistic, roll back + `toast.error` on failure.
- UI/styling uses the **impeccable** skill (Task 5).

## File Structure

```
src/data/
  tasksRepo.ts            (modify) widen updateTask patch to include `position`
  tasksRepo.test.ts       (modify) assert a position patch
  activityRepo.ts         logMove() — insert a `moved` activity row
  activityRepo.test.ts
src/lib/hooks/
  useMoveTask.ts          optimistic status+position move + conditional activity log
  useMoveTask.test.ts
src/features/listView/    (modify) route StatusCell through useMoveTask
  ListView.tsx, TaskTable.tsx, TaskRow.tsx, ListView.test.tsx
src/features/boardView/
  boardColumns.ts         all 5 status columns, position-sorted
  boardColumns.test.ts
  computeDropPosition.ts  fractional drop position
  computeDropPosition.test.ts
  BoardView.tsx           columns + DnD state + states
  BoardView.test.tsx
  BoardColumn.tsx         a column: header + cards + drop target
  TaskCard.tsx            a draggable card
src/app/Shell.tsx         (modify) render <BoardView/> for view=board
```

---

### Task 1: Widen `updateTask` patch + `activityRepo.logMove`

**Files:**
- Modify: `src/data/tasksRepo.ts`, `src/data/tasksRepo.test.ts`
- Create: `src/data/activityRepo.ts`, `src/data/activityRepo.test.ts`

**Interfaces:**
- Produces: `updateTask(id, patch)` where `patch: Partial<Pick<Task, 'status'|'priority'|'assignee_id'|'title'|'position'>>`; `activityRepo.logMove({ workspaceId, actorId, taskId, fromStatus, toStatus }): Promise<void>` (`fromStatus`/`toStatus` are `Database['public']['Enums']['task_status']`).

- [ ] **Step 1: Widen the `updateTask` patch type in `src/data/tasksRepo.ts`**

```ts
export async function updateTask(
  id: string,
  patch: Partial<Pick<Task, 'status' | 'priority' | 'assignee_id' | 'title' | 'position'>>,
): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
```
(Body unchanged; only the patch type gains `'position'`.)

- [ ] **Step 2: Add a position-patch assertion to `src/data/tasksRepo.test.ts`**

Add inside the existing `describe`:
```ts
  it('accepts a position patch', async () => {
    await updateTask('t1', { position: 1.5 })
    expect(update).toHaveBeenCalledWith({ position: 1.5 })
    expect(updateEq).toHaveBeenCalledWith('id', 't1')
  })
```

- [ ] **Step 3: Run it — verify it passes**

Run: `npm run test -- tasksRepo`
Expected: PASS (position now allowed by the type + asserted).

- [ ] **Step 4: Write the failing test for `activityRepo.logMove`**

`src/data/activityRepo.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn()
  const from = vi.fn(() => ({ insert }))
  return { insert, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { logMove } from './activityRepo'

beforeEach(() => vi.clearAllMocks())

describe('activityRepo.logMove', () => {
  it('inserts a moved activity row', async () => {
    insert.mockResolvedValueOnce({ error: null })
    await logMove({ workspaceId: 'w1', actorId: 'u1', taskId: 't1', fromStatus: 'todo', toStatus: 'done' })
    expect(from).toHaveBeenCalledWith('activity')
    expect(insert).toHaveBeenCalledWith({
      workspace_id: 'w1', actor_id: 'u1', task_id: 't1',
      verb: 'moved', from_status: 'todo', to_status: 'done',
    })
  })
  it('throws on error', async () => {
    insert.mockResolvedValueOnce({ error: { message: 'boom' } })
    await expect(logMove({ workspaceId: 'w1', actorId: 'u1', taskId: 't1', fromStatus: 'todo', toStatus: 'done' }))
      .rejects.toThrow('boom')
  })
})
```

- [ ] **Step 5: Run it — verify it fails**

Run: `npm run test -- activityRepo`
Expected: FAIL — `./activityRepo` not found.

- [ ] **Step 6: Implement `src/data/activityRepo.ts`**

```ts
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

type Status = Database['public']['Enums']['task_status']

export async function logMove(params: {
  workspaceId: string
  actorId: string
  taskId: string
  fromStatus: Status
  toStatus: Status
}): Promise<void> {
  const { error } = await supabase.from('activity').insert({
    workspace_id: params.workspaceId,
    actor_id: params.actorId,
    task_id: params.taskId,
    verb: 'moved',
    from_status: params.fromStatus,
    to_status: params.toStatus,
  })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm run test -- tasksRepo activityRepo` → PASS.
Run: `npx tsc -b` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/data/tasksRepo.ts src/data/tasksRepo.test.ts src/data/activityRepo.ts src/data/activityRepo.test.ts
git commit -m "feat(board): widen updateTask patch (position) + activityRepo.logMove"
```

---

### Task 2: `useMoveTask` + retrofit List status cell

**Files:**
- Create: `src/lib/hooks/useMoveTask.ts`, `src/lib/hooks/useMoveTask.test.ts`
- Modify: `src/features/listView/TaskRow.tsx`, `src/features/listView/TaskTable.tsx`, `src/features/listView/ListView.tsx`, `src/features/listView/ListView.test.tsx`

**Interfaces:**
- Consumes: `updateTask`, `Task` (tasksRepo); `logMove` (activityRepo); `useSession` (`{ session }`, `session.user.id`); `toast`.
- Produces: `useMoveTask(workspaceId)` → mutation whose `mutate` takes `{ taskId: string; toStatus: Task['status']; position: number; fromStatus: Task['status'] }`. Optimistically sets `{status, position}` on the cached task; calls `updateTask` then (only if `toStatus !== fromStatus`) `logMove`; rolls back + toasts on error; invalidates `['tasks', ws]` + `['activity', ws]`.

- [ ] **Step 1: Write the failing test for `useMoveTask`**

`src/lib/hooks/useMoveTask.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { updateTask, logMove } = vi.hoisted(() => ({ updateTask: vi.fn(), logMove: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({ updateTask }))
vi.mock('../../data/activityRepo', () => ({ logMove }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('./useSession', () => ({ useSession: () => ({ session: { user: { id: 'u1' } } }) }))

import { useMoveTask } from './useMoveTask'
import { toast } from 'sonner'

const ws = 'w1'
const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useMoveTask', () => {
  it('optimistically sets status+position and logs activity on a status change', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    updateTask.mockResolvedValueOnce(undefined); logMove.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ taskId: 't1', toStatus: 'done', position: 5, fromStatus: 'todo' })
    await waitFor(() => {
      const t = (qc.getQueryData(['tasks', ws]) as any)[0]
      expect(t.status).toBe('done'); expect(t.position).toBe(5)
    })
    await waitFor(() => expect(logMove).toHaveBeenCalledWith(
      { workspaceId: ws, actorId: 'u1', taskId: 't1', fromStatus: 'todo', toStatus: 'done' }))
  })

  it('does NOT log activity for a pure reorder (same status)', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    updateTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ taskId: 't1', toStatus: 'todo', position: 2, fromStatus: 'todo' })
    await waitFor(() => expect(updateTask).toHaveBeenCalled())
    expect(logMove).not.toHaveBeenCalled()
  })

  it('rolls back and toasts on error', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', status: 'todo', position: 0 }])
    updateTask.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useMoveTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ taskId: 't1', toStatus: 'done', position: 5, fromStatus: 'todo' })
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect((qc.getQueryData(['tasks', ws]) as any)[0].status).toBe('todo')
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm run test -- useMoveTask`
Expected: FAIL — `./useMoveTask` not found.

- [ ] **Step 3: Implement `src/lib/hooks/useMoveTask.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { updateTask, type Task } from '../../data/tasksRepo'
import { logMove } from '../../data/activityRepo'
import { useSession } from './useSession'

interface MoveArgs {
  taskId: string
  toStatus: Task['status']
  position: number
  fromStatus: Task['status']
}

export function useMoveTask(workspaceId: string) {
  const qc = useQueryClient()
  const { session } = useSession()
  const key = ['tasks', workspaceId]
  return useMutation({
    mutationFn: async ({ taskId, toStatus, position, fromStatus }: MoveArgs) => {
      await updateTask(taskId, { status: toStatus, position })
      if (toStatus !== fromStatus) {
        await logMove({ workspaceId, actorId: session?.user.id ?? '', taskId, fromStatus, toStatus })
      }
    },
    onMutate: async ({ taskId, toStatus, position }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key)
      qc.setQueryData<Task[]>(key, (old) =>
        (old ?? []).map((t) => (t.id === taskId ? { ...t, status: toStatus, position } : t)))
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Move failed: ${(err as Error).message}`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
    },
  })
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npm run test -- useMoveTask` → PASS (3 tests).

- [ ] **Step 5: Retrofit the List status cell to `useMoveTask`**

In `src/features/listView/TaskRow.tsx`, add an `onMove` prop and route the status cell through it (keep `onPatch` for priority/assignee):
```tsx
// signature gains: onMove: (task: Task, toStatus: Task['status']) => void
// the status <td> becomes:
<td className="px-2 py-1">
  <StatusCell task={task} onChange={(p) => p.status && onMove(task, p.status)} />
</td>
// priority/assignee <td>s keep: onChange={(p) => onPatch(task.id, p)}
```
Thread `onMove` through `TaskTable.tsx` (add the prop, pass to each `TaskRow`). In `src/features/listView/ListView.tsx`:
```tsx
import { useMoveTask } from '../../lib/hooks/useMoveTask'
// inside ListView, alongside the existing update:
const move = useMoveTask(activeId ?? '')
const onMove = (task: Task, toStatus: Task['status']) =>
  move.mutate({ taskId: task.id, toStatus, position: task.position, fromStatus: task.status })
// pass onMove={onMove} to each <TaskTable …> (and keep onPatch for priority/assignee)
```
(Import `Task` from `'../../data/tasksRepo'` in TaskRow/TaskTable/ListView as needed.)

- [ ] **Step 6: Update the List status-change test to expect `useMoveTask`**

In `src/features/listView/ListView.test.tsx`: add a hoisted `moveMutate` and mock `useMoveTask`, then change the status-change test to assert the move:
```ts
// in vi.hoisted add: moveMutate: vi.fn()
// vi.mock('../../lib/hooks/useMoveTask', () => ({ useMoveTask: () => ({ mutate: moveMutate }) }))
// the existing status-change test body becomes:
it('moves a task (logs activity) when its status cell changes', async () => {
  useTasks.mockReturnValue({ data: [{ id: 't1', ref: 'NIM-1', title: 'Hello', status: 'todo', priority: 'low', position: 0, type: 'feature', assignee_id: null, points: null }], isLoading: false, error: null })
  const { default: userEvent } = await import('@testing-library/user-event')
  render(<ListView />)
  await userEvent.selectOptions(screen.getByLabelText('Status'), 'done')
  expect(moveMutate).toHaveBeenCalledWith({ taskId: 't1', toStatus: 'done', position: 0, fromStatus: 'todo' })
})
```

- [ ] **Step 7: Run the whole suite + typecheck**

Run: `npm run test` → ALL pass (List status now goes through `useMoveTask`; priority/assignee still `useUpdateTask`).
Run: `npx tsc -b` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/hooks/useMoveTask.ts src/lib/hooks/useMoveTask.test.ts src/features/listView
git commit -m "feat(board): optimistic useMoveTask + activity log; route List status through it"
```

---

### Task 3: `boardColumns` + read-only board

**Files:**
- Create: `src/features/boardView/boardColumns.ts`, `src/features/boardView/boardColumns.test.ts`, `src/features/boardView/BoardView.tsx`, `src/features/boardView/BoardView.test.tsx`, `src/features/boardView/BoardColumn.tsx`, `src/features/boardView/TaskCard.tsx`
- Modify: `src/app/Shell.tsx`

**Interfaces:**
- Consumes: `STATUSES`/`Status`/`TASK_TYPES`/`PRIORITIES`/`TAG_COLORS` (constants), `Task` (tasksRepo), `Member` (membersRepo), `useTasks`, `useMembers`, `useActiveWorkspace`.
- Produces: `boardColumns(tasks: Task[]): { status: Status; tasks: Task[] }[]`; `<BoardView />`; `<BoardColumn status tasks members />`; `<TaskCard task members />` (read-only this task; DnD added in Task 4).

- [ ] **Step 1: Write the failing test for `boardColumns`**

`src/features/boardView/boardColumns.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { boardColumns } from './boardColumns'
import type { Task } from '../../data/tasksRepo'

const t = (over: Partial<Task>): Task => ({
  id: 'x', project_id: 'p', workspace_id: 'w', ref: 'NIM-1', type: 'feature',
  title: 't', description: '', status: 'todo', priority: 'low', assignee_id: null,
  start_date: null, end_date: null, points: null, position: 0,
  created_by: null, created_at: '', updated_at: '', ...over,
})

describe('boardColumns', () => {
  it('returns all five statuses in order, even when empty', () => {
    expect(boardColumns([]).map((c) => c.status))
      .toEqual(['backlog', 'todo', 'in_progress', 'in_review', 'done'])
  })
  it('sorts a column by position ascending', () => {
    const cols = boardColumns([
      t({ id: 'a', status: 'todo', position: 2 }),
      t({ id: 'b', status: 'todo', position: 1 }),
    ])
    expect(cols.find((c) => c.status === 'todo')!.tasks.map((x) => x.id)).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm run test -- boardColumns`
Expected: FAIL — `./boardColumns` not found.

- [ ] **Step 3: Implement `src/features/boardView/boardColumns.ts`**

```ts
import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'

export function boardColumns(tasks: Task[]): { status: Status; tasks: Task[] }[] {
  return STATUSES.map((s) => ({
    status: s.id,
    tasks: tasks.filter((t) => t.status === s.id).sort((a, b) => a.position - b.position),
  }))
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npm run test -- boardColumns` → PASS.

- [ ] **Step 5: Implement `src/features/boardView/TaskCard.tsx` (read-only)**

```tsx
import { TASK_TYPES, PRIORITIES } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'

export function TaskCard({ task, members }: { task: Task; members: Member[] }) {
  const type = TASK_TYPES[task.type]
  const priority = PRIORITIES.find((p) => p.id === task.priority)
  const assignee = members.find((m) => m.user_id === task.assignee_id)
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[var(--text)]">
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span style={{ color: type.color }}>{type.label[0]}</span>
        <span>{task.ref}</span>
        {task.points != null && <span className="ml-auto">{task.points}</span>}
      </div>
      <p className="mt-1 text-sm">{task.title}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span style={{ color: priority?.color }}>{priority?.label}</span>
        <span className="ml-auto text-[var(--muted)]">{assignee?.name ?? '—'}</span>
      </div>
    </article>
  )
}
```

- [ ] **Step 6: Implement `src/features/boardView/BoardColumn.tsx`**

```tsx
import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'
import type { Member } from '../../data/membersRepo'
import { TaskCard } from './TaskCard'

export function BoardColumn({ status, tasks, members }: {
  status: Status; tasks: Task[]; members: Member[]
}) {
  const meta = STATUSES.find((s) => s.id === status)
  return (
    <section className="flex w-64 shrink-0 flex-col gap-2">
      <h3 className="px-1 text-sm font-medium" style={{ color: meta?.color }}>
        {meta?.label} <span className="text-[var(--muted)]">{tasks.length}</span>
      </h3>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => <TaskCard key={t.id} task={t} members={members} />)}
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Write the failing test for `BoardView`**

`src/features/boardView/BoardView.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useTasks, useMembers, useActiveWorkspace } = vi.hoisted(() => ({
  useTasks: vi.fn(), useMembers: vi.fn(),
  useActiveWorkspace: vi.fn(() => ({ activeId: 'w1', setActiveId: vi.fn(), loading: false })),
}))
vi.mock('../../lib/hooks/useTasks', () => ({ useTasks }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace }))

import { BoardView } from './BoardView'

beforeEach(() => { vi.clearAllMocks(); useMembers.mockReturnValue({ data: [] }) })

describe('BoardView', () => {
  it('renders all five columns and a card', () => {
    useTasks.mockReturnValue({ data: [{ id: 't1', ref: 'NIM-1', title: 'Hello', status: 'todo', priority: 'low', position: 0, type: 'feature', assignee_id: null, points: null }], isLoading: false, error: null })
    render(<BoardView />)
    for (const label of ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done'])
      expect(screen.getByRole('heading', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Run it — verify it fails**

Run: `npm run test -- BoardView`
Expected: FAIL — `./BoardView` not found.

- [ ] **Step 9: Implement `src/features/boardView/BoardView.tsx`**

```tsx
import { useTasks } from '../../lib/hooks/useTasks'
import { useMembers } from '../../lib/hooks/useMembers'
import { useActiveWorkspace } from '../../lib/workspace'
import { boardColumns } from './boardColumns'
import { BoardColumn } from './BoardColumn'

export function BoardView() {
  const { activeId, loading: wsLoading } = useActiveWorkspace()
  const { data: tasks, isLoading, error } = useTasks(activeId ?? '')
  const { data: members } = useMembers(activeId ?? '')

  if (wsLoading || isLoading) return <p className="text-[var(--muted)]">Loading…</p>
  if (error) return <p className="text-[var(--muted)]">Couldn't load tasks.</p>

  const columns = boardColumns(tasks ?? [])
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((c) => (
        <BoardColumn key={c.status} status={c.status} tasks={c.tasks} members={members ?? []} />
      ))}
    </div>
  )
}
```

- [ ] **Step 10: Render `BoardView` in the Shell for `view=board`**

In `src/app/Shell.tsx`, import `BoardView` and extend the view-region:
```tsx
import { BoardView } from '../features/boardView/BoardView'
// in <main data-testid="view-region" …>:
{view === 'list' ? <ListView /> : view === 'board' ? <BoardView /> : `${view} view — coming next.`}
```
(If `Shell.test.tsx` mocks `ListView`, add an analogous `vi.mock('../features/boardView/BoardView', () => ({ BoardView: () => null }))` so the Shell test stays provider-free.)

- [ ] **Step 11: Run tests + typecheck + build**

Run: `npm run test` → ALL pass. Run: `npx tsc -b` → clean. Run: `npm run build` → clean.

- [ ] **Step 12: Commit**

```bash
git add src/features/boardView src/app/Shell.tsx
git commit -m "feat(board): read-only Kanban columns mounted in the shell"
```

---

### Task 4: Drag-and-drop (cross-column + reorder)

**Files:**
- Create: `src/features/boardView/computeDropPosition.ts`, `src/features/boardView/computeDropPosition.test.ts`
- Modify: `src/features/boardView/TaskCard.tsx`, `src/features/boardView/BoardColumn.tsx`, `src/features/boardView/BoardView.tsx`, `src/features/boardView/BoardView.test.tsx`

**Interfaces:**
- Consumes: `useMoveTask` (Task 2), `boardColumns` (Task 3), `Task`.
- Produces: `computeDropPosition(columnTasks: Task[], insertIndex: number): number`; draggable cards + columns that, on drop, call `useMoveTask` with `{ taskId, toStatus, position, fromStatus }`.

- [ ] **Step 1: Write the failing test for `computeDropPosition`**

`src/features/boardView/computeDropPosition.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeDropPosition } from './computeDropPosition'
import type { Task } from '../../data/tasksRepo'

const at = (pos: number): Task => ({ position: pos } as Task)

describe('computeDropPosition', () => {
  it('returns 0 for an empty column', () => {
    expect(computeDropPosition([], 0)).toBe(0)
  })
  it('places above the first card', () => {
    expect(computeDropPosition([at(10), at(20)], 0)).toBe(9)
  })
  it('places below the last card', () => {
    expect(computeDropPosition([at(10), at(20)], 2)).toBe(21)
  })
  it('averages the neighbors when inserting between', () => {
    expect(computeDropPosition([at(10), at(20)], 1)).toBe(15)
  })
})
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npm run test -- computeDropPosition`
Expected: FAIL — `./computeDropPosition` not found.

- [ ] **Step 3: Implement `src/features/boardView/computeDropPosition.ts`**

```ts
import type { Task } from '../../data/tasksRepo'

// columnTasks: the target column's cards EXCLUDING the dragged task, sorted by position.
export function computeDropPosition(columnTasks: Task[], insertIndex: number): number {
  if (columnTasks.length === 0) return 0
  if (insertIndex <= 0) return columnTasks[0].position - 1
  if (insertIndex >= columnTasks.length) return columnTasks[columnTasks.length - 1].position + 1
  return (columnTasks[insertIndex - 1].position + columnTasks[insertIndex].position) / 2
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npm run test -- computeDropPosition` → PASS (4 tests).

- [ ] **Step 5: Make `TaskCard` draggable**

In `TaskCard.tsx`, add `draggable` + `onDragStart` (and accept the dragging callbacks via props):
```tsx
export function TaskCard({ task, members, onDragStart }: {
  task: Task; members: Member[]; onDragStart: (taskId: string) => void
}) {
  // add to the <article>:
  //   draggable
  //   onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); onDragStart(task.id) }}
  //   className="… cursor-grab active:cursor-grabbing"
}
```

- [ ] **Step 6: Make `BoardColumn` a drop target + track insert index**

In `BoardColumn.tsx`, add props `onCardDragStart`, `onDrop(status, insertIndex)`, and a local `hoverIndex` state; each card sits in a wrapper whose `onDragOver` sets the pending index from the cursor's vertical half, and the column's container handles `onDragOver`/`onDrop`:
```tsx
import { useState } from 'react'
// props: { status, tasks, members, onCardDragStart, onDrop }
const [hoverIndex, setHoverIndex] = useState<number | null>(null)
// container: onDragOver={(e) => e.preventDefault()}
//            onDrop={(e) => { e.preventDefault(); onDrop(status, hoverIndex ?? tasks.length); setHoverIndex(null) }}
// each card wrapper i: onDragOver={(e) => {
//   const r = e.currentTarget.getBoundingClientRect()
//   setHoverIndex(e.clientY < r.top + r.height / 2 ? i : i + 1)
// }}
// pass onDragStart={onCardDragStart} to each <TaskCard/>
```

- [ ] **Step 7: Own the drag/drop in `BoardView` and call `useMoveTask`**

In `BoardView.tsx`:
```tsx
import { useRef } from 'react'
import { useMoveTask } from '../../lib/hooks/useMoveTask'
import { computeDropPosition } from './computeDropPosition'
// inside BoardView, after columns:
const move = useMoveTask(activeId ?? '')
const dragId = useRef<string | null>(null)
const onCardDragStart = (taskId: string) => { dragId.current = taskId }
const onDrop = (toStatus: typeof columns[number]['status'], insertIndex: number) => {
  const taskId = dragId.current
  dragId.current = null
  if (!taskId) return
  const all = tasks ?? []
  const dragged = all.find((t) => t.id === taskId)
  if (!dragged) return
  const colTasks = all
    .filter((t) => t.status === toStatus && t.id !== taskId)
    .sort((a, b) => a.position - b.position)
  const position = computeDropPosition(colTasks, insertIndex)
  move.mutate({ taskId, toStatus, position, fromStatus: dragged.status })
}
// pass onCardDragStart + onDrop to each <BoardColumn/>
```

- [ ] **Step 8: Add a drop test to `BoardView.test.tsx`**

Add the `useMoveTask` mock and a drop test (synthetic `dataTransfer`):
```tsx
// in vi.hoisted add: moveMutate: vi.fn()
// vi.mock('../../lib/hooks/useMoveTask', () => ({ useMoveTask: () => ({ mutate: moveMutate }) }))
it('moves a card when dropped on another column', async () => {
  useTasks.mockReturnValue({ data: [{ id: 't1', ref: 'NIM-1', title: 'Hello', status: 'todo', priority: 'low', position: 0, type: 'feature', assignee_id: null, points: null }], isLoading: false, error: null })
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  render(<BoardView />)
  const card = screen.getByText('Hello').closest('article')!
  const doneCol = screen.getByRole('heading', { name: /Done/i }).closest('section')!
  const dt = new DataTransfer()
  await user.pointer({ keys: '[MouseLeft>]', target: card })  // start
  // jsdom DnD is limited; fire drag events directly:
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
  doneCol.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
  doneCol.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
  expect(moveMutate).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't1', toStatus: 'done', fromStatus: 'todo' }))
})
```
> jsdom doesn't fully implement native DnD; this fires the events directly to exercise the handlers. If `DragEvent`/`DataTransfer` are unavailable in jsdom, assert by calling the column's `onDrop` path through a thinner unit test of `BoardView`'s drop handler instead — the goal is to verify `move.mutate` is called with the right `{taskId, toStatus, fromStatus}`. The real drag UX is verified in the browser (Task 5).

- [ ] **Step 9: Run tests + typecheck + build**

Run: `npm run test` → ALL pass. Run: `npx tsc -b` → clean. Run: `npm run build` → clean.

- [ ] **Step 10: Commit**

```bash
git add src/features/boardView
git commit -m "feat(board): native drag-and-drop — cross-column moves + intra-column reorder"
```

---

### Task 5: States + impeccable visual pass

**Files:**
- Modify: `src/features/boardView/*` (styling only)

**Interfaces:** No new exports — behavior unchanged; makes the board faithful to the design.

- [ ] **Step 1: Invoke the impeccable skill** for the Board, with the constraint: faithful to the original `Project App.dc.html` Board look, Bloom/Slate via CSS variables, no new dependencies, accessibility preserved. Polish `BoardView`/`BoardColumn`/`TaskCard`: column headers + counts, card density/typography, priority chip + type mark + assignee + points + tags, **a clear drop indicator** at the hover position, drag (`cursor-grab`) + dragging (reduced opacity) states, horizontal scroll affordance, and the loading/error/empty states. Keep the `role="heading"` column titles and the card text the tests query.

- [ ] **Step 2: Keep behavior green while restyling**

Run: `npm run test` → ALL still pass (tests assert text/roles/handlers, not classes). Run: `npx tsc -b` → clean. Run: `npm run build` → clean.

- [ ] **Step 3: Manual smoke (recommended)**

With the Supabase stack up (CLAUDE.md — Podman) and `npm run dev`, sign in and confirm: five columns; drag a card to another column → it moves and persists (reload), and an activity row is written; drag to reorder within a column → order persists; a failed move toasts and reverts.

- [ ] **Step 4: Commit**

```bash
git add src/features/boardView
git commit -m "style(board): impeccable visual pass — cards, columns, drop indicator"
```

---

## Self-Review

**Spec coverage:**
- Columns per status (all 5, position-sorted, empty kept) → Task 3 (`boardColumns`). ✓
- Cross-column move (status change) + intra-column reorder (position) → Task 4 (DnD + `computeDropPosition`). ✓
- Activity logged only on status change; best-effort → Task 1 (`logMove`) + Task 2 (`useMoveTask` conditional). ✓
- Shared move used by Board + List → Task 2 (`useMoveTask` + List retrofit). ✓
- `updateTask` patch gains `position` → Task 1. ✓
- Optimistic + rollback/toast; invalidate tasks + activity → Task 2. ✓
- `computeDropPosition` excludes dragged card → Task 4 (Step 7 filters `t.id !== taskId`). ✓
- Card content + impeccable polish + drop indicator → Tasks 3, 5. ✓
- supabase-js confined to `data/` (activityRepo) → guarded by `architecture.test.ts`. ✓
- Realtime deferred → not in this plan, by design. ✓

**Placeholder scan:** No TBD/TODO. The DnD component steps (5–7 of Task 4) give the exact handler logic inline; the jsdom-DnD caveat in Task 4 Step 8 names a concrete fallback, not a vague "handle it."

**Type consistency:** `MoveArgs` (`{ taskId, toStatus, position, fromStatus }`) is identical across `useMoveTask`, the List retrofit (Task 2), and the Board drop (Task 4). `boardColumns`/`computeDropPosition` signatures match their consumers. `logMove`'s param object matches Task 1's definition and Task 2's call. Cache keys `['tasks', ws]`/`['activity', ws]` consistent.

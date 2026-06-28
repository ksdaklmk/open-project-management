# Task Drawer + Filter/Sort Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shared, deep-linkable task drawer (full detail panel: core fields + tags + subtasks + comments) and a shared filter/sort toolbar reused across the four task views.

**Architecture:** Two shared surfaces over the existing hook + `data/` layer. The drawer edits the single `tasks` row through the existing optimistic `useUpdateTask`; tags/subtasks/comments get small new repos + optimistic hooks. The toolbar is pure `filterTasks`/`sortTasks` driven by URL params, applied via a `useFilteredTasks` wrapper the task views swap in. No Supabase client outside `data/`.

**Tech Stack:** Vite + React + TS + Tailwind, TanStack Query, React Router (`useSearchParams`), `sonner`, Vitest + React Testing Library, Supabase (Postgres + RLS).

## Global Constraints

- **Type-check with `tsc -b`, never plain `tsc`** (root tsconfig uses project references + `files: []`). `npm run build` runs `tsc -b && vite build`.
- **`@supabase/supabase-js` / the `supabase` client live ONLY in `src/lib/supabase.ts` + `src/data/`.** Features/components call hooks; `src/architecture.test.ts` fails the suite on any violation.
- **Themes are CSS variables** (`bloom`/`slate`) via `var(--surface)`, `var(--text)`, etc. — never hard-code theme hexes into Tailwind utilities.
- **Status/priority/type/tag taxonomies are client constants** in `src/types/constants.ts` (`STATUSES`, `PRIORITIES`, `TASK_TYPES`, `TAG_COLORS`).
- **UK English** in all user-facing copy (organise, colour, behaviour, prioritise, cancelled). Custom date text = en-GB (DD/MM/YYYY); native `<input type="date">` localises itself. Code/CSS/DB identifiers (`color`) stay standard.
- **Guarded lookups** in any coloured/labelled component: `STATUSES.find(...)`, `COLOR[x] ?? 'var(--muted)'` — never `OBJ[x]` bare.
- **No new tables/migrations/RLS policy changes** — `subtasks`, `task_tags`, `comments` already exist, are member-scoped under RLS, and granted to `authenticated`.
- **DB access on Podman:** `supabase db reset`/`start` hang. Apply via `supabase migration up`; run SQL/pgTAP via `podman exec -i supabase_db_open-project-management psql -U postgres -d postgres`. (No migrations expected this plan.)
- Spec + this plan are committed on `main` first; then branch `task-drawer-toolbar` from `main` and do all task work there.

---

## File Structure

**Create**
- `src/data/subtasksRepo.ts` + `src/data/subtasksRepo.test.ts` — subtask CRUD.
- `src/data/commentsRepo.ts` + `src/data/commentsRepo.test.ts` — comment list (author join) + add (pinned author).
- `src/lib/hooks/useTaskTags.ts` + `.test.ts` — optimistic tag add/remove over `['tasks', ws]`.
- `src/lib/hooks/useSubtasks.ts` + `.test.ts` — query + add/toggle/delete.
- `src/lib/hooks/useComments.ts` + `.test.ts` — query + optimistic add.
- `src/lib/hooks/useFilteredTasks.ts` + `.test.ts` — `useTasks` + URL filters.
- `src/features/taskDrawer/TaskDrawer.tsx` + `.test.tsx` — overlay shell, open/close, deep-link, a11y, states.
- `src/features/taskDrawer/DrawerFields.tsx` — field grid (edit round-trip).
- `src/features/taskDrawer/TagEditor.tsx`, `SubtaskList.tsx`, `CommentThread.tsx` (+ tests where logic warrants).
- `src/features/toolbar/filterTasks.ts` + `.test.ts` — pure filter.
- `src/features/toolbar/sortTasks.ts` + `.test.ts` — pure sort.
- `src/features/toolbar/useTaskFilters.ts` + `.test.ts` — URL (de)serialisation.
- `src/features/toolbar/Toolbar.tsx` + `.test.tsx` — the bar.

**Modify**
- `src/data/tasksRepo.ts` — widen `updateTask` Pick; tags join on `listTasks`; `Task` type gains `tags`; `addTaskTag`/`removeTaskTag`.
- `src/data/tasksRepo.test.ts` — new select projection + tag fns.
- `src/features/listView/TaskRow.tsx` + `src/features/boardView/TaskCard.tsx` — drop the `as Task & { tags?: string[] }` casts.
- `src/features/listView/grouping.ts` + `grouping.test.ts` — bucket-only (stable), sorting moves to `sortTasks`.
- `src/features/listView/ListView.tsx` — `useFilteredTasks` + apply `sortTasks`.
- `src/features/boardView/BoardView.tsx`, `ganttView/GanttView.tsx`, `timelineView/TimelineView.tsx` — `useTasks` → `useFilteredTasks`; add task-click → `setTaskRef`.
- `src/features/listView/TaskTable.tsx` — make rows keyboard-openable (delegated; see Task 5).
- `src/app/Shell.tsx` — mount `<TaskDrawer />` (overlay) + `<Toolbar />` (task views only).
- `src/app/Shell.test.tsx` — mock the two new children.

---

## Task 1: tasksRepo — widen edits, tags join, tag mutations

**Files:**
- Modify: `src/data/tasksRepo.ts`
- Modify: `src/data/tasksRepo.test.ts`
- Modify: `src/features/listView/TaskRow.tsx:25`, `src/features/boardView/TaskCard.tsx:44`

**Interfaces:**
- Produces: `type Task = Database['public']['Tables']['tasks']['Row'] & { tags: string[] }`; `updateTask(id, patch)` now also accepts `description | type | points | start_date | end_date`; `addTaskTag(taskId: string, tag: string): Promise<void>`; `removeTaskTag(taskId: string, tag: string): Promise<void>`; `listTasks` returns tasks with `tags: string[]`.

- [ ] **Step 1: Write the failing tests** — replace `src/data/tasksRepo.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select: _select, update, updateEq, insert, del, delEq1, delEq2, from } =
  vi.hoisted(() => {
    const order = vi.fn()
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    const insert = vi.fn(() => Promise.resolve({ error: null }))
    const delEq2 = vi.fn(() => Promise.resolve({ error: null }))
    const delEq1 = vi.fn(() => ({ eq: delEq2 }))
    const del = vi.fn(() => ({ eq: delEq1 }))
    const from = vi.fn(() => ({ select, update, insert, delete: del }))
    return { order, eq, select, update, updateEq, insert, del, delEq1, delEq2, from }
  })

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listTasks, updateTask, addTaskTag, removeTaskTag } from './tasksRepo'

beforeEach(() => vi.clearAllMocks())

describe('tasksRepo', () => {
  it('lists tasks with embedded tags, ordered by position', async () => {
    order.mockResolvedValueOnce({
      data: [{ id: 't1', ref: 'NIM-101', task_tags: [{ tag: 'Backend' }, { tag: 'API' }] }],
      error: null,
    })
    const tasks = await listTasks('ws-1')
    expect(from).toHaveBeenCalledWith('tasks')
    expect(_select).toHaveBeenCalledWith('*, task_tags(tag)')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(order).toHaveBeenCalledWith('position', { ascending: true })
    expect(tasks[0].tags).toEqual(['Backend', 'API'])
    expect((tasks[0] as { task_tags?: unknown }).task_tags).toBeUndefined()
  })

  it('defaults tags to [] when none are embedded', async () => {
    order.mockResolvedValueOnce({ data: [{ id: 't2', ref: 'NIM-102' }], error: null })
    const tasks = await listTasks('ws-1')
    expect(tasks[0].tags).toEqual([])
  })

  it('throws on a Supabase error', async () => {
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listTasks('ws-1')).rejects.toThrow('boom')
  })

  it('updates a task with widened fields, scoped by id', async () => {
    await updateTask('t1', { description: 'd', type: 'bug', points: 3, start_date: '2026-07-01', end_date: '2026-07-09' })
    expect(update).toHaveBeenCalledWith({ description: 'd', type: 'bug', points: 3, start_date: '2026-07-01', end_date: '2026-07-09' })
    expect(updateEq).toHaveBeenCalledWith('id', 't1')
  })

  it('adds a tag', async () => {
    await addTaskTag('t1', 'Frontend')
    expect(from).toHaveBeenCalledWith('task_tags')
    expect(insert).toHaveBeenCalledWith({ task_id: 't1', tag: 'Frontend' })
  })

  it('removes a tag scoped by task_id + tag', async () => {
    await removeTaskTag('t1', 'Frontend')
    expect(del).toHaveBeenCalled()
    expect(delEq1).toHaveBeenCalledWith('task_id', 't1')
    expect(delEq2).toHaveBeenCalledWith('tag', 'Frontend')
  })
})
```

- [ ] **Step 2: Run, verify failure** — `npm run test -- tasksRepo` → FAIL (`addTaskTag` not exported; select projection mismatch).

- [ ] **Step 3: Implement** — replace `src/data/tasksRepo.ts` with:

```ts
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type Task = Database['public']['Tables']['tasks']['Row'] & { tags: string[] }

export async function listTasks(workspaceId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_tags(tag)')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const { task_tags, ...row } = r as typeof r & { task_tags?: { tag: string }[] }
    return { ...row, tags: (task_tags ?? []).map((t) => t.tag) } as Task
  })
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<
      Task,
      'status' | 'priority' | 'assignee_id' | 'title' | 'position' |
      'description' | 'type' | 'points' | 'start_date' | 'end_date'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function addTaskTag(taskId: string, tag: string): Promise<void> {
  const { error } = await supabase.from('task_tags').insert({ task_id: taskId, tag })
  if (error) throw new Error(error.message)
}

export async function removeTaskTag(taskId: string, tag: string): Promise<void> {
  const { error } = await supabase.from('task_tags').delete().eq('task_id', taskId).eq('tag', tag)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Drop the now-redundant casts.**
  - `src/features/listView/TaskRow.tsx:25` — change `const tags = (task as Task & { tags?: string[] }).tags` to `const tags = task.tags`.
  - `src/features/boardView/TaskCard.tsx:44` — change `const tags = (task as Task & { tags?: string[] }).tags ?? []` to `const tags = task.tags`.

- [ ] **Step 5: Run tests + type-check** — `npm run test -- tasksRepo` → PASS; `npm run build` → exit 0. (Existing List/Board view tests using `t()` fixtures may now need `tags: []` on fixture tasks — if any fail with a missing `tags`, add `tags: []` to that file's task factory. Fix only what fails.)

- [ ] **Step 6: Commit**

```bash
git add src/data/tasksRepo.ts src/data/tasksRepo.test.ts src/features/listView/TaskRow.tsx src/features/boardView/TaskCard.tsx
git commit -m "feat(data): widen updateTask, embed task_tags, tag mutations"
```

---

## Task 2: useTaskTags — optimistic tag add/remove

**Files:**
- Create: `src/lib/hooks/useTaskTags.ts`, `src/lib/hooks/useTaskTags.test.ts`

**Interfaces:**
- Consumes: `addTaskTag`, `removeTaskTag`, `Task` from `tasksRepo`.
- Produces: `useTaskTags(workspaceId) → { add, remove }`; both are mutations called as `add.mutate({ id, tag })`. Optimistic over `['tasks', workspaceId]` (mutates `task.tags`).

- [ ] **Step 1: Write the failing test** — `src/lib/hooks/useTaskTags.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { addTaskTag, removeTaskTag } = vi.hoisted(() => ({
  addTaskTag: vi.fn(), removeTaskTag: vi.fn(),
}))
vi.mock('../../data/tasksRepo', () => ({ addTaskTag, removeTaskTag }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useTaskTags } from './useTaskTags'

const ws = 'w1'
const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useTaskTags', () => {
  it('optimistically appends a tag', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', tags: ['API'] }])
    addTaskTag.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useTaskTags(ws), { wrapper: wrap(qc) })
    result.current.add.mutate({ id: 't1', tag: 'Backend' })
    await waitFor(() =>
      expect((qc.getQueryData(['tasks', ws]) as any)[0].tags).toEqual(['API', 'Backend']))
  })

  it('optimistically removes a tag and rolls back on error', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['tasks', ws], [{ id: 't1', tags: ['API', 'Backend'] }])
    removeTaskTag.mockRejectedValueOnce(new Error('no'))
    const { result } = renderHook(() => useTaskTags(ws), { wrapper: wrap(qc) })
    result.current.remove.mutate({ id: 't1', tag: 'API' })
    await waitFor(() =>
      expect((qc.getQueryData(['tasks', ws]) as any)[0].tags).toEqual(['API', 'Backend']))
  })
})
```

- [ ] **Step 2: Run, verify failure** — `npm run test -- useTaskTags` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/hooks/useTaskTags.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { addTaskTag, removeTaskTag, type Task } from '../../data/tasksRepo'

export function useTaskTags(workspaceId: string) {
  const qc = useQueryClient()
  const key = ['tasks', workspaceId]

  const patch = (id: string, fn: (tags: string[]) => string[]) => {
    const prev = qc.getQueryData<Task[]>(key)
    qc.setQueryData<Task[]>(key, (old) =>
      (old ?? []).map((t) => (t.id === id ? { ...t, tags: fn(t.tags) } : t)))
    return prev
  }

  const add = useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) => addTaskTag(id, tag),
    onMutate: async ({ id, tag }) => {
      await qc.cancelQueries({ queryKey: key })
      return { prev: patch(id, (tags) => (tags.includes(tag) ? tags : [...tags, tag])) }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Couldn't add tag: ${(e as Error).message}`)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const remove = useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) => removeTaskTag(id, tag),
    onMutate: async ({ id, tag }) => {
      await qc.cancelQueries({ queryKey: key })
      return { prev: patch(id, (tags) => tags.filter((t) => t !== tag)) }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Couldn't remove tag: ${(e as Error).message}`)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  return { add, remove }
}
```

- [ ] **Step 4: Run + type-check** — `npm run test -- useTaskTags` → PASS; `npm run build` → exit 0.
- [ ] **Step 5: Commit**

```bash
git add src/lib/hooks/useTaskTags.ts src/lib/hooks/useTaskTags.test.ts
git commit -m "feat(hooks): useTaskTags optimistic add/remove"
```

---

## Task 3: subtasksRepo + useSubtasks

**Files:**
- Create: `src/data/subtasksRepo.ts`, `src/data/subtasksRepo.test.ts`
- Create: `src/lib/hooks/useSubtasks.ts`, `src/lib/hooks/useSubtasks.test.ts`

**Interfaces:**
- Produces: `type Subtask = …['subtasks']['Row']` (`{ id, task_id, title, done, position }`); `listSubtasks(taskId)`, `addSubtask(taskId, title, position)`, `toggleSubtask(id, done)`, `deleteSubtask(id)`; `useSubtasks(taskId) → { data, isLoading, error, add, toggle, remove }` where `add.mutate(title)`, `toggle.mutate({ id, done })`, `remove.mutate(id)`. Query key `['subtasks', taskId]`.

- [ ] **Step 1: Write the failing repo test** — `src/data/subtasksRepo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select, insert, update, updateEq, del, delEq, from } = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const insert = vi.fn(() => Promise.resolve({ error: null }))
  const updateEq = vi.fn(() => Promise.resolve({ error: null }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const delEq = vi.fn(() => Promise.resolve({ error: null }))
  const del = vi.fn(() => ({ eq: delEq }))
  const from = vi.fn(() => ({ select, insert, update, delete: del }))
  return { order, eq, select, insert, update, updateEq, del, delEq, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listSubtasks, addSubtask, toggleSubtask, deleteSubtask } from './subtasksRepo'

beforeEach(() => vi.clearAllMocks())

describe('subtasksRepo', () => {
  it('lists subtasks for a task ordered by position', async () => {
    order.mockResolvedValueOnce({ data: [{ id: 's1' }], error: null })
    const rows = await listSubtasks('t1')
    expect(from).toHaveBeenCalledWith('subtasks')
    expect(eq).toHaveBeenCalledWith('task_id', 't1')
    expect(order).toHaveBeenCalledWith('position', { ascending: true })
    expect(rows).toEqual([{ id: 's1' }])
  })
  it('adds a subtask with title + position', async () => {
    await addSubtask('t1', 'Write tests', 2)
    expect(insert).toHaveBeenCalledWith({ task_id: 't1', title: 'Write tests', position: 2 })
  })
  it('toggles done scoped by id', async () => {
    await toggleSubtask('s1', true)
    expect(update).toHaveBeenCalledWith({ done: true })
    expect(updateEq).toHaveBeenCalledWith('id', 's1')
  })
  it('deletes scoped by id', async () => {
    await deleteSubtask('s1')
    expect(delEq).toHaveBeenCalledWith('id', 's1')
  })
  it('throws on error', async () => {
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listSubtasks('t1')).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 2: Run, verify failure** — `npm run test -- subtasksRepo` → FAIL.
- [ ] **Step 3: Implement repo** — `src/data/subtasksRepo.ts`:

```ts
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'

export type Subtask = Database['public']['Tables']['subtasks']['Row']

export async function listSubtasks(taskId: string): Promise<Subtask[]> {
  const { data, error } = await supabase
    .from('subtasks').select('*').eq('task_id', taskId).order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}
export async function addSubtask(taskId: string, title: string, position: number): Promise<void> {
  const { error } = await supabase.from('subtasks').insert({ task_id: taskId, title, position })
  if (error) throw new Error(error.message)
}
export async function toggleSubtask(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('subtasks').update({ done }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteSubtask(id: string): Promise<void> {
  const { error } = await supabase.from('subtasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Run + commit repo**

```bash
npm run test -- subtasksRepo   # PASS
git add src/data/subtasksRepo.ts src/data/subtasksRepo.test.ts
git commit -m "feat(data): subtasksRepo CRUD"
```

- [ ] **Step 5: Write the failing hook test** — `src/lib/hooks/useSubtasks.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { listSubtasks, addSubtask, toggleSubtask, deleteSubtask } = vi.hoisted(() => ({
  listSubtasks: vi.fn(), addSubtask: vi.fn(), toggleSubtask: vi.fn(), deleteSubtask: vi.fn(),
}))
vi.mock('../../data/subtasksRepo', () => ({ listSubtasks, addSubtask, toggleSubtask, deleteSubtask }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useSubtasks } from './useSubtasks'

const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useSubtasks', () => {
  it('adds with position computed from the cached count', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['subtasks', 't1'], [{ id: 's1' }, { id: 's2' }])
    addSubtask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useSubtasks('t1'), { wrapper: wrap(qc) })
    result.current.add.mutate('New one')
    await waitFor(() => expect(addSubtask).toHaveBeenCalledWith('t1', 'New one', 2))
  })

  it('optimistically toggles done', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['subtasks', 't1'], [{ id: 's1', done: false }])
    toggleSubtask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useSubtasks('t1'), { wrapper: wrap(qc) })
    result.current.toggle.mutate({ id: 's1', done: true })
    await waitFor(() => expect((qc.getQueryData(['subtasks', 't1']) as any)[0].done).toBe(true))
  })
})
```

- [ ] **Step 6: Run, verify failure** — `npm run test -- useSubtasks` → FAIL.
- [ ] **Step 7: Implement hook** — `src/lib/hooks/useSubtasks.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listSubtasks, addSubtask, toggleSubtask, deleteSubtask, type Subtask } from '../../data/subtasksRepo'

export function useSubtasks(taskId: string) {
  const qc = useQueryClient()
  const key = ['subtasks', taskId]
  const query = useQuery({ queryKey: key, queryFn: () => listSubtasks(taskId), enabled: !!taskId })

  const add = useMutation({
    mutationFn: (title: string) => addSubtask(taskId, title, qc.getQueryData<Subtask[]>(key)?.length ?? 0),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const optimistic = <V,>(apply: (rows: Subtask[], v: V) => Subtask[]) => ({
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Subtask[]>(key)
      qc.setQueryData<Subtask[]>(key, (old) => apply(old ?? [], v))
      return { prev }
    },
    onError: (e: unknown, _v: V, ctx: { prev?: Subtask[] } | undefined) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Couldn't update subtask: ${(e as Error).message}`)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => toggleSubtask(id, done),
    ...optimistic<{ id: string; done: boolean }>((rows, { id, done }) =>
      rows.map((s) => (s.id === id ? { ...s, done } : s))),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteSubtask(id),
    ...optimistic<string>((rows, id) => rows.filter((s) => s.id !== id)),
  })

  return { ...query, add, toggle, remove }
}
```

- [ ] **Step 8: Run + type-check + commit**

```bash
npm run test -- useSubtasks   # PASS
npm run build                 # exit 0
git add src/lib/hooks/useSubtasks.ts src/lib/hooks/useSubtasks.test.ts
git commit -m "feat(hooks): useSubtasks query + optimistic toggle/remove"
```

---

## Task 4: commentsRepo + useComments/useAddComment

**Files:**
- Create: `src/data/commentsRepo.ts`, `src/data/commentsRepo.test.ts`
- Create: `src/lib/hooks/useComments.ts`, `src/lib/hooks/useComments.test.ts`

**Interfaces:**
- Produces: `interface CommentItem { id: string; body: string; created_at: string; author: { name: string } | null }`; `listComments(taskId)`, `addComment(taskId, body, authorId)`; `useComments(taskId) → query`; `useAddComment(taskId) → mutation` called `mutate(body)`, pins `author_id = session.user.id`, optimistic append on `['comments', taskId]`.

- [ ] **Step 1: Write the failing repo test** — `src/data/commentsRepo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { limit, order, eq, select, insert, from } = vi.hoisted(() => {
  const limit = vi.fn()
  const order = vi.fn(() => ({ limit }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const insert = vi.fn(() => Promise.resolve({ error: null }))
  const from = vi.fn(() => ({ select, insert }))
  return { limit, order, eq, select, insert, from }
})
vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listComments, addComment } from './commentsRepo'

beforeEach(() => vi.clearAllMocks())

describe('commentsRepo', () => {
  it('lists comments ascending with the author name embedded', async () => {
    limit.mockResolvedValueOnce({
      data: [{ id: 'c1', body: 'hi', created_at: '2026-06-28T00:00:00Z', author: { name: 'Dana Lee' } }],
      error: null,
    })
    const rows = await listComments('t1')
    expect(from).toHaveBeenCalledWith('comments')
    expect(select).toHaveBeenCalledWith('id, body, created_at, author:profiles!author_id(name)')
    expect(eq).toHaveBeenCalledWith('task_id', 't1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true })
    expect(rows[0]).toEqual({ id: 'c1', body: 'hi', created_at: '2026-06-28T00:00:00Z', author: { name: 'Dana Lee' } })
  })
  it('coalesces a missing author to null', async () => {
    limit.mockResolvedValueOnce({ data: [{ id: 'c2', body: 'x', created_at: 'z', author: null }], error: null })
    const rows = await listComments('t1')
    expect(rows[0].author).toBeNull()
  })
  it('adds a comment with a pinned author_id', async () => {
    await addComment('t1', 'nice', 'user-9')
    expect(insert).toHaveBeenCalledWith({ task_id: 't1', body: 'nice', author_id: 'user-9' })
  })
})
```

- [ ] **Step 2: Run, verify failure** — `npm run test -- commentsRepo` → FAIL.
- [ ] **Step 3: Implement repo** — `src/data/commentsRepo.ts`:

```ts
import { supabase } from '../lib/supabase'

export interface CommentItem {
  id: string
  body: string
  created_at: string
  author: { name: string } | null
}

export async function listComments(taskId: string): Promise<CommentItem[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, created_at, author:profiles!author_id(name)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const row = r as unknown as CommentItem
    return { id: row.id, body: row.body, created_at: row.created_at, author: row.author ?? null }
  })
}

export async function addComment(taskId: string, body: string, authorId: string): Promise<void> {
  const { error } = await supabase.from('comments').insert({ task_id: taskId, body, author_id: authorId })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: Run + commit repo**

```bash
npm run test -- commentsRepo   # PASS
git add src/data/commentsRepo.ts src/data/commentsRepo.test.ts
git commit -m "feat(data): commentsRepo list (author join) + add (pinned author)"
```

- [ ] **Step 5: Write the failing hook test** — `src/lib/hooks/useComments.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { listComments, addComment } = vi.hoisted(() => ({ listComments: vi.fn(), addComment: vi.fn() }))
vi.mock('../../data/commentsRepo', () => ({ listComments, addComment }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('./useSession', () => ({ useSession: () => ({ session: { user: { id: 'me' } }, loading: false }) }))

import { useAddComment } from './useComments'

const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useAddComment', () => {
  it('optimistically appends then calls the repo with the session uid', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['comments', 't1'], [{ id: 'c1', body: 'old', created_at: 'a', author: null }])
    addComment.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useAddComment('t1'), { wrapper: wrap(qc) })
    result.current.mutate('hello')
    await waitFor(() => {
      const rows = qc.getQueryData(['comments', 't1']) as any[]
      expect(rows[rows.length - 1].body).toBe('hello')
    })
    expect(addComment).toHaveBeenCalledWith('t1', 'hello', 'me')
  })
})
```

- [ ] **Step 6: Run, verify failure** — `npm run test -- useComments` → FAIL.
- [ ] **Step 7: Implement hook** — `src/lib/hooks/useComments.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listComments, addComment, type CommentItem } from '../../data/commentsRepo'
import { useSession } from './useSession'

export function useComments(taskId: string) {
  return useQuery({ queryKey: ['comments', taskId], queryFn: () => listComments(taskId), enabled: !!taskId })
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient()
  const { session } = useSession()
  const key = ['comments', taskId]
  return useMutation({
    mutationFn: (body: string) => addComment(taskId, body, session?.user.id ?? ''),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<CommentItem[]>(key)
      const optimistic: CommentItem = {
        id: `tmp-${Date.now()}`, body, created_at: new Date().toISOString(), author: null,
      }
      qc.setQueryData<CommentItem[]>(key, (old) => [...(old ?? []), optimistic])
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error(`Couldn't post comment: ${(e as Error).message}`)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
```

- [ ] **Step 8: Run + type-check + commit**

```bash
npm run test -- useComments   # PASS
npm run build                 # exit 0
git add src/lib/hooks/useComments.ts src/lib/hooks/useComments.test.ts
git commit -m "feat(hooks): useComments + optimistic useAddComment"
```

---

## Task 5: Drawer shell — overlay, open/close, deep-link, a11y, states

**Files:**
- Create: `src/features/taskDrawer/TaskDrawer.tsx`, `src/features/taskDrawer/TaskDrawer.test.tsx`
- Modify: `src/app/Shell.tsx`, `src/app/Shell.test.tsx`
- Modify: `src/features/boardView/TaskCard.tsx`, `src/features/boardView/BoardColumn.tsx` (thread `onOpen`), `src/features/ganttView/GanttView.tsx`, `src/features/timelineView/TimelineView.tsx` (task-click → `setTaskRef`)

**Interfaces:**
- Consumes: `useViewState()` (`taskRef`, `setTaskRef`), `useActiveWorkspace()` (`activeId`), `useTasks(activeId)` (`.data: Task[]`).
- Produces: `<TaskDrawer />` (no props; reads its own state). Found-task resolution: `tasks.find((t) => t.ref === taskRef)` against the **unfiltered** `useTasks`. Renders `role="dialog"` when a `taskRef` is set; a "Task not found" panel when the ref isn't in the list; nothing when `taskRef` is null. Later tasks render their fields **inside** the drawer body marked `data-testid="drawer-body"`.

- [ ] **Step 1: Write the failing test** — `src/features/taskDrawer/TaskDrawer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const setTaskRef = vi.fn()
const state = { taskRef: 'NIM-101' as string | null }
vi.mock('../../app/useViewState', () => ({ useViewState: () => ({ ...state, setTaskRef }) }))
vi.mock('../../lib/workspace', () => ({ useActiveWorkspace: () => ({ activeId: 'w1', loading: false }) }))
vi.mock('../../lib/hooks/useTasks', () => ({
  useTasks: () => ({
    data: [{ id: 't1', ref: 'NIM-101', title: 'Build login', type: 'feature', status: 'todo',
      priority: 'high', assignee_id: null, points: null, description: '', start_date: null,
      end_date: null, position: 0, tags: [] }],
    isLoading: false, error: null,
  }),
}))

import { TaskDrawer } from './TaskDrawer'

beforeEach(() => { state.taskRef = 'NIM-101'; setTaskRef.mockClear() })

describe('TaskDrawer', () => {
  it('renders a dialog with the task ref + title when ?task matches', () => {
    render(<TaskDrawer />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('NIM-101')
    expect(dialog).toHaveTextContent('Build login')
  })

  it('closes on Escape', () => {
    render(<TaskDrawer />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(setTaskRef).toHaveBeenCalledWith(null)
  })

  it('closes when the backdrop is clicked', () => {
    render(<TaskDrawer />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(setTaskRef).toHaveBeenCalledWith(null)
  })

  it('shows a not-found panel for an unknown ref', () => {
    state.taskRef = 'NIM-999'
    render(<TaskDrawer />)
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it('renders nothing when no task is selected', () => {
    state.taskRef = null
    const { container } = render(<TaskDrawer />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run, verify failure** — `npm run test -- TaskDrawer` → FAIL (module missing).
- [ ] **Step 3: Implement** — `src/features/taskDrawer/TaskDrawer.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { useViewState } from '../../app/useViewState'
import { useActiveWorkspace } from '../../lib/workspace'
import { useTasks } from '../../lib/hooks/useTasks'

export function TaskDrawer() {
  const { taskRef, setTaskRef } = useViewState()
  const { activeId } = useActiveWorkspace()
  const { data: tasks } = useTasks(activeId ?? '')
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const close = () => setTaskRef(null)
  const task = taskRef ? tasks?.find((t) => t.ref === taskRef) : undefined

  // Focus the panel on open; restore focus to the opener on close.
  // ponytail: minimal focus management — querySelectorAll boundaries; reach for a
  // focus-trap lib only if the panel ever grows nested dialogs.
  useEffect(() => {
    if (!taskRef) return
    openerRef.current = document.activeElement as HTMLElement
    dialogRef.current?.focus()
    return () => openerRef.current?.focus?.()
  }, [taskRef])

  if (!taskRef) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return close()
    if (e.key !== 'Tab') return
    const f = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    )
    if (!f || f.length === 0) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        data-testid="drawer-backdrop"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/30"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative h-full w-[420px] max-w-full overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] text-[var(--text)] shadow-xl"
      >
        {task ? (
          <>
            <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <span className="text-xs font-medium tabular-nums text-[var(--muted)]">{task.ref}</span>
              <h2 id="drawer-title" className="flex-1 truncate font-medium">{task.title}</h2>
              <button onClick={close} aria-label="Close" className="rounded px-2 py-1 hover:bg-[var(--surface)]">✕</button>
            </header>
            <div data-testid="drawer-body" className="space-y-5 px-4 py-4" />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p id="drawer-title" className="font-semibold">Task not found</p>
            <p className="text-sm text-[var(--muted)]">It may have moved workspace or been removed.</p>
            <button onClick={close} className="mt-2 rounded border border-[var(--border)] px-3 py-1">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run, verify pass** — `npm run test -- TaskDrawer` → PASS (5/5).

- [ ] **Step 5: Mount in Shell.** In `src/app/Shell.tsx`: add `import { TaskDrawer } from '../features/taskDrawer/TaskDrawer'`, and render `<TaskDrawer />` as the last child of the outer `<div className="min-h-full grid …">` (sibling after `</section>`). In `src/app/Shell.test.tsx`, add alongside the existing child mocks: `vi.mock('../features/taskDrawer/TaskDrawer', () => ({ TaskDrawer: () => null }))`.

- [ ] **Step 6: Wire task-click → open in the other views.**
  - **Board** — `TaskCard.tsx`: add `onOpen: (ref: string) => void` to the props type, and `onClick={() => onOpen(task.ref)}` on the `<article>` (drag still works — click fires only without a drag). Thread `onOpen` through `BoardColumn.tsx` (add to its props + pass to each `<TaskCard>`), and in `BoardView.tsx` get `const { setTaskRef } = useViewState()` (add the import) and pass `onOpen={setTaskRef}` to each `<BoardColumn>`.
  - **Gantt** — `GanttView.tsx`: add `import { useViewState } from '../../app/useViewState'`; in `GanttView`, `const { setTaskRef } = useViewState()`, pass `setTaskRef` into `<GanttChart>` (add to its props), and add `onClick={() => setTaskRef(t.ref)}` + `className="… cursor-pointer"` to the bar row `<div className="opm-row grid …">`. Also add `onClick={() => setTaskRef(t.ref)}` to each Unscheduled `<li>`.
  - **Timeline** — `TimelineView.tsx`: add the `useViewState` import + `const { setTaskRef } = useViewState()`; add `onClick={() => setTaskRef(t.ref)}` + `cursor-pointer` to each task `<li>`.
  - **List** — already calls `onSelect(task.ref)`. In `TaskTable.tsx`, add `tabIndex={0}` and `onKeyDown={(e) => e.key === 'Enter' && onSelect(task.ref)}` to the row (delegated to `TaskRow` — add the two props to `TaskRow`'s `<tr>`). This activates the dead `.opm-row:focus-visible` CSS.
  - *(No new unit test for the wiring — clicking→URL is a one-liner per view; browser smoke in Task 9 verifies click-to-open in each. Existing view tests must still pass.)*

- [ ] **Step 7: Run the full suite + type-check** — `npm run test` (all green), `npm run build` → exit 0.
- [ ] **Step 8: Commit**

```bash
git add src/features/taskDrawer src/app/Shell.tsx src/app/Shell.test.tsx \
  src/features/boardView/TaskCard.tsx src/features/boardView/BoardColumn.tsx \
  src/features/boardView/BoardView.tsx src/features/ganttView/GanttView.tsx \
  src/features/timelineView/TimelineView.tsx src/features/listView/TaskTable.tsx \
  src/features/listView/TaskRow.tsx
git commit -m "feat(drawer): overlay shell, deep-link, a11y; wire task-click across views"
```

---

## Task 6: Drawer fields — edit round-trip

**Files:**
- Create: `src/features/taskDrawer/DrawerFields.tsx`
- Modify: `src/features/taskDrawer/TaskDrawer.tsx` (render `<DrawerFields>` in the body), `TaskDrawer.test.tsx` (add an edit test)

**Interfaces:**
- Consumes: `Task` from `tasksRepo`; `useUpdateTask(ws)` (`.mutate({ id, patch })`); `useMembers(ws)`; `StatusCell`/`PriorityCell`/`AssigneeCell` from `listView/cells`.
- Produces: `<DrawerFields task={task} workspaceId={ws} />` rendering status/priority/assignee/type/points/start/end/title/description, each saving through `useUpdateTask`.

- [ ] **Step 1: Add the failing edit test** to `TaskDrawer.test.tsx` (extend the existing mocks):

```tsx
// add near the other mocks:
const mutate = vi.fn()
vi.mock('../../lib/hooks/useUpdateTask', () => ({ useUpdateTask: () => ({ mutate }) }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers: () => ({ data: [] }) }))

// add inside describe('TaskDrawer', …):
it('saves a status edit through useUpdateTask', () => {
  render(<TaskDrawer />)
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'done' } })
  expect(mutate).toHaveBeenCalledWith({ id: 't1', patch: { status: 'done' } })
})
it('saves the title on blur', () => {
  render(<TaskDrawer />)
  const title = screen.getByLabelText('Title')
  fireEvent.change(title, { target: { value: 'Build SSO' } })
  fireEvent.blur(title)
  expect(mutate).toHaveBeenCalledWith({ id: 't1', patch: { title: 'Build SSO' } })
})
```

- [ ] **Step 2: Run, verify failure** — `npm run test -- TaskDrawer` → FAIL (no Status control yet).
- [ ] **Step 3: Implement** — `src/features/taskDrawer/DrawerFields.tsx`:

```tsx
import { useState } from 'react'
import { TASK_TYPES } from '../../types/constants'
import { StatusCell, PriorityCell, AssigneeCell } from '../listView/cells'
import { useUpdateTask } from '../../lib/hooks/useUpdateTask'
import { useMembers } from '../../lib/hooks/useMembers'
import type { Task } from '../../data/tasksRepo'

export function DrawerFields({ task, workspaceId }: { task: Task; workspaceId: string }) {
  const update = useUpdateTask(workspaceId)
  const { data: members } = useMembers(workspaceId)
  const save = (patch: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch })

  const [title, setTitle] = useState(task.title)
  const [desc, setDesc] = useState(task.description)

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Title</span>
        <input
          aria-label="Title" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== task.title && save({ title })}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status"><StatusCell task={task} onChange={save} /></Field>
        <Field label="Priority"><PriorityCell task={task} onChange={save} /></Field>
        <Field label="Assignee"><AssigneeCell task={task} members={members ?? []} onChange={save} /></Field>
        <Field label="Type">
          <select
            aria-label="Type" value={task.type}
            onChange={(e) => save({ type: e.target.value as Task['type'] })}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
          >
            {Object.entries(TASK_TYPES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Points">
          <input
            aria-label="Points" type="number" min={0} defaultValue={task.points ?? ''}
            onBlur={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              if (v !== task.points) save({ points: v })
            }}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
          />
        </Field>
        <Field label="Start">
          <input
            aria-label="Start date" type="date" defaultValue={task.start_date ?? ''}
            onChange={(e) => save({ start_date: e.target.value || null })}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
          />
        </Field>
        <Field label="Due">
          <input
            aria-label="Due date" type="date" defaultValue={task.end_date ?? ''}
            onChange={(e) => save({ end_date: e.target.value || null })}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
          />
        </Field>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Description</span>
        <textarea
          aria-label="Description" rows={4} value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== task.description && save({ description: desc })}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
        />
      </label>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--muted)]">{label}</span>
      {children}
    </label>
  )
}
```

- [ ] **Step 4: Render it** — in `TaskDrawer.tsx`, add `import { DrawerFields } from './DrawerFields'`, and inside the `data-testid="drawer-body"` div render `<DrawerFields task={task} workspaceId={activeId ?? ''} />`.

- [ ] **Step 5: Run + type-check** — `npm run test -- TaskDrawer` → PASS; `npm run build` → exit 0.
- [ ] **Step 6: Commit**

```bash
git add src/features/taskDrawer/DrawerFields.tsx src/features/taskDrawer/TaskDrawer.tsx src/features/taskDrawer/TaskDrawer.test.tsx
git commit -m "feat(drawer): editable fields round-tripping through useUpdateTask"
```

---

## Task 7: Drawer tags + subtasks + comments

**Files:**
- Create: `src/features/taskDrawer/TagEditor.tsx`, `src/features/taskDrawer/SubtaskList.tsx`, `src/features/taskDrawer/CommentThread.tsx`
- Create: `src/features/taskDrawer/SubtaskList.test.tsx`, `src/features/taskDrawer/CommentThread.test.tsx`
- Modify: `src/features/taskDrawer/TaskDrawer.tsx` (render the three in the body)

**Interfaces:**
- Consumes: `useTaskTags(ws)`, `useSubtasks(taskId)`, `useComments(taskId)`/`useAddComment(taskId)`, `TAG_COLORS`, `relativeTime` from `src/lib/relativeTime`.
- Produces: `<TagEditor task workspaceId />`, `<SubtaskList taskId />`, `<CommentThread taskId />`.

- [ ] **Step 1: SubtaskList failing test** — `src/features/taskDrawer/SubtaskList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const toggle = vi.fn()
vi.mock('../../lib/hooks/useSubtasks', () => ({
  useSubtasks: () => ({
    data: [{ id: 's1', title: 'Spec it', done: true }, { id: 's2', title: 'Build it', done: false }],
    isLoading: false, error: null,
    add: { mutate: vi.fn() }, toggle: { mutate: toggle }, remove: { mutate: vi.fn() },
  }),
}))
import { SubtaskList } from './SubtaskList'

describe('SubtaskList', () => {
  it('shows progress and toggles a subtask', () => {
    render(<SubtaskList taskId="t1" />)
    expect(screen.getByText('1/2')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Build it'))
    expect(toggle).toHaveBeenCalledWith({ id: 's2', done: true })
  })
})
```

- [ ] **Step 2: Run, verify failure** — `npm run test -- SubtaskList` → FAIL.
- [ ] **Step 3: Implement SubtaskList** — `src/features/taskDrawer/SubtaskList.tsx`:

```tsx
import { useState } from 'react'
import { useSubtasks } from '../../lib/hooks/useSubtasks'

export function SubtaskList({ taskId }: { taskId: string }) {
  const { data, add, toggle, remove } = useSubtasks(taskId)
  const rows = data ?? []
  const done = rows.filter((s) => s.done).length
  const [draft, setDraft] = useState('')

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    add.mutate(t)
    setDraft('')
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
        Subtasks {rows.length > 0 && <span className="tabular-nums">{done}/{rows.length}</span>}
      </h3>
      <ul className="space-y-1">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <input
              type="checkbox" aria-label={s.title} checked={s.done}
              onChange={() => toggle.mutate({ id: s.id, done: !s.done })}
            />
            <span className={`flex-1 text-sm ${s.done ? 'line-through text-[var(--muted)]' : ''}`}>{s.title}</span>
            <button aria-label={`Remove ${s.title}`} onClick={() => remove.mutate(s.id)} className="text-[var(--muted)]">✕</button>
          </li>
        ))}
      </ul>
      <input
        aria-label="New subtask" placeholder="Add a subtask…" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
      />
    </section>
  )
}
```

- [ ] **Step 4: CommentThread failing test** — `src/features/taskDrawer/CommentThread.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const post = vi.fn()
vi.mock('../../lib/hooks/useComments', () => ({
  useComments: () => ({
    data: [{ id: 'c1', body: 'First!', created_at: new Date().toISOString(), author: { name: 'Dana Lee' } }],
    isLoading: false, error: null,
  }),
  useAddComment: () => ({ mutate: post }),
}))
import { CommentThread } from './CommentThread'

describe('CommentThread', () => {
  it('lists comments and posts a new one', () => {
    render(<CommentThread taskId="t1" />)
    expect(screen.getByText('First!')).toBeInTheDocument()
    expect(screen.getByText('Dana Lee')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Add a comment'), { target: { value: 'Nice work' } })
    fireEvent.click(screen.getByRole('button', { name: /post/i }))
    expect(post).toHaveBeenCalledWith('Nice work')
  })
})
```

- [ ] **Step 5: Run, verify failure** — `npm run test -- CommentThread` → FAIL.
- [ ] **Step 6: Implement CommentThread** — `src/features/taskDrawer/CommentThread.tsx`:

```tsx
import { useState } from 'react'
import { useComments, useAddComment } from '../../lib/hooks/useComments'
import { relativeTime } from '../../lib/relativeTime'

export function CommentThread({ taskId }: { taskId: string }) {
  const { data } = useComments(taskId)
  const add = useAddComment(taskId)
  const [draft, setDraft] = useState('')

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    add.mutate(t)
    setDraft('')
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-[var(--muted)]">Comments</h3>
      <ul className="space-y-3">
        {(data ?? []).map((c) => (
          <li key={c.id}>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium">{c.author?.name || 'Someone'}</span>
              <span className="text-[11px] text-[var(--muted)]">{relativeTime(c.created_at)}</span>
            </div>
            <p className="text-sm text-[var(--text)]">{c.body}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        <textarea
          aria-label="Add a comment" rows={2} placeholder="Write a comment…" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
        />
        <button onClick={submit} className="rounded bg-[var(--primary)] px-3 py-1 text-sm text-white">Post</button>
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Implement TagEditor** (no separate test — exercised via the drawer + Task 2's hook tests) — `src/features/taskDrawer/TagEditor.tsx`:

```tsx
import { TAG_COLORS } from '../../types/constants'
import { useTaskTags } from '../../lib/hooks/useTaskTags'
import type { Task } from '../../data/tasksRepo'
import type { CSSProperties } from 'react'

export function TagEditor({ task, workspaceId }: { task: Task; workspaceId: string }) {
  const { add, remove } = useTaskTags(workspaceId)
  const available = Object.keys(TAG_COLORS).filter((t) => !task.tags.includes(t))

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-[var(--muted)]">Tags</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {task.tags.map((tg) => (
          <span key={tg} className="opm-tag" style={{ '--chip': TAG_COLORS[tg] ?? 'var(--faint)' } as CSSProperties}>
            {tg}
            <button aria-label={`Remove ${tg}`} onClick={() => remove.mutate({ id: task.id, tag: tg })} className="ml-1">✕</button>
          </span>
        ))}
        {available.length > 0 && (
          <select
            aria-label="Add tag" value=""
            onChange={(e) => e.target.value && add.mutate({ id: task.id, tag: e.target.value })}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-xs"
          >
            <option value="">＋ Add tag</option>
            {available.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 8: Render the three** in `TaskDrawer.tsx` — import `TagEditor`, `SubtaskList`, `CommentThread` and render inside the `drawer-body` after `<DrawerFields>`: `<TagEditor task={task} workspaceId={activeId ?? ''} />`, `<SubtaskList taskId={task.id} />`, `<CommentThread taskId={task.id} />`. The drawer test already mocks `useTasks`/`useUpdateTask`/`useMembers`; add module mocks for `useTaskTags`, `useSubtasks`, `useComments` at the top of `TaskDrawer.test.tsx` returning empty data so the existing drawer tests keep passing:

```tsx
vi.mock('../../lib/hooks/useTaskTags', () => ({ useTaskTags: () => ({ add: { mutate: vi.fn() }, remove: { mutate: vi.fn() } }) }))
vi.mock('../../lib/hooks/useSubtasks', () => ({ useSubtasks: () => ({ data: [], add: { mutate: vi.fn() }, toggle: { mutate: vi.fn() }, remove: { mutate: vi.fn() } }) }))
vi.mock('../../lib/hooks/useComments', () => ({ useComments: () => ({ data: [] }), useAddComment: () => ({ mutate: vi.fn() }) }))
```

- [ ] **Step 9: Run the full suite + type-check** — `npm run test` (all green), `npm run build` → exit 0.
- [ ] **Step 10: Commit**

```bash
git add src/features/taskDrawer
git commit -m "feat(drawer): tags, subtasks, and comments panels"
```

---

## Task 8: Filter/sort toolbar

**Files:**
- Create: `src/features/toolbar/filterTasks.ts` + `.test.ts`, `sortTasks.ts` + `.test.ts`, `useTaskFilters.ts` + `.test.ts`, `Toolbar.tsx` + `.test.tsx`
- Create: `src/lib/hooks/useFilteredTasks.ts` + `.test.ts`
- Modify: `src/features/listView/grouping.ts` + `grouping.test.ts` (bucket-only), `ListView.tsx` (sort), `BoardView.tsx`, `GanttView.tsx`, `TimelineView.tsx` (`useFilteredTasks`), `src/app/Shell.tsx` + `Shell.test.tsx` (mount Toolbar)

**Interfaces:**
- Produces: `interface TaskFilters { status: string[]; priority: string[]; assignee: string[]; type: string[]; tag: string[]; q: string }`; `filterTasks(tasks: Task[], f: TaskFilters): Task[]`; `type SortKey = 'priority' | 'due' | 'title' | 'status'`; `sortTasks(tasks: Task[], key: SortKey): Task[]`; `useTaskFilters() → { filters: TaskFilters; sort: SortKey; setList(key, vals: string[]); setQ(q: string); setSort(key: SortKey); clear() }`; `useFilteredTasks(ws) → ReturnType<typeof useTasks>` (data filtered); `<Toolbar showSort={boolean} />`.

- [ ] **Step 1: filterTasks failing test** — `src/features/toolbar/filterTasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filterTasks, type TaskFilters } from './filterTasks'

const t = (o: Partial<any> = {}) => ({
  id: 'x', status: 'todo', priority: 'low', assignee_id: null, type: 'feature',
  tags: [] as string[], title: '', description: '', ...o,
})
const none: TaskFilters = { status: [], priority: [], assignee: [], type: [], tag: [], q: '' }

describe('filterTasks', () => {
  it('returns all when no filters are set', () => {
    const tasks = [t(), t({ id: 'y' })]
    expect(filterTasks(tasks as any, none)).toHaveLength(2)
  })
  it('ORs within a dimension, ANDs across dimensions', () => {
    const tasks = [
      t({ id: 'a', status: 'todo', priority: 'high' }),
      t({ id: 'b', status: 'done', priority: 'high' }),
      t({ id: 'c', status: 'todo', priority: 'low' }),
    ]
    const out = filterTasks(tasks as any, { ...none, status: ['todo'], priority: ['high'] })
    expect(out.map((x) => x.id)).toEqual(['a'])
  })
  it('matches a tag when any selected tag is present', () => {
    const tasks = [t({ id: 'a', tags: ['API'] }), t({ id: 'b', tags: ['Design'] })]
    expect(filterTasks(tasks as any, { ...none, tag: ['API'] }).map((x) => x.id)).toEqual(['a'])
  })
  it('filters unassigned via empty-string assignee', () => {
    const tasks = [t({ id: 'a', assignee_id: null }), t({ id: 'b', assignee_id: 'u1' })]
    expect(filterTasks(tasks as any, { ...none, assignee: [''] }).map((x) => x.id)).toEqual(['a'])
  })
  it('text search matches title or description, case-insensitively', () => {
    const tasks = [t({ id: 'a', title: 'Build LOGIN' }), t({ id: 'b', description: 'fix the Login bug' }), t({ id: 'c', title: 'unrelated' })]
    expect(filterTasks(tasks as any, { ...none, q: 'login' }).map((x) => x.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run, verify failure** — `npm run test -- filterTasks` → FAIL.
- [ ] **Step 3: Implement** — `src/features/toolbar/filterTasks.ts`:

```ts
import type { Task } from '../../data/tasksRepo'

export interface TaskFilters {
  status: string[]
  priority: string[]
  assignee: string[]
  type: string[]
  tag: string[]
  q: string
}

export function filterTasks(tasks: Task[], f: TaskFilters): Task[] {
  const q = f.q.trim().toLowerCase()
  return tasks.filter((t) => {
    if (f.status.length && !f.status.includes(t.status)) return false
    if (f.priority.length && !f.priority.includes(t.priority)) return false
    if (f.assignee.length && !f.assignee.includes(t.assignee_id ?? '')) return false
    if (f.type.length && !f.type.includes(t.type)) return false
    if (f.tag.length && !t.tags.some((tg) => f.tag.includes(tg))) return false
    if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
    return true
  })
}
```

- [ ] **Step 4: Run + commit**

```bash
npm run test -- filterTasks   # PASS
git add src/features/toolbar/filterTasks.ts src/features/toolbar/filterTasks.test.ts
git commit -m "feat(toolbar): pure filterTasks predicate"
```

- [ ] **Step 5: sortTasks failing test** — `src/features/toolbar/sortTasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sortTasks } from './sortTasks'

const t = (o: Partial<any>) => ({ priority: 'low', end_date: null, title: '', status: 'todo', ...o })

describe('sortTasks', () => {
  it('orders by priority rank, highest first', () => {
    const out = sortTasks([t({ priority: 'low' }), t({ priority: 'urgent' }), t({ priority: 'medium' })] as any, 'priority')
    expect(out.map((x) => x.priority)).toEqual(['urgent', 'medium', 'low'])
  })
  it('orders by due date ascending, nulls last', () => {
    const out = sortTasks([t({ end_date: null }), t({ end_date: '2026-07-01' }), t({ end_date: '2026-06-15' })] as any, 'due')
    expect(out.map((x) => x.end_date)).toEqual(['2026-06-15', '2026-07-01', null])
  })
  it('orders by title A→Z and by status pipeline order', () => {
    expect(sortTasks([t({ title: 'B' }), t({ title: 'A' })] as any, 'title').map((x) => x.title)).toEqual(['A', 'B'])
    expect(sortTasks([t({ status: 'done' }), t({ status: 'backlog' })] as any, 'status').map((x) => x.status)).toEqual(['backlog', 'done'])
  })
  it('does not mutate the input array', () => {
    const input = [t({ priority: 'low' }), t({ priority: 'urgent' })] as any
    sortTasks(input, 'priority')
    expect(input[0].priority).toBe('low')
  })
})
```

- [ ] **Step 6: Run, verify failure** — `npm run test -- sortTasks` → FAIL.
- [ ] **Step 7: Implement** — `src/features/toolbar/sortTasks.ts`:

```ts
import { PRIORITIES, STATUSES } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'

export type SortKey = 'priority' | 'due' | 'title' | 'status'

const rank = (p: string) => PRIORITIES.find((x) => x.id === p)?.rank ?? 0
const stage = (s: string) => { const i = STATUSES.findIndex((x) => x.id === s); return i < 0 ? 99 : i }

export function sortTasks(tasks: Task[], key: SortKey): Task[] {
  const arr = [...tasks]
  switch (key) {
    case 'priority': return arr.sort((a, b) => rank(b.priority) - rank(a.priority))
    case 'due': return arr.sort((a, b) => (a.end_date ?? '9999-12-31').localeCompare(b.end_date ?? '9999-12-31'))
    case 'title': return arr.sort((a, b) => a.title.localeCompare(b.title))
    case 'status': return arr.sort((a, b) => stage(a.status) - stage(b.status))
  }
}
```

- [ ] **Step 8: Run + commit**

```bash
npm run test -- sortTasks   # PASS
git add src/features/toolbar/sortTasks.ts src/features/toolbar/sortTasks.test.ts
git commit -m "feat(toolbar): pure sortTasks (priority/due/title/status)"
```

- [ ] **Step 9: useTaskFilters failing test** — `src/features/toolbar/useTaskFilters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { useTaskFilters } from './useTaskFilters'

const wrap = (initial: string) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, { initialEntries: [initial] }, children)

describe('useTaskFilters', () => {
  it('parses comma lists, q, and sort from the URL', () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper: wrap('/?status=todo,done&q=login&sort=due') })
    expect(result.current.filters.status).toEqual(['todo', 'done'])
    expect(result.current.filters.q).toBe('login')
    expect(result.current.sort).toBe('due')
  })
  it('defaults to empty filters and priority sort', () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper: wrap('/') })
    expect(result.current.filters).toEqual({ status: [], priority: [], assignee: [], type: [], tag: [], q: '' })
    expect(result.current.sort).toBe('priority')
  })
  it('setList writes a comma list and clears the key when empty', () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper: wrap('/?status=todo') })
    act(() => result.current.setList('priority', ['high', 'urgent']))
    expect(result.current.filters.priority).toEqual(['high', 'urgent'])
    act(() => result.current.setList('status', []))
    expect(result.current.filters.status).toEqual([])
  })
  it('clear removes every filter key', () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper: wrap('/?status=todo&q=x&tag=API') })
    act(() => result.current.clear())
    expect(result.current.filters).toEqual({ status: [], priority: [], assignee: [], type: [], tag: [], q: '' })
  })
})
```

- [ ] **Step 10: Run, verify failure** — `npm run test -- useTaskFilters` → FAIL.
- [ ] **Step 11: Implement** — `src/features/toolbar/useTaskFilters.ts`:

```ts
import { useSearchParams } from 'react-router-dom'
import type { TaskFilters } from './filterTasks'
import type { SortKey } from './sortTasks'

const LIST_KEYS = ['status', 'priority', 'assignee', 'type', 'tag'] as const
type ListKey = (typeof LIST_KEYS)[number]
const csv = (v: string | null): string[] => (v ? v.split(',').filter(Boolean) : [])

export function useTaskFilters() {
  const [params, setParams] = useSearchParams()

  const filters: TaskFilters = {
    status: csv(params.get('status')),
    priority: csv(params.get('priority')),
    assignee: csv(params.get('assignee')),
    type: csv(params.get('type')),
    tag: csv(params.get('tag')),
    q: params.get('q') ?? '',
  }
  const sort = (params.get('sort') as SortKey | null) ?? 'priority'

  const setList = (key: ListKey, vals: string[]) =>
    setParams((p) => { vals.length ? p.set(key, vals.join(',')) : p.delete(key); return p }, { replace: true })
  const setQ = (q: string) =>
    setParams((p) => { q ? p.set('q', q) : p.delete('q'); return p }, { replace: true })
  const setSort = (key: SortKey) =>
    setParams((p) => { p.set('sort', key); return p }, { replace: true })
  const clear = () =>
    setParams((p) => { [...LIST_KEYS, 'q'].forEach((k) => p.delete(k)); return p }, { replace: true })

  return { filters, sort, setList, setQ, setSort, clear }
}
```

- [ ] **Step 12: Run + commit**

```bash
npm run test -- useTaskFilters   # PASS
git add src/features/toolbar/useTaskFilters.ts src/features/toolbar/useTaskFilters.test.ts
git commit -m "feat(toolbar): useTaskFilters URL (de)serialisation"
```

- [ ] **Step 13: useFilteredTasks failing test** — `src/lib/hooks/useFilteredTasks.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

vi.mock('./useTasks', () => ({
  useTasks: () => ({
    data: [
      { id: 'a', ref: 'NIM-1', status: 'todo', priority: 'low', assignee_id: null, type: 'feature', tags: [], title: 'a', description: '' },
      { id: 'b', ref: 'NIM-2', status: 'done', priority: 'low', assignee_id: null, type: 'feature', tags: [], title: 'b', description: '' },
    ],
    isLoading: false, error: null,
  }),
}))
import { useFilteredTasks } from './useFilteredTasks'

const wrap = (initial: string) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, { initialEntries: [initial] }, children)

describe('useFilteredTasks', () => {
  it('narrows the task list by the URL filters', () => {
    const { result } = renderHook(() => useFilteredTasks('w1'), { wrapper: wrap('/?status=done') })
    expect(result.current.data?.map((t) => t.id)).toEqual(['b'])
  })
  it('passes everything through when no filters are set', () => {
    const { result } = renderHook(() => useFilteredTasks('w1'), { wrapper: wrap('/') })
    expect(result.current.data).toHaveLength(2)
  })
})
```

- [ ] **Step 14: Run, verify failure** — `npm run test -- useFilteredTasks` → FAIL.
- [ ] **Step 15: Implement** — `src/lib/hooks/useFilteredTasks.ts`:

```ts
import { useTasks } from './useTasks'
import { useTaskFilters } from '../../features/toolbar/useTaskFilters'
import { filterTasks } from '../../features/toolbar/filterTasks'

export function useFilteredTasks(workspaceId: string) {
  const q = useTasks(workspaceId)
  const { filters } = useTaskFilters()
  return { ...q, data: q.data ? filterTasks(q.data, filters) : q.data }
}
```

- [ ] **Step 16: Run + commit**

```bash
npm run test -- useFilteredTasks   # PASS
git add src/lib/hooks/useFilteredTasks.ts src/lib/hooks/useFilteredTasks.test.ts
git commit -m "feat(hooks): useFilteredTasks wraps useTasks with URL filters"
```

- [ ] **Step 17: Refactor grouping to bucket-only.** Replace `src/features/listView/grouping.ts`:

```ts
import { STATUSES, type Status } from '../../types/constants'
import type { Task } from '../../data/tasksRepo'

// Buckets by status, preserving input order within each group.
// Ordering is the caller's job (List applies sortTasks first).
export function groupTasksByStatus(tasks: Task[]): { status: Status; tasks: Task[] }[] {
  return STATUSES.map((s) => ({ status: s.id, tasks: tasks.filter((t) => t.status === s.id) }))
    .filter((g) => g.tasks.length > 0)
}
```

Update `src/features/listView/grouping.test.ts` to drop any priority-ordering assertion and instead assert stable membership, e.g.:

```ts
import { describe, it, expect } from 'vitest'
import { groupTasksByStatus } from './grouping'

const t = (id: string, status: string) => ({ id, status, priority: 'low', position: 0 })

describe('groupTasksByStatus', () => {
  it('buckets by status in STATUSES order, preserving input order', () => {
    const groups = groupTasksByStatus([t('a', 'todo'), t('b', 'done'), t('c', 'todo')] as any)
    expect(groups.map((g) => g.status)).toEqual(['todo', 'done'])
    expect(groups[0].tasks.map((x) => x.id)).toEqual(['a', 'c'])
  })
  it('omits empty groups', () => {
    const groups = groupTasksByStatus([t('a', 'todo')] as any)
    expect(groups.every((g) => g.tasks.length > 0)).toBe(true)
  })
})
```

- [ ] **Step 18: List uses filtered + sorted tasks.** In `src/features/listView/ListView.tsx`: replace `import { useTasks }` with `import { useFilteredTasks } from '../../lib/hooks/useFilteredTasks'`; replace the `useTasks(activeId ?? '')` call with `useFilteredTasks(activeId ?? '')`; add `import { sortTasks } from '../toolbar/sortTasks'` and `import { useTaskFilters } from '../toolbar/useTaskFilters'`; read `const { sort } = useTaskFilters()`; change `const groups = groupTasksByStatus(tasks ?? [])` to `const groups = groupTasksByStatus(sortTasks(tasks ?? [], sort))`. Run `npm run test -- ListView` (the empty/loading/edit tests still pass; data flows the same shape). If a List test asserted priority ordering directly, it still holds because default `sort='priority'`.

- [ ] **Step 19: Board/Gantt/Timeline use filtered tasks.** In each of `BoardView.tsx`, `GanttView.tsx`, `TimelineView.tsx`: replace `import { useTasks } from '../../lib/hooks/useTasks'` with `import { useFilteredTasks } from '../../lib/hooks/useFilteredTasks'` and the `useTasks(activeId ?? '')` call with `useFilteredTasks(activeId ?? '')`. These views render inside `MemoryRouter` in their tests already (they use `useViewState` after Task 5); if any view test does **not** wrap in a router, wrap its `render` in `<MemoryRouter>`. Run each view's test file.

- [ ] **Step 20: Toolbar failing test** — `src/features/toolbar/Toolbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'
import React from 'react'

vi.mock('../../lib/workspace', () => ({ useActiveWorkspace: () => ({ activeId: 'w1', loading: false }) }))
vi.mock('../../lib/hooks/useMembers', () => ({ useMembers: () => ({ data: [] }) }))
import { Toolbar } from './Toolbar'

function Probe() {
  const [params] = useSearchParams()
  return <output data-testid="qs">{params.toString()}</output>
}
const renderAt = (initial: string, showSort = false) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Toolbar showSort={showSort} />
      <Probe />
    </MemoryRouter>,
  )

describe('Toolbar', () => {
  it('checking a status writes it to the URL', () => {
    renderAt('/')
    fireEvent.click(screen.getByLabelText('To Do'))
    expect(screen.getByTestId('qs').textContent).toContain('status=todo')
  })
  it('typing in search sets q', () => {
    renderAt('/')
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'login' } })
    expect(screen.getByTestId('qs').textContent).toContain('q=login')
  })
  it('shows the sort control only when showSort is true', () => {
    renderAt('/', false)
    expect(screen.queryByLabelText('Sort by')).toBeNull()
    renderAt('/', true)
    expect(screen.getByLabelText('Sort by')).toBeInTheDocument()
  })
})
```

- [ ] **Step 21: Run, verify failure** — `npm run test -- Toolbar` → FAIL.
- [ ] **Step 22: Implement** — `src/features/toolbar/Toolbar.tsx`:

```tsx
import { STATUSES, PRIORITIES, TASK_TYPES, TAG_COLORS } from '../../types/constants'
import { useActiveWorkspace } from '../../lib/workspace'
import { useMembers } from '../../lib/hooks/useMembers'
import { useTaskFilters } from './useTaskFilters'
import type { SortKey } from './sortTasks'

type ListKey = 'status' | 'priority' | 'assignee' | 'type' | 'tag'
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'priority', label: 'Priority' }, { id: 'due', label: 'Due date' },
  { id: 'title', label: 'Title' }, { id: 'status', label: 'Status' },
]

export function Toolbar({ showSort }: { showSort: boolean }) {
  const { activeId } = useActiveWorkspace()
  const { data: members } = useMembers(activeId ?? '')
  const { filters, sort, setList, setQ, setSort, clear } = useTaskFilters()

  const toggle = (key: ListKey, id: string) => {
    const cur = filters[key]
    setList(key, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }
  const active =
    filters.status.length || filters.priority.length || filters.assignee.length ||
    filters.type.length || filters.tag.length || filters.q.trim()

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2 text-sm">
      <input
        aria-label="Search tasks" placeholder="Search…" value={filters.q}
        onChange={(e) => setQ(e.target.value)}
        className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
      />
      <Group label="Status" selected={filters.status}
        options={STATUSES.map((s) => ({ id: s.id, label: s.label }))} onToggle={(id) => toggle('status', id)} />
      <Group label="Priority" selected={filters.priority}
        options={PRIORITIES.map((p) => ({ id: p.id, label: p.label }))} onToggle={(id) => toggle('priority', id)} />
      <Group label="Type" selected={filters.type}
        options={Object.entries(TASK_TYPES).map(([id, t]) => ({ id, label: t.label }))} onToggle={(id) => toggle('type', id)} />
      <Group label="Tag" selected={filters.tag}
        options={Object.keys(TAG_COLORS).map((t) => ({ id: t, label: t }))} onToggle={(id) => toggle('tag', id)} />
      <Group label="Assignee" selected={filters.assignee}
        options={(members ?? []).map((m) => ({ id: m.user_id, label: m.name || 'Someone' }))} onToggle={(id) => toggle('assignee', id)} />
      {showSort && (
        <label className="ml-auto flex items-center gap-1">
          <span className="text-[var(--muted)]">Sort</span>
          <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}
      {active ? (
        <button onClick={clear} className={`rounded border border-[var(--border)] px-2 py-1${showSort ? '' : ' ml-auto'}`}>
          Clear filters
        </button>
      ) : null}
    </div>
  )
}

// Native <details> disclosure — no popover dependency.
function Group({ label, options, selected, onToggle }: {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded border border-[var(--border)] px-2 py-1">
        {label}{selected.length ? ` (${selected.length})` : ''}
      </summary>
      <div className="absolute z-20 mt-1 flex flex-col gap-1 rounded border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 whitespace-nowrap">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  )
}
```

- [ ] **Step 23: Mount in Shell.** In `src/app/Shell.tsx`: add `import { Toolbar } from '../features/toolbar/Toolbar'` and `const TASK_VIEWS: ViewId[] = ['list', 'board', 'gantt', 'timeline']`. Between the `<header>` and `<main>` inside `<section>`, render `{TASK_VIEWS.includes(view) && <Toolbar showSort={view === 'list'} />}`. In `src/app/Shell.test.tsx` add `vi.mock('../features/toolbar/Toolbar', () => ({ Toolbar: () => null }))`.

- [ ] **Step 24: Full suite + type-check** — `npm run test` (all green), `npm run build` → exit 0.
- [ ] **Step 25: Commit**

```bash
git add src/features/toolbar src/lib/hooks/useFilteredTasks.ts src/lib/hooks/useFilteredTasks.test.ts \
  src/features/listView/grouping.ts src/features/listView/grouping.test.ts src/features/listView/ListView.tsx \
  src/features/boardView/BoardView.tsx src/features/ganttView/GanttView.tsx src/features/timelineView/TimelineView.tsx \
  src/app/Shell.tsx src/app/Shell.test.tsx
git commit -m "feat(toolbar): shared filter bar + List sort, wired across task views"
```

---

## Task 9: Impeccable visual pass + browser smoke

**Files:** `src/features/taskDrawer/*`, `src/features/toolbar/*`, `src/index.css` (reuse existing `opm-*` primitives; add only what's missing).

**This task uses the `impeccable` skill** (project directive — not frontend-design). Visual-only; preserve every test hook (`aria-label`s, `role`s, `data-testid`s) and add no Supabase import.

- [ ] **Step 1:** Invoke the `impeccable` skill and do a full visual pass over the drawer (panel surface, header, field grid, tags/subtasks/comments, slide-in motion, backdrop) and the toolbar (filter disclosures, chips, search, sort, clear). Style with `var(--…)` tokens only — zero hard-coded theme hexes; tint with `color-mix(in oklab, <hex> <pct>, var(--surface))` (never `${hex}1f`). **All copy in UK English.**
- [ ] **Step 2:** `npm run test` (all green — visual changes must not break a test) and `npm run build` → exit 0.
- [ ] **Step 3: Commit** the visual pass: `git commit -m "style(drawer,toolbar): impeccable visual pass — both themes, UK English"`.
- [ ] **Step 4: Controller browser smoke** (not delegated). Ensure Podman + the 8 Supabase containers are up; `npm run dev`; sign in (email/password → auto-joins Northwind). Verify in **both** Bloom + Slate:
  - Click a task in List / Board / Gantt / Timeline → drawer opens with that task; `?task=NIM-…` in the URL; reload re-opens it (deep-link); ESC + backdrop + ✕ close it.
  - Edit status/priority/assignee/type/points/**start+due dates**/title/description → optimistic, persists across reload; a Gantt/Timeline bar shifts after a date edit.
  - Add/remove a tag (chip lights up in List + Board too); add/toggle/remove a subtask (progress updates); post a comment (author-or-"Someone" + relative time).
  - Toolbar: filter by each dimension + text narrows List/Board/Gantt/Timeline; sort dropdown (List only) reorders; "Clear filters" resets; filters survive reload via URL; Activity + Workload show no toolbar.
  - Slate: drawer/toolbar legible, no wash-out.
- [ ] **Step 5:** Record findings in `.superpowers/sdd/progress.md`. Then run the **final whole-branch review** (opus) and **finishing-a-development-branch** (tests green → FF-merge to `main` → push → delete branch → update the ledger).

---

## Self-Review

**Spec coverage:**
- Drawer core-field edits → Tasks 1 (widen `updateTask`) + 6. ✓
- Tags (incl. List/Board chips) → Tasks 1 + 2 + 7. ✓
- Subtasks → Tasks 3 + 7. ✓
- Comments (pinned author) → Tasks 4 + 7. ✓
- Drawer overlay/open/close/deep-link/a11y/not-found → Task 5. ✓
- Toolbar filter (all dims) + sort (List only) + URL serialisation + `useFilteredTasks` across views → Task 8. ✓
- UK English copy → Global Constraints + Task 9. ✓
- RLS positive-write controls → handled in Task 9 Step 5's final review / ledger; **add an explicit pgTAP check there if `rls_test.sql` lacks member-can-insert subtask/tag/comment** (verify before merge — listed in the spec's Testing section).
- No new tables/migrations → honoured (all repos hit existing tables). ✓

**Placeholder scan:** no TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `Task` gains `tags: string[]` (Task 1) and every later consumer uses it (`filterTasks`, `TagEditor`); `TaskFilters`/`SortKey` defined in Task 8 and consumed by `useTaskFilters`/`useFilteredTasks`/`Toolbar`; hook return shapes (`{ add, toggle, remove }`, `{ add, remove }`) match their test usage. ✓

**One gap fixed inline:** the RLS positive-write verification has no standalone task — it's folded into Task 9's pre-merge review with an explicit instruction to extend `rls_test.sql` only if the controls are missing (no policy change, so no new migration).

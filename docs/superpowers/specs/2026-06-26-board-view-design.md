# Board View — Design Spec

**Date**: 2026-06-26
**Status**: Approved design → ready for implementation plan
**Context**: Second of the six views, on the merged foundation + List view. Extends the master spec (`2026-06-26-project-management-design.md`). UI built/polished with the **impeccable** skill.

## Goal

A Kanban board — one column per status — where native drag-and-drop moves cards across columns (status change) and reorders within a column (position change), and every status move is logged to the activity feed.

## Scope

**In v1:**
- One column per status (all 5 of `STATUSES` always shown, even empty, as drop targets), cards ordered by `position`.
- Native HTML5 DnD: **cross-column** drop → status change; **intra-column** drop → reorder (position change). A drop indicator shows the landing spot.
- A shared **move** operation (status + position) that **logs an `activity` row (verb `moved`)** on status changes — used by Board drops AND retrofitted into the List view's inline status `<select>`.
- Optimistic updates with rollback + toast.

**Out of v1** (deferred): Supabase Realtime, `position` rebalancing, swimlanes / group-by-assignee, WIP limits.

## Ordering Model

- Within a column, cards sort by `position` (asc).
- `computeDropPosition(columnTasks, insertIndex)` (columnTasks = the target column's cards **excluding the dragged task**, ordered by position):
  - empty column → `0`
  - `insertIndex <= 0` (top) → `columnTasks[0].position - 1`
  - `insertIndex >= columnTasks.length` (bottom) → `columnTasks[last].position + 1`
  - else (between) → `(columnTasks[insertIndex-1].position + columnTasks[insertIndex].position) / 2`
- *ponytail:* fractional `double precision` positions; rebalancing only if precision is ever exhausted (deferred). Seeded positions are integers → ample headroom.

## DnD Mechanics (native, no library)

- `TaskCard` is `draggable`; `onDragStart` calls `dataTransfer.setData('text/plain', task.id)` and marks a dragging state.
- `BoardColumn` is the drop target: `onDragOver` calls `preventDefault()` (to allow drop) and tracks a **pending insert index** — each card's `onDragOver` sets it from whether the cursor is in the card's top or bottom half; an empty column's index is `0`.
- `onDrop`: read the task id from `dataTransfer`, resolve the target `{ status, insertIndex }`, compute the new position, and call the move. Clear the dragging/pending state.
- jsdom can't simulate real native drag events, so the **drag UX is verified in the browser** (impeccable pass); the drop handler + position math are unit-tested directly.

## Shared Move + Activity

- `tasksRepo.updateTask`'s patch type is extended to include `position`: `Partial<Pick<Task, 'status' | 'priority' | 'assignee_id' | 'title' | 'position'>>`.
- `activityRepo.logMove({ workspaceId, actorId, taskId, fromStatus, toStatus }): Promise<void>` → inserts `activity` `{ workspace_id, actor_id, task_id, verb: 'moved', from_status, to_status }`. RLS already pins `actor_id = auth.uid()` and the table is insert-only (immutable log).
- `useMoveTask(workspaceId)` — optimistic mutation taking `{ taskId, toStatus, position, fromStatus }`:
  - `onMutate`: cancel `['tasks', workspaceId]`, snapshot, patch the task's `{ status: toStatus, position }` in cache.
  - `mutationFn`: `updateTask(taskId, { status: toStatus, position })`; **then, only if `toStatus !== fromStatus`**, `activityRepo.logMove(...)`. (A pure intra-column reorder updates position only — no activity.)
  - `onError`: rollback + `toast.error`. `onSettled`: invalidate `['tasks', workspaceId]` and `['activity', workspaceId]`.
  - Actor id comes from `useSession()` (`session.user.id`).
- **List retrofit:** the List view's `StatusCell` change routes through `useMoveTask` (so inline status changes log activity, with `fromStatus` = the task's current status); `PriorityCell`/`AssigneeCell` keep `useUpdateTask` (no activity).

## Components

`src/features/boardView/`:
- `boardColumns(tasks): { status: Status; tasks: Task[] }[]` — **all 5** statuses in `STATUSES` order, each with its tasks sorted by `position` (empty columns included). (Distinct from the List's `groupTasksByStatus`, which hides empties and sorts by priority.)
- `computeDropPosition(...)` — the ordering util above.
- `BoardView` — `useActiveWorkspace` → ws; `useTasks` + `useMembers`; `useMoveTask`; renders a horizontal row of `BoardColumn`s; owns the DnD drag/drop state. Loading/error/empty states.
- `BoardColumn` — status header (label + count), drop handling, its `TaskCard`s, drop indicator.
- `TaskCard` — draggable card: type mark · ref · title · priority chip · assignee · points · tags (reusing the List's chip/constant system).

`src/data/activityRepo.ts` (new), `src/lib/hooks/useMoveTask.ts` (new). Shell renders `<BoardView />` for `view === 'board'` (other views keep their placeholders/List).

## Error Handling

If `updateTask` fails, the optimistic `{status, position}` rolls back and we toast. If `updateTask` succeeds but `logMove` fails, the move itself persisted — so we don't undo it; `onSettled` invalidates and the refetch shows DB truth (the moved card, just no activity row), and we toast so the user knows the log didn't record. Activity logging is therefore best-effort in v1; a transactional move (a Postgres function that updates status + inserts the activity row atomically, called via RPC) is a noted future hardening. Loading/error/empty states mirror the List view.

## Testing

- **Unit (Vitest):** `boardColumns` (all statuses present + ordered, position sort, empty columns kept); `computeDropPosition` (empty / top / bottom / between, and same-column drag excludes the dragged card); `useMoveTask` (optimistic status+position patch; activity logged **only** on status change; no activity on pure reorder; rollback + toast on error) with a QueryClient + mocked repos; `activityRepo.logMove` against a mocked `supabase-js`.
- **Component (RTL):** `BoardView` renders all five columns from fixtures; `onDrop` on a column (synthetic `dataTransfer` carrying a task id) calls `useMoveTask` with the right `{ taskId, toStatus, position, fromStatus }`; the List retrofit — a `StatusCell` change calls `useMoveTask` (not `useUpdateTask`).
- **Browser (impeccable pass):** real drag-and-drop across and within columns; drop indicator; activity row appears.
- The existing `src/architecture.test.ts` keeps `supabase-js` confined to `data/`.

## Build Order

1. **Data layer** — extend `updateTask` patch with `position`; `activityRepo.logMove`; `useMoveTask` (optimistic + activity); retrofit the List `StatusCell` → `useMoveTask`.
2. **Read-only board** — `boardColumns` + `BoardView`/`BoardColumn`/`TaskCard`; Shell mounts for `view === 'board'`.
3. **Drag-and-drop** — draggable cards + column drop targets + `computeDropPosition`, wired to `useMoveTask` (cross-column + reorder).
4. **States + impeccable polish** — loading/error/empty; faithful Kanban styling + drop indicator; browser verification.

## Forward / Shared Infra

`activityRepo` (gains `listActivity` next) and the `moved` log feed directly into the **Activity view** (the next build-order item). `useMoveTask` and `computeDropPosition` are Board-specific; `boardColumns` is too. Realtime, when wired in its shared pass, will reconcile the `['tasks', ws]` cache the Board reads.

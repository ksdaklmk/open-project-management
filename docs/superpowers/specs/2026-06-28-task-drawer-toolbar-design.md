# Task Drawer + Filter/Sort Toolbar — Design Spec

**Date**: 2026-06-28
**Status**: Approved design → ready for implementation plan
**Build step**: #7 (final) of the master plan. Extends `2026-06-26-project-management-design.md` — "A shared task drawer (detail panel) and a filter/sort toolbar are reused across all views."

## Goal

A shared, deep-linkable **task drawer** (detail panel) and a shared **filter/sort toolbar**, reused across the app. The drawer is the single place a task's fields — plus its tags, subtasks, and comments — are viewed and edited; it unlocks the date rescheduling deferred from Gantt/Timeline (native `<input type="date">`). The toolbar narrows the task set across the task views and sorts the List.

## Language & copy convention (app-wide)

- **UK English** is the language of the application. All user-facing copy uses British spellings (organise, colour, behaviour, prioritise, cancelled, licence) and en-GB phrasing.
- Custom-formatted dates render **en-GB** (DD/MM/YYYY); native `<input type="date">` localises itself.
- Code identifiers, CSS properties (`color`), and DB columns (`color`) remain standard — the convention governs **content shown to users**, not code.
- Recorded here at first need; it applies to every view's copy and every future impeccable pass.

## Non-Goals (v1)

- No comment→`activity` logging (the Activity feed won't reflect new comments) — additive fast-follow.
- No subtask reordering; no comment edit/delete UI (the tables + policies support both; the UI is deferred).
- No task creation/deletion from the drawer (no view has create yet; a separate feature).
- Sort applies to **List only**; Board/Gantt/Timeline keep intrinsic order; Activity + Workload are unaffected by the toolbar.
- No Realtime in this step (the cross-view Realtime pass stays separately queued).
- **No new tables, migrations, or RLS policy changes** — `subtasks`, `task_tags`, `comments` already exist, are member-scoped under RLS, and are granted to `authenticated`.

## Architecture

Two shared surfaces over the existing hook + `data/` layer. No Supabase client outside `data/` (the `architecture.test.ts` boundary holds — drawer/toolbar call hooks only).

```
src/
  data/
    tasksRepo.ts        (widen updateTask Pick; tags join on listTasks; add/removeTaskTag)
    subtasksRepo.ts     (new — list/add/toggleDone/delete)
    commentsRepo.ts     (new — list w/ author join; add w/ pinned author_id)
  lib/hooks/
    useSubtasks.ts      (new — query + add/toggle/delete optimistic mutations)
    useComments.ts      (new — query + add)
    useTaskTags.ts      (new — add/remove optimistic over ['tasks', ws])
    useFilteredTasks.ts (new — useTasks + URL filters)
  features/
    taskDrawer/         (TaskDrawer + Fields/TagEditor/SubtaskList/CommentThread)
    toolbar/            (Toolbar + filterTasks/sortTasks pure fns + useTaskFilters URL hook)
  app/
    Shell.tsx           (mount drawer once as overlay; mount toolbar on task views)
```

## Data layer

| Change | Detail |
|---|---|
| `tasksRepo.updateTask` | Widen the `Pick` to add `description, type, points, start_date, end_date` (today: status/priority/assignee_id/title/position). Drawer edits round-trip through the **existing optimistic `useUpdateTask`** — no new edit hook. |
| `tasksRepo.listTasks` + `Task` type | Fold in the queued tags join: `select('*, task_tags(tag)')`, map to `tags: string[]`; `Task = …['tasks']['Row'] & { tags: string[] }`. Drops the `as Task & {tags?}` casts and **lights up tag chips in List + Board**. Optimistic spreads (`{...t, ...patch}`) preserve `tags`. |
| `tasksRepo.addTaskTag / removeTaskTag` | Insert/delete on `task_tags`; hook `useTaskTags(ws)` is optimistic over `['tasks', ws]` (mutate the task's `tags`), invalidate on settle. |
| `subtasksRepo` (new) | `listSubtasks(taskId)`, `addSubtask(taskId, title)` (position = append, computed client-side), `toggleSubtask(id, done)`, `deleteSubtask(id)`. Hook `useSubtasks(taskId)` keyed `['subtasks', taskId]` + 3 optimistic mutations. |
| `commentsRepo` (new) | `listComments(taskId)` — `select('*, profiles(name)')`, ascending, cap 100; `addComment(taskId, body, authorId)` pins `author_id` = session uid (mirrors `logMove`'s actor pattern; the `comment_insert` policy requires `author_id = auth.uid()`). Hooks `useComments(taskId)` + `useAddComment` (reads `useSession` for the uid). |

## Drawer behaviour

- **Mount:** once in `Shell` as a right-side overlay (`role="dialog"`, `aria-modal="true"`) over the whole layout, so it works on every view. Renders nothing unless `?task=` is set.
- **Open:** any task element sets `?task=<ref>`. The drawer finds the task in `useTasks(ws)` **by `ref`** (the **unfiltered** list — a deep-linked or filtered-out task still opens) and resolves its `id` for the subtask/comment hooks. Wire click→`setTaskRef` in Board (`TaskCard`), Gantt (bar), Timeline (row); List already does. Make List rows focusable (`tabIndex={0}` + Enter — the deferred row-a11y fold-in). Workload + Activity do not open it.
- **Close:** backdrop click, ESC, and the close (×) button → `setTaskRef(null)`. Focus trap while open; return focus to the opener.
- **States:** workspace/tasks loading → skeleton; ref not found in the list → "Task not found" + close.
- **Edit semantics:** selects / dates / points / type → `onChange` → `useUpdateTask.mutate` (optimistic, exactly like List's inline edits). Title + description (text) → save on **blur**. Reuse `listView/cells.tsx` selects for status/priority/assignee; add a `type` select, a `points` number input, and two native `<input type="date">` for start/end.
- **Sections:** header (type mark · `ref` · editable title · close); field grid (status, priority, assignee, type, points, start, end); description (textarea); tags (chips + add/remove); subtasks (checklist + progress = done/total + add row); comments (thread, ascending, author-or-"Someone" + relative time, compose box); read-only meta (created/updated).

## Toolbar behaviour

- **Mount:** shared bar in the `Shell` header region, rendered only on `list | board | gantt | timeline`. Filters always shown there; the **sort dropdown renders on List only**.
- **Filter dimensions:** status, priority, assignee, type, tag (multi-select) + text search (`q`, case-insensitive substring over `title` + `description`). Pure `filterTasks(tasks, filters)` — AND across dimensions, OR within a dimension's list; an empty dimension imposes no constraint.
- **Application:** a `useFilteredTasks(ws)` wrapper = `useTasks(ws)` + URL filters (passes through `isLoading`/`error`). The four task views swap `useTasks` → `useFilteredTasks`. Workload + Activity untouched. Board DnD still operates on the visible cards. List groups the *filtered* set, then sorts each group.
- **Sort (List only):** pure `sortTasks(tasks, key)` for `priority | due (end_date) | title | status`; due-date sort puts nulls last. Default key = `priority` (preserves today's within-group order).
- **No matches:** each view's existing empty state, with a "Clear filters" affordance.

## URL state

All toolbar + drawer state lives in the query string (bookmarkable/shareable), alongside the existing `view`/`task`:

```
?view=board&task=NIM-101&status=todo,in_progress&priority=high&assignee=<uuid>&type=feature&tag=Backend&q=auth&sort=priority
```

Comma-joined lists; an absent key = no constraint. `useTaskFilters()` reads/writes these via `useSearchParams` and exposes `{ filters, setFilter, clear }`; (de)serialisation is a pure, tested round-trip.

## Edge cases & error handling

- **Empty `profiles.name`** → comment authors and the assignee picker degrade to name-or-"Someone"/blank (the known signup gap; Demo Owner + Dana Lee have names).
- **Deep-link to an unknown/forbidden ref** → "Task not found" panel, never a crash (RLS already filters the list; the ref simply isn't present).
- **Optimistic failure** (any drawer edit, subtask, tag, comment) → rollback + `sonner` toast, mirroring `useUpdateTask`/`useMoveTask`.
- **Taxonomy drift** → guarded lookups (`STATUSES.find(...)`, `?? 'var(--muted)'`), never `OBJ[x]` bare — same rule as every coloured component.
- **Click vs drag on Board** → a click that isn't a drag opens the drawer; verify in browser smoke.

## Accessibility

- Drawer: `role="dialog"`, `aria-modal`, `aria-labelledby` the title, focus trap, ESC, restore focus. List rows become keyboard-openable (`tabIndex`/Enter).
- Toolbar: labelled controls; the text search is a `<label>`ed input; multi-selects are keyboard-operable.

## Testing

- **Unit (Vitest):** `filterTasks` (each dimension + combined + empty), `sortTasks` (incl. nulls-last due date, stable within group), URL (de)serialisation round-trip, the three new/extended repos against a mocked `supabase-js` (assert select projections + pinned `author_id`).
- **Component (RTL):** drawer edit round-trips through the repo layer; ESC/backdrop/× close; subtask toggle + comment add are optimistic; a toolbar filter narrows a rendered view; "Task not found" on a bad ref.
- **RLS (pgTAP):** no policy changes → **verify (extend only if missing) positive-write controls** in `rls_test.sql` — a member *can* insert a subtask / tag / comment on their own workspace's task, and still *cannot* on workspace B's.
- **Architecture:** `architecture.test.ts` stays green (drawer/toolbar import hooks, never the client).

## Build order (plan shape — ~8 TDD tasks)

1. `tasksRepo`: widen `updateTask` Pick + tags join + `Task.tags` type (drop casts in List/Board) + `add/removeTaskTag` + `useTaskTags`.
2. `subtasksRepo` + `useSubtasks` (query + 3 optimistic mutations).
3. `commentsRepo` + `useComments` + `useAddComment` (pinned author).
4. Drawer shell: overlay, open/close, deep-link by ref, focus trap, a11y, loading/not-found states; wire Board/Gantt/Timeline task click → `setTaskRef`; List rows focusable.
5. Drawer fields: status/priority/assignee/type/points/start/end/title/description edit round-trip (optimistic).
6. Drawer tags + subtasks + comments UI.
7. Toolbar: `filterTasks`/`sortTasks` + `useTaskFilters` (URL) + `useFilteredTasks`; mount on task views; List sort.
8. Impeccable visual pass + browser smoke (both themes), UK-English copy throughout.

Spec + plan committed on `main` first, then branch — matching all six views.

# List View — Design Spec

**Date**: 2026-06-26
**Status**: Approved design → ready for implementation plan
**Context**: First of the six views, built on the merged foundation. Extends the master spec (`2026-06-26-project-management-design.md`). UI built/polished with the **impeccable** skill.

## Goal

A status-grouped task table for the active workspace with inline editing of status / priority / assignee, faithful to the original `Project App.dc.html` List view.

## Scope

**In v1:**
- Active-workspace selection via a sidebar switcher.
- Tasks grouped by status (collapsible), inline-edit status / priority / assignee (optimistic).
- Row click selects the task in the URL (`?task=NIM-101`) — selection only.

**Out of v1** (later build-order items): the task detail drawer, task creation, the shared filter/sort/grouping toolbar, and Supabase Realtime (deferred to a single cross-view pass).

## Active Workspace

- `WorkspaceProvider` (React context) holds the active workspace id and a setter. Lives inside `AuthGate` (needs a session) and `QueryClientProvider` (uses a query).
- `useActiveWorkspace()` resolves the active id: a `localStorage['activeWorkspace']` value if the user still belongs to it, else the first workspace from `useWorkspaces()` (ordered by name). Switching writes `localStorage` and updates context.
- *Decision:* active workspace is a session preference in context+localStorage, NOT a URL coordinate (unlike `view`/`task`). Promotable to the URL later if cross-workspace sharing is needed.

## Data Layer (all under `src/data/`, behind the enforced import boundary)

- `workspacesRepo.listMine(): Promise<Workspace[]>` — `supabase.from('workspaces').select('*').order('name')`; RLS (`ws_read = is_member(id)`) already scopes to the caller's workspaces.
- `membersRepo.listMembers(workspaceId): Promise<Member[]>` — `workspace_members` joined to `profiles(name, color)` for the workspace; `Member = { user_id, role, capacity_per_week, color, name }`. RLS (`mem_read`, `profile_read`) permits co-member reads.
- `tasksRepo.updateTask(id, patch): Promise<void>` — `supabase.from('tasks').update(patch).eq('id', id)`, throws on error. `patch: Partial<Pick<Task, 'status' | 'priority' | 'assignee_id' | 'title'>>`. **Replaces** the single-purpose `updateTaskStatus` (update its test accordingly).
- Types sourced from `src/types/database.ts` (`Workspace`, `Task` = the generated `Row` types).

**Hooks** (`src/lib/hooks/`):
- `useWorkspaces()` → `useQuery(['workspaces'], workspacesRepo.listMine)`.
- `useMembers(workspaceId)` → `useQuery(['members', workspaceId], …)`, `enabled: !!workspaceId`.
- `useUpdateTask(workspaceId)` → `useMutation(tasksRepo.updateTask)` with **optimistic update**: `onMutate` cancels `['tasks', workspaceId]`, snapshots, applies the patch to the cached task; `onError` rolls back + `toast.error`; `onSettled` invalidates `['tasks', workspaceId]`.

## List UI

- `features/listView/ListView.tsx` — reads `useActiveWorkspace()` → `wsId`; `useTasks(wsId)` + `useMembers(wsId)`; groups tasks, renders a `TaskTable` per status group.
- **Grouping:** `groupTasksByStatus(tasks)` (pure) → groups in `STATUSES` order; rows within a group sorted by priority rank (desc) then `position` (asc). Groups are collapsible (local state, expanded by default). Empty groups are hidden.
- **Columns:** type (shape+color from `TASK_TYPES`) · `ref` · `title` · status · priority · assignee · tags (chips colored via `TAG_COLORS`) · points.
- **Inline editors** (`StatusCell`, `PriorityCell`, `AssigneeCell`): native `<select>` styled with theme variables — accessible, zero-dependency. Status/priority options from the `STATUSES`/`PRIORITIES` constants; assignee options from `useMembers` (+ an "Unassigned" entry). `onChange` → `useUpdateTask().mutate({ id, patch })`. (Impeccable may later upgrade the assignee cell to an avatar popover.)
- **Row click** sets `?task=<ref>` via `useViewState().setTaskRef` (selection only; the consuming drawer is a later task).
- **States:** loading → skeleton/spinner; query error → `toast.error` + inline message; no workspace / no tasks → "No tasks yet" empty state.

## Components & Wiring

- `components/WorkspaceSwitcher.tsx` — dropdown of `useWorkspaces()`, current from `useActiveWorkspace()`; mounted in the Shell sidebar header.
- `Shell.tsx` — mount the switcher; render `<ListView />` in the view-region when `view === 'list'` (other views keep their placeholders).
- `main.tsx` — add `WorkspaceProvider` (inside `AuthGate`); add the deferred React-Router `future` flags (`v7_startTransition`, `v7_relativeSplatPath`) to `BrowserRouter` (and `MemoryRouter` in tests) to silence the warnings.

## Theming

All colors via CSS variables (`var(--surface)`, `var(--text)`, `var(--border)`, etc.) and the domain-constant hexes for status/priority/type/tag — never hard-coded theme hexes in utilities.

## Testing

- **Unit (Vitest):** `groupTasksByStatus` ordering; `useUpdateTask` optimistic apply + rollback (with a QueryClient test wrapper); `useActiveWorkspace` default-to-first + localStorage persistence + invalid-stored fallback.
- **Component (RTL):** `ListView` renders the status groups from fixture data; changing a `StatusCell` calls `updateTask` with the right patch and optimistically reflects it; `WorkspaceSwitcher` change updates the active workspace and re-queries.
- **Repos:** `workspacesRepo` / `membersRepo` / `tasksRepo.updateTask` tested against a mocked `supabase-js` (use `vi.hoisted()` for mock consts).
- The existing `src/architecture.test.ts` already fails the suite if any new file imports `supabase-js` outside `data/`.

## Build Order

1. **Data layer** — `workspacesRepo`, `membersRepo`, `tasksRepo.updateTask` (+ migrate its test) + hooks (`useWorkspaces`, `useMembers`, `useUpdateTask`).
2. **Active workspace** — `WorkspaceProvider` + `useActiveWorkspace`; wire into `main.tsx` (+ RR future flags).
3. **WorkspaceSwitcher** — component + mount in Shell.
4. **List table (read-only)** — `ListView` + `TaskTable`/`TaskRow` + `groupTasksByStatus` + columns.
5. **Inline editors** — `StatusCell`/`PriorityCell`/`AssigneeCell` + optimistic edits via `useUpdateTask`.
6. **States + UI polish** — loading/error/empty; faithful styling via the impeccable skill.

## Out of Scope / Forward

Task creation, the detail drawer (consumes `?task=`), the shared filter/sort/grouping toolbar, Realtime, and an avatar-popover assignee editor are later items. `useMembers`/`membersRepo` and `WorkspaceProvider` are shared infra the other views will reuse.

# Project Management Web App — Design Spec

**Date**: 2026-06-26
**Status**: Approved design → ready for implementation plan
**Source**: Rebuild of `Project App.dc.html` (Claude Design project `945c9c0d-bb26-4726-a9a8-103345b6999c`) as a real, extensible full-stack app.

## Goal

Rebuild the interactive `Project App.dc.html` prototype as a production-quality, multi-tenant project-management web app — faithful to the design's visuals and six views, on a maintainable stack the user can keep extending.

## Non-Goals (v1)

- No custom API server. v1 is client + Supabase BaaS only. Plain Postgres underneath is the escape hatch if a server is needed later.
- Not hosting the `.dc.html` prototype as-is.
- Status / priority / type / tag taxonomies are NOT user-editable in v1 — they are fixed client constants.
- No native mobile app; responsive web only.

## Architecture

**Stack**

- Client: Vite + React + TypeScript, Tailwind CSS, React Router.
- Backend: Supabase full-BaaS — Postgres + Auth + Realtime + Row-Level Security.
- Server cache / data flow: TanStack Query + Supabase Realtime subscriptions.
- Drag-and-drop: native HTML5 DnD (no library — the design already uses native drag events).
- Toasts: `sonner`.

**Layering**

- `supabase-js` is wrapped behind a thin `data/` repository layer. Views and features never import the Supabase client directly — keeps it swappable and gives one place to type/validate I/O.
- Themes (Bloom default, Slate) are CSS-variable sets; Tailwind consumes them via arbitrary values (`bg-[var(--surface)]`, `text-[var(--text)]`). Theme hexes are never hard-coded into utilities.

**Repo layout**

```
src/
  lib/        supabase client, theme, queryClient, shared hooks
  data/       repositories (one per aggregate) — the only Supabase consumers
  types/      generated DB types + domain constants
  components/ shared UI
  features/   listView, boardView, ganttView, timelineView, activityView, workloadView
  app/        AuthGate, Shell (Sidebar / Header / Toolbar), routes
supabase/
  migrations/ schema + RLS + triggers
  seed.sql    Northwind demo workspace
  config.toml
```

## Data Model (Postgres)

All tables under RLS, scoped by workspace membership.

```
profiles(id → auth.users, name, color)                      -- trigger-created on signup
workspaces(id, name, created_by)
workspace_members(workspace_id, user_id, role[owner|admin|member],
                  capacity_per_week, color, PK(workspace_id, user_id))
projects(id, workspace_id, name, key 'NIM', color)
tasks(id, project_id, workspace_id, ref 'NIM-101', type, title, description,
      status, priority, assignee_id, start_date, end_date, points, position,
      created_by, created_at, updated_at)
subtasks(id, task_id, title, done, position)
task_tags(task_id, tag, PK(task_id, tag))
comments(id, task_id, author_id, body, created_at)
activity(id, workspace_id, actor_id, task_id, verb[created|moved|assigned|commented],
         from_status, to_status, comment_id, created_at)
```

**Enums**: `task_status`, `task_priority`, `task_type`, `member_role`.

**Denormalization**: `workspace_id` is denormalized onto `tasks` and `activity` so RLS is a single-hop lookup. Kept consistent via FK + a trigger that derives it from `project_id` on insert/update (the app never sets it directly).

**Ordering**: `position` columns (`tasks`, `subtasks`) hold fractional/sequence ranks for manual ordering and Board column placement.

## Auth & RLS

- Real auth from day one: email/password + Google + GitHub OAuth.
- On signup, a trigger creates the `profiles` row and auto-joins the user to the seeded "Northwind" demo workspace as a `member`.
- RLS pattern — one-hop via denormalized `workspace_id`:
  ```sql
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
  ```
- Child tables (`subtasks`, `comments`, `task_tags`) authorize via their parent task's workspace.
- Role gates (owner / admin / member) enforced in policies where they matter — e.g. only owner/admin may delete a project or remove a member.

## Domain Constants (client-side, not DB tables)

Fixed taxonomies matching the design; kept as typed client constants to keep the schema lean. Enum *values* live in Postgres; their labels/colors/shapes live here.

```ts
// Statuses (ordered)
[{id:'backlog',     label:'Backlog',     color:'#9aa0ad'},
 {id:'todo',        label:'To Do',       color:'#4f86f7'},
 {id:'in_progress', label:'In Progress', color:'#f5a623'},
 {id:'in_review',   label:'In Review',   color:'#a06bf0'},
 {id:'done',        label:'Done',        color:'#2bb673'}]

// Priorities (ranked)
[{id:'urgent', label:'Urgent', color:'#e5484d', rank:4},
 {id:'high',   label:'High',   color:'#f2820a', rank:3},
 {id:'medium', label:'Medium', color:'#d9a118', rank:2},
 {id:'low',    label:'Low',    color:'#8a93a6', rank:1}]

// Task types
{feature:    {label:'Feature',     color:'#6d5ef0', shape:'square'},
 bug:        {label:'Bug',         color:'#e5484d', shape:'circle'},
 chore:      {label:'Chore',       color:'#8a93a6', shape:'line'},
 improvement:{label:'Improvement', color:'#14b8a6', shape:'triangle'}}

// Tag colors (fixed map): Frontend #3b82f6, Backend #22a06b, API #14b8a6,
//                         Design #8b5cf6, Mobile #ef6b53, ...
// Themes: 'bloom' (default) and 'slate' — CSS-variable sets
//   (--primary, --bg, --surface, --border, --text, --muted, --faint, ...)
```

## Task Shape

```
task = { id:'NIM-101', type, title, status, priority, assignee(memberId),
         tags:string[], start, end, points, description, subtasks:[{done}] }
// progress      = subtasks done / total
// Gantt/Timeline = bars from start/end
// Workload       = Σ points per assignee per week vs capacity_per_week
```

## Views (all six in v1)

1. **List** — grouped, sortable table of tasks; inline status / priority / assignee.
2. **Board** — Kanban columns by status; native DnD to move a card (writes `status` + an `activity` row).
3. **Gantt** — bars positioned from `start_date`/`end_date` across a time axis.
4. **Timeline** — chronological lane view of tasks.
5. **Activity** — workspace feed rendered from the `activity` table.
6. **Workload** — Σ points per assignee per week vs `capacity_per_week`.

A shared **task drawer** (detail panel) and a **filter/sort toolbar** are reused across all views.

## State, Data Flow & Realtime

- TanStack Query owns the server cache. Mutations are optimistic; Supabase Realtime subscriptions reconcile live changes from other clients (last-write-wins on the reconciled row).
- Repositories in `data/` expose typed query/mutation functions; hooks in `lib/` wrap them with TanStack Query and own cache keys + invalidation.
- View + selected task live in the URL (`?view=board&task=NIM-101`) so state is shareable/bookmarkable. Theme persisted to `localStorage`.

## Error Handling

- The repository layer surfaces Supabase errors as typed results; hooks map them to `sonner` toasts.
- Optimistic mutations roll back the cache on error and re-toast.
- `AuthGate` redirects unauthenticated users to `/login`; RLS denials surface as a non-destructive "you don't have access" toast rather than a crash.

## Testing

- **Unit (Vitest)** — domain logic with no I/O: workload aggregation (Σ points/assignee/week vs capacity), task progress (subtasks done/total), sort/filter predicates, `ref` generation, `position` ranking. Repository functions tested against a mocked `supabase-js`.
- **Component (Vitest + React Testing Library)** — each view renders from fixture data; Board DnD moves a card and fires the status mutation; task drawer edits round-trip through the repo layer.
- **RLS / policy (SQL against local Supabase)** — a member of workspace A cannot read or write workspace B's tasks, subtasks, comments, or tags; role gates (member cannot delete a project) hold. Run via the Supabase local db test harness / pgTAP.
- **E2E** — deferred for v1 (YAGNI); revisit once flows stabilize.

## Design Process Note

All design / UI work on this app uses the **impeccable** skill (user directive, 2026-06-26). This supersedes the generic `frontend-design` path. Process skills (brainstorming → writing-plans) still run first.

## Build Order

1. **Scaffold** — Vite/TS/Tailwind + Supabase schema/RLS/seed/generated types + Auth + Shell.
2. **List** view.
3. **Board** view (+ native DnD + activity writes).
4. **Activity** view.
5. **Gantt + Timeline**.
6. **Workload**.
7. **Task drawer + filters/sort**.

Run `/init` to create CLAUDE.md once real code exists.

## Stated Defaults (all changeable)

TanStack Query · native HTML5 DnD · `sonner` toasts · Google + GitHub OAuth · React Router (`/login` + app) · new signups auto-join the seeded "Northwind" workspace · view/selected-task in URL · theme in `localStorage`.

## Setup Required (implementation phase)

- Node + npm; Supabase CLI (+ Docker for local `supabase start`).
- A Supabase project; env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Configure Google + GitHub OAuth providers.
- DesignSync MCP access (auth via `/design-login`) to re-read the source design.

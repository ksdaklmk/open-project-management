# Activity View — Design Spec

**Date**: 2026-06-27
**Extends**: `docs/superpowers/specs/2026-06-26-project-management-design.md` (master spec, view #5: "workspace feed rendered from the `activity` table")
**Status**: Approved — ready for implementation plan.

## Goal

Render the workspace `activity` feed: a flat, newest-first list of what happened. Today only `verb='moved'` rows exist (written by Board drops and List status edits via the shared `useMoveTask`); the row renderer switches on `verb` so future verbs (`assigned`, `commented`, `created`) slot in as one-liners later.

This view mirrors the established List/Board structure — repo reader → TanStack Query read hook → view component with loading/error/empty states — so it is small and low-risk.

## Data model (existing — no schema change)

`activity` row (`src/types/database.ts`, generated): `id, workspace_id, actor_id, task_id, comment_id, verb, from_status, to_status, created_at`.

- **actor** → `profiles` (`id, name, color`) — display name + avatar color.
- **task** → `tasks` (`ref` e.g. `NIM-101`, `title`).
- RLS already policies the `activity` table (member-scoped read). This view **only reads** — no new table, no new policy, no migration, no type regeneration.

## Components

### 1. Data — `activityRepo.listActivity(workspaceId)`

Added to the existing `src/data/activityRepo.ts` (alongside `logMove`). Per the architecture rule, `src/data/` is the only place that may import the Supabase client; `src/architecture.test.ts` enforces this and must stay green.

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

export async function listActivity(workspaceId: string): Promise<ActivityItem[]>
```

Query shape:
```
from('activity')
  .select('id, verb, from_status, to_status, created_at,
           actor:profiles!actor_id(name,color), task:tasks!task_id(ref,title)')
  .eq('workspace_id', workspaceId)
  .order('created_at', { ascending: false })
  .limit(100)
```

- Newest-first, **capped at 100**. `ponytail:` no pagination UI in v1 — add "Load more" / infinite scroll only when a real workspace exceeds the cap.
- `actor` / `task` are nullable (the columns are nullable; a deleted task or system actor yields `null`) — the row renderer degrades gracefully.
- **Implementation must verify the embed**: confirm `activity.actor_id` embeds `profiles` directly via PostgREST (`actor:profiles!actor_id`). If the FK targets `auth.users` rather than `profiles` and won't embed, resolve the actor the way `membersRepo` does (through `workspace_members` / a `profiles` join). The first impl task confirms against the live schema before building UI on top.

### 2. Read hook — `useActivity(workspaceId)`

`src/lib/hooks/useActivity.ts`, mirroring `useMembers`:
```ts
useQuery({ queryKey: ['activity', workspaceId], queryFn: () => listActivity(workspaceId), enabled: !!workspaceId })
```
`useMoveTask` already invalidates `['activity', ws]` on a successful move, so a Board drop or List status edit refreshes the feed without extra wiring.

### 3. View — `src/features/activityView/ActivityView.tsx`

Consumes `useActiveWorkspace()` (for `activeId` + `loading`) and `useActivity(activeId ?? '')`. States, matching Board/List conventions:

- **Loading** (`wsLoading || isLoading`): skeleton list, `role=status` / `aria-busy`, `sr-only` "Loading activity…".
- **Error**: `role=alert`, themed icon + "Couldn't load activity." message (same shape as `BoardError`).
- **Empty** (`items.length === 0`): centered empty state — "No activity yet" with a hint like "Move a card on the Board to start the feed."
- **Loaded**: a flat `<ol>` of `ActivityRow`, newest-first.

All styling via theme CSS variables (`var(--surface)`, `var(--text)`, `var(--muted)`, `var(--border)`) — no hard-coded theme hexes. Status-chip colors come from the `STATUSES` constant (those hexes are taxonomy data, not theme tokens).

### 4. Row — `src/features/activityView/ActivityRow.tsx`

Switches on `item.verb`:

- **`'moved'`** (v1): actor avatar (initial on `profile.color`) · "**{actor.name}** moved" · `{task.ref} · {task.title}` · `[from_status] → [to_status]` rendered as small status chips reusing `STATUSES` label + color · relative timestamp (right-aligned, `title` attr = absolute time).
- **Unknown verb**: minimal text fallback (`"{actor.name} {verb}"` + relative time) so a future verb never crashes the feed before its renderer exists.
- **Null actor/task**: fall back to "Someone" / the raw ref or "a task" — never throw.

`ponytail:` the status chip may duplicate status rendering already present in List (`cells.tsx`) and Board (`TaskCard`). Reuse an existing chip if one is cleanly importable; otherwise keep a small local chip and extract a shared `StatusChip` later (same call as the deferred shared `TypeMark`). Not a blocker for v1.

### 5. Relative time — `src/lib/relativeTime.ts`

A small helper using `Intl.RelativeTimeFormat` (native — `ponytail:` no date dependency added for this). Picks the largest sensible unit (just now / Nm / Nh / Nd / then a date). One unit test covering the unit thresholds.

### 6. Mount — `src/app/Shell.tsx`

Extend the view switch: `view === 'activity' ? <ActivityView /> : …`, replacing the current `"activity view — coming next."` placeholder. Import `ActivityView`. (Shell test already mocks views per the established pattern.)

## Data flow

```
Board drop / List status edit
  → useMoveTask: updateTask(status,position) + logMove(verb='moved')   [best-effort log]
  → invalidates ['tasks', ws] AND ['activity', ws]
ActivityView → useActivity(ws) → listActivity(ws) → activity ⋈ profiles ⋈ tasks (newest 100)
  → ActivityRow per item (switch on verb)
```

## Error handling

- Repo throws on Supabase error (`new Error(error.message)`) — consistent with the other repos; the hook surfaces it as `error` and the view shows the error state.
- Activity logging remains **best-effort** upstream (a `logMove` failure does not roll back the move, per the Board spec); the feed simply won't show that one row. Unchanged by this view.
- Render-time null safety: nullable `actor` / `task` / unknown `verb` all degrade to readable fallbacks rather than throwing.

## Testing

- **`activityRepo.test.ts`**: extend with `listActivity` — assert the `select` projection, `.eq('workspace_id', …)`, `.order('created_at', {ascending:false})`, `.limit(100)`, and the row→`ActivityItem` mapping (incl. null actor/task). Same mock style as the existing repo tests.
- **`ActivityView.test.tsx`**: loading, error, empty, and loaded-list states via RTL with `useActivity` + `useActiveWorkspace` mocked (established view-test pattern); assert a `'moved'` row shows actor name, ref, and both status labels; assert role queries for status/alert.
- **`relativeTime.test.ts`**: unit test the unit thresholds (just now / minutes / hours / days / date).
- **`architecture.test.ts`**: must stay green — Supabase import confined to `activityRepo`.
- **Impeccable visual pass + browser smoke** (Bloom + Slate) as the final task, per the per-view convention.

## Out of scope (v1 — deferred)

- Verbs other than `'moved'` (renderer is ready; no rows exist yet).
- Pagination / infinite scroll (100-row cap until a real workspace needs more).
- Filtering by actor/task, and per-task activity (that belongs to the future task drawer).
- Row → task-drawer navigation (nothing consumes `?task=` yet; wire when the drawer lands).
- Realtime (folded into the shared cross-view Realtime pass, not this view).

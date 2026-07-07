# Make It Adoptable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the demo into a tool a real team can adopt: task create/delete in the UI, name capture at signup, UUID-pinned demo auto-join, a zero-workspace empty state, and an admin-by-SQL runbook.

**Architecture:** New `projectsRepo` + `createTask`/`deleteTask` behind the enforced supabase boundary; `useCreateTask`/`useDeleteTask`/`useProjects` TanStack hooks; a "+ New task" flow in the shared Toolbar that opens the existing TaskDrawer on the created ref; a two-step delete confirm in the drawer footer; one migration (`0004`) hardening `handle_new_user`. Spec: `docs/superpowers/specs/2026-07-07-make-it-adoptable-design.md`.

**Tech Stack:** Vite + React + TS, TanStack Query, Supabase (Postgres/RLS on Podman), Vitest + RTL, pgTAP.

## Global Constraints

- **UK English** in all user-facing copy; code/CSS/DB identifiers stay standard.
- **Type-check with `npm run build`** (`tsc -b && vite build`) — bare `tsc` checks nothing in this repo.
- `tsconfig.app.json` type-checks **test files** with `noUnusedLocals` — every destructured mock must be referenced.
- `@supabase/supabase-js` / the `supabase` client only in `src/lib/supabase.ts` + `src/data/` (+ carve-outs `src/lib/hooks/useSession.ts`, `src/app/LoginPage.tsx`) — `src/architecture.test.ts` fails the suite otherwise. Importing **types** from `data/` modules elsewhere is fine (established pattern).
- Style with theme tokens (`var(--text)`, `var(--muted)`, `var(--border)`, `var(--surface)`, `var(--bg)`) and the `opm-btn` / `opm-input` utility classes. **No hard-coded theme hexes. There is no danger/red token** — destructive copy uses `--text`.
- No new dependencies.
- Supabase local runs on **Podman**: `supabase start`/`db reset` hang. Use `supabase migration up` + `podman exec -i supabase_db_open-project-management psql -U postgres -d postgres`. Re-derive per shell: `export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"`.
- Migrations are append-only. `0004` replaces a **function only** (no table/column changes) → **no** `supabase gen types` regeneration needed.
- Git: branch `feat/make-it-adoptable` off `main`; **scoped `git add` (never `-A`)**; commit per task; end every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; `--ff-only` merge to `main` at the end (user confirms the ship).
- Only Task 1 needs the local DB stack. Tasks 2–6 are pure unit work (the suite mocks `supabase-js`); Task 7's browser smoke needs the stack + `npm run dev`.

**Setup (once):**

```bash
git checkout main && git pull && git checkout -b feat/make-it-adoptable
```

---

### Task 1: Migration `0004_adoption.sql` + pgTAP coverage

Hardens `handle_new_user` (OAuth name variants; auto-join pinned to the seed UUID) and backfills pgTAP coverage for the task delete policy.

**Files:**
- Create: `supabase/migrations/0004_adoption.sql`
- Modify: `supabase/tests/rls_test.sql` (plan count line 22; append tests before `finish()`)

**Interfaces:**
- Produces: hardened `handle_new_user()` (DB trigger function). Nothing in `src/` depends on it at compile time; Task 6's LoginPage relies on it reading `raw_user_meta_data->>'name'` at runtime (it already does).

- [ ] **Step 1: Bring up the local DB**

```bash
export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
podman machine start   # ok if "already running"
podman start supabase_db_open-project-management
```

Expected: container name echoed. (Only the DB container is needed for pgTAP.)

- [ ] **Step 2: Write the failing pgTAP tests**

In `supabase/tests/rls_test.sql`, change line 22 `select plan(29);` → `select plan(34);`, then insert the following **immediately before** `select * from finish();` (line 317):

```sql
-- ---------------------------------------------------------------------------
-- Task delete policy (make-it-adoptable): members delete inside their own
-- workspace; cross-workspace deletes are RLS-filtered to no-ops. Coverage
-- backfill — the policy shipped in 0002 but was never asserted.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-00000000000a','role','authenticated')::text,
  true);
with del as (
  delete from tasks where id = '00000000-0000-0000-0000-0000000000b3' returning 1)
select is(
  (select count(*)::int from del), 0,
  'A cannot delete a WS-B task (RLS-filtered no-op)');
with del as (
  delete from tasks where id = '00000000-0000-0000-0000-0000000000a3' returning 1)
select is(
  (select count(*)::int from del), 1,
  'A can delete a task in its own workspace (task_delete is not deny-all)');

-- ---------------------------------------------------------------------------
-- handle_new_user (0004): name coalesces OAuth metadata variants; the demo
-- auto-join is pinned to the seed workspace UUID, so a workspace merely NAMED
-- 'Northwind' attracts nothing. The demo row is ensured here (idempotent
-- whether or not seed.sql ran); the decoy shares only the name.
-- ---------------------------------------------------------------------------
set local role postgres;
insert into workspaces (id, name, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'Northwind', null)
  on conflict (id) do nothing;
insert into workspaces (id, name, created_by) values
  ('00000000-0000-0000-0000-0000000000d1', 'Northwind', null);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'd@test.dev',
   '{"full_name": "Dee Fixture"}'::jsonb);

select is(
  (select name from profiles where id = '00000000-0000-0000-0000-00000000000d'),
  'Dee Fixture',
  'handle_new_user coalesces full_name into profiles.name (OAuth variance)');
select is(
  (select count(*) from workspace_members
   where user_id = '00000000-0000-0000-0000-00000000000d'
     and workspace_id = '20000000-0000-0000-0000-000000000001')::int, 1,
  'new signup auto-joins the demo workspace by fixed UUID');
select is(
  (select count(*) from workspace_members
   where user_id = '00000000-0000-0000-0000-00000000000d'
     and workspace_id = '00000000-0000-0000-0000-0000000000d1')::int, 0,
  'a workspace merely named Northwind attracts no auto-joins');
```

Placement notes: the delete tests re-impersonate A after the member-C section; deleting `a3` is safe because every earlier test that uses its children (`a4`, `a5`) has already run, and the whole file rolls back. The trigger tests run as `postgres` because they insert into `auth.users`.

- [ ] **Step 3: Run pgTAP to verify it fails**

```bash
podman exec -i supabase_db_open-project-management psql -U postgres -d postgres \
  < supabase/tests/rls_test.sql
```

Expected: `not ok 32 - handle_new_user coalesces full_name…` (old function reads only `->>'name'` → name is `''`). Tests 30–31 (deletes) pass — they're coverage backfill. Tests 33–34 may pass or fail nondeterministically (old function picks one of two 'Northwind' rows via `limit 1`); test 32 is the deterministic RED.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/0004_adoption.sql`:

```sql
-- Adoption hardening (spec: docs/superpowers/specs/2026-07-07-make-it-adoptable-design.md)
--   1. Name: coalesce across OAuth metadata variants (Google sets `name`;
--      GitHub sets `full_name`/`user_name`; email+password signups pass
--      options.data.name or nothing). nullif() so an empty '' from one
--      provider key does not shadow a real value in the next.
--   2. Demo auto-join: pinned to the seeded demo workspace's fixed UUID
--      instead of name = 'Northwind'. Local dev (seeded) keeps the
--      convenience; production is never demo-seeded so this silently
--      no-ops; a real workspace named "Northwind" attracts nothing.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare demo uuid;
begin
  insert into public.profiles (id, name)
    values (new.id, coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'user_name', ''),
      ''));
  select id into demo from public.workspaces
    where id = '20000000-0000-0000-0000-000000000001';
  if demo is not null then
    insert into public.workspace_members (workspace_id, user_id) values (demo, new.id);
  end if;
  return new;
end; $$;
```

(The `on_auth_user_created` trigger from `0002` keeps pointing at the replaced function — no trigger DDL needed.)

- [ ] **Step 5: Apply and verify green**

```bash
supabase migration up
podman exec -i supabase_db_open-project-management psql -U postgres -d postgres \
  < supabase/tests/rls_test.sql
```

Expected: `ok 1` … `ok 34`, ending `1..34` with no `not ok` lines.

- [ ] **Step 6: Run the unit suite (guard against collateral)**

```bash
npm run test
```

Expected: 164/164 pass (nothing in `src/` changed yet).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0004_adoption.sql supabase/tests/rls_test.sql
git commit -m "feat(db): pin demo auto-join to seed UUID; coalesce OAuth name variants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `projectsRepo.listProjects` + `useProjects`

**Files:**
- Create: `src/data/projectsRepo.ts`
- Create: `src/data/projectsRepo.test.ts`
- Create: `src/lib/hooks/useProjects.ts`

**Interfaces:**
- Produces: `interface ProjectOption { id: string; name: string; key: string }`; `listProjects(workspaceId: string): Promise<ProjectOption[]>`; `useProjects(workspaceId: string)` → TanStack query keyed `['projects', workspaceId]`, `enabled: !!workspaceId`. Tasks 3–4 consume `ProjectOption` and `useProjects`.

- [ ] **Step 1: Write the failing test**

Create `src/data/projectsRepo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { order, eq, select, from } = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { order, eq, select, from }
})

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { listProjects } from './projectsRepo'

beforeEach(() => vi.clearAllMocks())

describe('projectsRepo', () => {
  it('lists id/name/key for a workspace, ordered by name', async () => {
    order.mockResolvedValueOnce({
      data: [{ id: 'p1', name: 'Nimbus', key: 'NIM' }],
      error: null,
    })
    const projects = await listProjects('ws-1')
    expect(from).toHaveBeenCalledWith('projects')
    expect(select).toHaveBeenCalledWith('id, name, key')
    expect(eq).toHaveBeenCalledWith('workspace_id', 'ws-1')
    expect(order).toHaveBeenCalledWith('name')
    expect(projects).toEqual([{ id: 'p1', name: 'Nimbus', key: 'NIM' }])
  })

  it('defaults to [] and throws on error', async () => {
    order.mockResolvedValueOnce({ data: null, error: null })
    expect(await listProjects('ws-1')).toEqual([])
    order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(listProjects('ws-1')).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/data/projectsRepo.test.ts
```

Expected: FAIL — `Cannot find module './projectsRepo'` (or equivalent resolve error).

- [ ] **Step 3: Implement the repo**

Create `src/data/projectsRepo.ts`:

```ts
import { supabase } from '../lib/supabase'

export interface ProjectOption {
  id: string
  name: string
  key: string
}

export async function listProjects(workspaceId: string): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, key')
    .eq('workspace_id', workspaceId)
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/data/projectsRepo.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Add the hook** (no test — matches the `useTasks`/`useWorkspaces` convention for plain queries)

Create `src/lib/hooks/useProjects.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { listProjects } from '../../data/projectsRepo'

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => listProjects(workspaceId),
    enabled: !!workspaceId,
  })
}
```

- [ ] **Step 6: Full gate + commit**

```bash
npm run test && npm run build
git add src/data/projectsRepo.ts src/data/projectsRepo.test.ts src/lib/hooks/useProjects.ts
git commit -m "feat(data): projectsRepo.listProjects + useProjects

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: 166 tests pass; build clean.

---

### Task 3: `nextRef` + `createTask` + `logCreate` + `useCreateTask`

**Files:**
- Modify: `src/data/tasksRepo.ts` (append `nextRef`, `CreateTaskInput`, `createTask`)
- Modify: `src/data/tasksRepo.test.ts` (replace the hoisted mock block; add tests)
- Modify: `src/data/activityRepo.ts` (append `logCreate`)
- Modify: `src/data/activityRepo.test.ts` (add `logCreate` test mirroring the existing `logComment` one)
- Create: `src/lib/hooks/useCreateTask.ts`
- Create: `src/lib/hooks/useCreateTask.test.ts`

**Interfaces:**
- Consumes: `ProjectOption` from Task 2.
- Produces:
  - `nextRef(refs: string[], key: string): string`
  - `createTask(input: CreateTaskInput): Promise<Task>` where `CreateTaskInput = { workspaceId: string; projectId: string; projectKey: string; title: string; createdBy: string }`
  - `logCreate(params: { workspaceId: string; actorId: string; taskId: string }): Promise<void>`
  - `useCreateTask(workspaceId: string)` → mutation; `mutate({ title: string; project: ProjectOption })`, resolves the created `Task`. Task 4 consumes the hook.

- [ ] **Step 1: Write the failing `nextRef` + `createTask` tests**

In `src/data/tasksRepo.test.ts`, **replace the whole `vi.hoisted` block (lines 3–16)** with this superset — `eq`, `insert`, and `delEq1` become thenables so single-`await` chains (`select('ref').eq(…)`, bare `insert(…)`, `delete().eq(…)`) resolve while longer chains still compose (Supabase builders are thenables, so this mirrors reality):

```ts
const { order, eq, select: _select, update, updateEq, insert, insertSelect, insertSingle, del, delEq1, delEq2, from } =
  vi.hoisted(() => {
    const order = vi.fn()
    const eq = vi.fn(() =>
      Object.assign(Promise.resolve({ data: [], error: null }), { order }))
    const select = vi.fn(() => ({ eq }))
    const updateEq = vi.fn(() => Promise.resolve({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    const insertSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    const insertSelect = vi.fn(() => ({ single: insertSingle }))
    const insert = vi.fn(() =>
      Object.assign(Promise.resolve({ error: null }), { select: insertSelect }))
    const delEq2 = vi.fn(() => Promise.resolve({ error: null }))
    const delEq1 = vi.fn(() =>
      Object.assign(Promise.resolve({ error: null }), { eq: delEq2 }))
    const del = vi.fn(() => ({ eq: delEq1 }))
    const from = vi.fn(() => ({ select, update, insert, delete: del }))
    return { order, eq, select, update, updateEq, insert, insertSelect, insertSingle, del, delEq1, delEq2, from }
  })
```

Update the import line to include the new exports, and append the new tests inside the `describe`:

```ts
import { listTasks, updateTask, addTaskTag, removeTaskTag, nextRef, createTask } from './tasksRepo'
```

```ts
  describe('nextRef', () => {
    it.each([
      [[], 'NIM', 'NIM-101'],                                   // empty project → seed convention
      [['NIM-101', 'NIM-104'], 'NIM', 'NIM-105'],               // gaps: max + 1, not count
      [['NIM-101', 'NIM-abc', 'OTHER-900'], 'NIM', 'NIM-102'],  // non-numeric + other keys ignored
      [['NIM-9'], 'NIM', 'NIM-101'],                            // below the floor → still 101
    ])('%j + %s → %s', (refs, key, expected) => {
      expect(nextRef(refs as string[], key as string)).toBe(expected)
    })
  })

  const CREATE_INPUT = {
    workspaceId: 'ws-1', projectId: 'p1', projectKey: 'NIM',
    title: 'New thing', createdBy: 'u1',
  }
  const ROW = {
    id: 't9', ref: 'NIM-103', title: 'New thing', workspace_id: 'ws-1',
    project_id: 'p1', created_by: 'u1', status: 'backlog', priority: 'medium',
  }

  it('creates a task with the next ref and returns it with empty tags', async () => {
    eq.mockImplementationOnce(() =>
      Object.assign(Promise.resolve({ data: [{ ref: 'NIM-101' }, { ref: 'NIM-102' }], error: null }), { order }))
    insertSingle.mockResolvedValueOnce({ data: ROW, error: null })
    const task = await createTask(CREATE_INPUT)
    expect(_select).toHaveBeenCalledWith('ref')
    expect(eq).toHaveBeenCalledWith('project_id', 'p1')
    expect(insert).toHaveBeenCalledWith({
      workspace_id: 'ws-1', project_id: 'p1', ref: 'NIM-103',
      title: 'New thing', created_by: 'u1',
    })
    expect(task.tags).toEqual([])
    expect(task.ref).toBe('NIM-103')
  })

  it('retries exactly once on a 23505 ref race, with a recomputed ref', async () => {
    eq.mockImplementationOnce(() =>
        Object.assign(Promise.resolve({ data: [{ ref: 'NIM-102' }], error: null }), { order }))
      .mockImplementationOnce(() =>
        Object.assign(Promise.resolve({ data: [{ ref: 'NIM-102' }, { ref: 'NIM-103' }], error: null }), { order }))
    insertSingle
      .mockResolvedValueOnce({ data: null, error: { message: 'duplicate key', code: '23505' } })
      .mockResolvedValueOnce({ data: { ...ROW, ref: 'NIM-104' }, error: null })
    const task = await createTask(CREATE_INPUT)
    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert).toHaveBeenNthCalledWith(1, expect.objectContaining({ ref: 'NIM-103' }))
    expect(insert).toHaveBeenNthCalledWith(2, expect.objectContaining({ ref: 'NIM-104' }))
    expect(task.ref).toBe('NIM-104')
  })

  it('does NOT retry non-23505 insert errors', async () => {
    insertSingle.mockResolvedValueOnce({ data: null, error: { message: 'permission denied', code: '42501' } })
    await expect(createTask(CREATE_INPUT)).rejects.toThrow('permission denied')
    expect(insert).toHaveBeenCalledTimes(1)
  })
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/data/tasksRepo.test.ts
```

Expected: FAIL — `nextRef`/`createTask` are not exported. The six pre-existing tests must still pass (the thenable mocks are supersets); if any of them broke, fix the mock block, not the tests.

- [ ] **Step 3: Implement in `tasksRepo.ts`** (append after `removeTaskTag`)

```ts
// ponytail: client-side ref numbering — reads fresh refs per attempt and
// retries once on a unique-violation race. Ceiling: two same-instant creates
// can still collide twice; upgrade is a DB-side counter RPC (pair it with the
// atomic-move RPC when that lands).
export function nextRef(refs: string[], key: string): string {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${esc}-(\\d+)$`)
  let max = 100 // seed convention: a project's first ref is KEY-101
  for (const r of refs) {
    const m = re.exec(r)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${key}-${max + 1}`
}

export interface CreateTaskInput {
  workspaceId: string
  projectId: string
  projectKey: string
  title: string
  createdBy: string
}

async function insertWithNextRef(input: CreateTaskInput): Promise<Task> {
  const { data: refRows, error: refError } = await supabase
    .from('tasks')
    .select('ref')
    .eq('project_id', input.projectId)
  if (refError) throw new Error(refError.message)
  const ref = nextRef((refRows ?? []).map((r) => r.ref), input.projectKey)
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      ref,
      title: input.title,
      created_by: input.createdBy,
    })
    .select()
    .single()
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return { ...(data as Database['public']['Tables']['tasks']['Row']), tags: [] }
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  try {
    return await insertWithNextRef(input)
  } catch (e) {
    if ((e as { code?: string }).code !== '23505') throw e
    return await insertWithNextRef(input)
  }
}
```

- [ ] **Step 4: Run to verify green**

```bash
npx vitest run src/data/tasksRepo.test.ts
```

Expected: all pass (6 old + 4 `nextRef` rows + 3 `createTask`).

- [ ] **Step 5: `logCreate` — failing test, then implementation**

In `src/data/activityRepo.test.ts`, find the existing `logComment` test and add a sibling (reuse that file's existing mocks — same shape as `logMove`/`logComment`, which insert into `from('activity')`):

```ts
  it('logs a created activity row', async () => {
    await logCreate({ workspaceId: 'w1', actorId: 'u1', taskId: 't1' })
    expect(from).toHaveBeenCalledWith('activity')
    expect(insert).toHaveBeenCalledWith({
      workspace_id: 'w1', actor_id: 'u1', task_id: 't1', verb: 'created',
    })
  })
```

Add `logCreate` to that file's import from `./activityRepo`. Run `npx vitest run src/data/activityRepo.test.ts` → FAIL (not exported). Then append to `src/data/activityRepo.ts` after `logComment`:

```ts
export async function logCreate(params: {
  workspaceId: string
  actorId: string
  taskId: string
}): Promise<void> {
  const { error } = await supabase.from('activity').insert({
    workspace_id: params.workspaceId,
    actor_id: params.actorId,
    task_id: params.taskId,
    verb: 'created',
  })
  if (error) throw new Error(error.message)
}
```

Re-run → PASS.

- [ ] **Step 6: `useCreateTask` — failing test**

Create `src/lib/hooks/useCreateTask.test.ts` (mirrors `useMoveTask.test.ts` idiom):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { createTask, logCreate } = vi.hoisted(() => ({ createTask: vi.fn(), logCreate: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({ createTask }))
vi.mock('../../data/activityRepo', () => ({ logCreate }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('./useSession', () => ({ useSession: () => ({ session: { user: { id: 'u1' } } }) }))

import { useCreateTask } from './useCreateTask'
import { toast } from 'sonner'

const ws = 'w1'
const project = { id: 'p1', name: 'Nimbus', key: 'NIM' }
const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useCreateTask', () => {
  it('creates with the session uid pinned, logs activity, and invalidates both caches', async () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    createTask.mockResolvedValueOnce({ id: 't9', ref: 'NIM-107', tags: [] })
    logCreate.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useCreateTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ title: 'New thing', project })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(createTask).toHaveBeenCalledWith({
      workspaceId: ws, projectId: 'p1', projectKey: 'NIM',
      title: 'New thing', createdBy: 'u1',
    })
    expect(logCreate).toHaveBeenCalledWith({ workspaceId: ws, actorId: 'u1', taskId: 't9' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', ws] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activity', ws] })
  })

  it('keeps the created task when logCreate rejects — toasts, still succeeds', async () => {
    const qc = new QueryClient()
    createTask.mockResolvedValueOnce({ id: 't9', ref: 'NIM-107', tags: [] })
    logCreate.mockRejectedValueOnce(new Error('activity down'))
    const { result } = renderHook(() => useCreateTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ title: 'New thing', project })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("wasn't logged"))
  })

  it('toasts on create failure', async () => {
    const qc = new QueryClient()
    createTask.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useCreateTask(ws), { wrapper: wrap(qc) })
    result.current.mutate({ title: 'New thing', project })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('nope'))
    expect(logCreate).not.toHaveBeenCalled()
  })
})
```

Run `npx vitest run src/lib/hooks/useCreateTask.test.ts` → FAIL (module missing).

- [ ] **Step 7: Implement the hook**

Create `src/lib/hooks/useCreateTask.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createTask } from '../../data/tasksRepo'
import { logCreate } from '../../data/activityRepo'
import type { ProjectOption } from '../../data/projectsRepo'
import { useSession } from './useSession'

export function useCreateTask(workspaceId: string) {
  const qc = useQueryClient()
  const { session } = useSession()
  return useMutation({
    mutationFn: async ({ title, project }: { title: string; project: ProjectOption }) => {
      const actorId = session?.user.id ?? ''
      const task = await createTask({
        workspaceId,
        projectId: project.id,
        projectKey: project.key,
        title,
        createdBy: actorId,
      })
      try {
        await logCreate({ workspaceId, actorId, taskId: task.id })
      } catch (e) {
        toast.error(`Task created, but activity wasn't logged: ${(e as Error).message}`)
      }
      return task
    },
    onError: (e) => toast.error(`Couldn't create task: ${(e as Error).message}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
    },
  })
}
```

- [ ] **Step 8: Full gate + commit**

```bash
npm run test && npm run build
git add src/data/tasksRepo.ts src/data/tasksRepo.test.ts src/data/activityRepo.ts \
  src/data/activityRepo.test.ts src/lib/hooks/useCreateTask.ts src/lib/hooks/useCreateTask.test.ts
git commit -m "feat(data): createTask with client ref numbering + created-activity log

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: ~177 tests pass; build clean.

---

### Task 4: Toolbar "+ New task" → drawer

**Files:**
- Modify: `src/features/toolbar/Toolbar.tsx`
- Modify: `src/features/toolbar/Toolbar.test.tsx`

**Interfaces:**
- Consumes: `useProjects` (Task 2), `useCreateTask` (Task 3), existing `useViewState().setTaskRef` and `useActiveWorkspace()`.
- Produces: UI only — no new exports.

- [ ] **Step 1: Write the failing tests**

In `src/features/toolbar/Toolbar.test.tsx`, add hoisted holders + mocks after the existing `vi.mock` lines (module-scope holders read at call time — the established idiom):

```ts
import { act } from '@testing-library/react'   // extend the existing @testing-library/react import

const projects = {
  data: [{ id: 'p1', name: 'Nimbus', key: 'NIM' }] as
    { id: string; name: string; key: string }[] | undefined,
}
const createMutate = vi.fn()
vi.mock('../../lib/hooks/useProjects', () => ({ useProjects: () => projects }))
vi.mock('../../lib/hooks/useCreateTask', () => ({ useCreateTask: () => ({ mutate: createMutate }) }))
```

Add `beforeEach` (the file has none today — also import it from `vitest`):

```ts
beforeEach(() => {
  createMutate.mockReset()
  projects.data = [{ id: 'p1', name: 'Nimbus', key: 'NIM' }]
})
```

Append inside `describe('Toolbar', …)`:

```ts
  it('reveals a title input when + New task is clicked, and creates on Enter', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    const input = screen.getByLabelText('New task title')
    fireEvent.change(input, { target: { value: 'Fix header' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0][0]).toEqual({
      title: 'Fix header',
      project: { id: 'p1', name: 'Nimbus', key: 'NIM' },
    })
  })

  it('opens the drawer on the created ref (success routes ?task=)', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'Fix header' } })
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Enter' })
    act(() => createMutate.mock.calls[0][1].onSuccess({ ref: 'NIM-107' }))
    expect(screen.getByTestId('qs').textContent).toContain('task=NIM-107')
    expect(screen.queryByLabelText('New task title')).toBeNull() // input closed
  })

  it('does not create on Enter with an empty title', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Enter' })
    expect(createMutate).not.toHaveBeenCalled()
  })

  it('Escape cancels but keeps the draft for reopening', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'half-typed' } })
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Escape' })
    expect(screen.queryByLabelText('New task title')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    expect((screen.getByLabelText('New task title') as HTMLInputElement).value).toBe('half-typed')
  })

  it('keeps the draft when the mutation does not succeed', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'kept' } })
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Enter' })
    // mutate was called but onSuccess never fires (failure path)
    expect((screen.getByLabelText('New task title') as HTMLInputElement).value).toBe('kept')
  })

  it('shows a project select only when more than one project exists', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: '+ New task' }))
    expect(screen.queryByLabelText('Project')).toBeNull()
    fireEvent.keyDown(screen.getByLabelText('New task title'), { key: 'Escape' })

    projects.data = [
      { id: 'p1', name: 'Nimbus', key: 'NIM' },
      { id: 'p2', name: 'Zephyr', key: 'ZEP' },
    ]
    renderAt('/')
    fireEvent.click(screen.getAllByRole('button', { name: '+ New task' })[1])
    const sel = screen.getByLabelText('Project')
    fireEvent.change(sel, { target: { value: 'p2' } })
    fireEvent.change(screen.getAllByLabelText('New task title')[0], { target: { value: 'In Zephyr' } })
    fireEvent.keyDown(screen.getAllByLabelText('New task title')[0], { key: 'Enter' })
    expect(createMutate.mock.calls[0][0].project.id).toBe('p2')
  })

  it('disables + New task when the workspace has no projects', () => {
    projects.data = []
    renderAt('/')
    const btn = screen.getByRole('button', { name: '+ New task' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Create a project first (see docs/admin.md)')
  })
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/features/toolbar/Toolbar.test.tsx
```

Expected: new tests FAIL (`Unable to find … '+ New task'`); the 5 existing tests still pass.

- [ ] **Step 3: Implement `NewTask` in `Toolbar.tsx`**

Add imports at the top:

```ts
import { useState, useRef, useEffect } from 'react'
import { useViewState } from '../../app/useViewState'
import { useProjects } from '../../lib/hooks/useProjects'
import { useCreateTask } from '../../lib/hooks/useCreateTask'
import type { ProjectOption } from '../../data/projectsRepo'
```

Insert `<NewTask workspaceId={activeId ?? ''} />` as the **first child** of the toolbar `<div>` (before the search input). Append the component at the bottom of the file (sibling of `Group`):

```tsx
function NewTask({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const { data: projects } = useProjects(workspaceId)
  const { setTaskRef } = useViewState()
  const create = useCreateTask(workspaceId)

  // Return focus to the button when the inline input closes (cancel or success).
  useEffect(() => {
    if (!open && wasOpen.current) btnRef.current?.focus()
    wasOpen.current = open
  }, [open])

  const project: ProjectOption | undefined =
    projects?.find((p) => p.id === projectId) ?? projects?.[0]

  if (!open)
    return (
      <button
        ref={btnRef}
        className="opm-btn"
        disabled={!projects?.length}
        title={projects?.length ? undefined : 'Create a project first (see docs/admin.md)'}
        onClick={() => setOpen(true)}
      >
        + New task
      </button>
    )

  const submit = () => {
    const t = title.trim()
    if (!t || !project) return
    create.mutate(
      { title: t, project },
      {
        onSuccess: (task) => {
          setTitle('')
          setOpen(false)
          setTaskRef(task.ref)
        },
      },
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        aria-label="New task title"
        placeholder="Task title…"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setOpen(false) // draft kept for reopening
        }}
        className="opm-input w-56"
      />
      {(projects?.length ?? 0) > 1 && (
        <select
          aria-label="Project"
          value={project?.id ?? ''}
          onChange={(e) => setProjectId(e.target.value)}
          className="opm-input w-auto"
        >
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>{p.key} — {p.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
```

Note the `onSuccess` type: `useCreateTask`'s mutation resolves the created `Task`, so `task.ref` type-checks. In the test, the mocked `mutate` receives that callback via its second argument — no cast needed beyond the mock's `any`.

- [ ] **Step 4: Run to verify green**

```bash
npx vitest run src/features/toolbar/Toolbar.test.tsx
```

Expected: 12 passed (5 old + 7 new).

- [ ] **Step 5: Full gate + commit**

```bash
npm run test && npm run build
git add src/features/toolbar/Toolbar.tsx src/features/toolbar/Toolbar.test.tsx
git commit -m "feat(toolbar): + New task — title-first create, opens the drawer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `deleteTask` + drawer two-step confirm + ActivityRow `'created'`

**Files:**
- Modify: `src/data/tasksRepo.ts` (append `deleteTask`)
- Modify: `src/data/tasksRepo.test.ts` (one test)
- Create: `src/lib/hooks/useDeleteTask.ts`
- Create: `src/lib/hooks/useDeleteTask.test.ts`
- Modify: `src/features/taskDrawer/TaskDrawer.tsx` (footer + `DeleteTaskButton`)
- Modify: `src/features/taskDrawer/TaskDrawer.test.tsx`
- Modify: `src/features/activityView/ActivityRow.tsx` (`'created'` branch)
- Modify: `src/features/activityView/ActivityView.test.tsx` (one test)

**Interfaces:**
- Consumes: the thenable `delEq1` mock from Task 3's mock block.
- Produces: `deleteTask(id: string): Promise<void>`; `useDeleteTask(workspaceId: string)` → mutation taking the task `id` string.

- [ ] **Step 1: Failing repo test**

Append to `src/data/tasksRepo.test.ts` (inside the main `describe`) and add `deleteTask` to the import:

```ts
  it('deletes a task scoped by id', async () => {
    await deleteTask('t1')
    expect(from).toHaveBeenCalledWith('tasks')
    expect(del).toHaveBeenCalled()
    expect(delEq1).toHaveBeenCalledWith('id', 't1')
  })
```

Run `npx vitest run src/data/tasksRepo.test.ts` → FAIL (not exported). Implement in `tasksRepo.ts`:

```ts
export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
```

Re-run → PASS.

- [ ] **Step 2: Failing hook test**

Create `src/lib/hooks/useDeleteTask.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { deleteTask } = vi.hoisted(() => ({ deleteTask: vi.fn() }))
vi.mock('../../data/tasksRepo', () => ({ deleteTask }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useDeleteTask } from './useDeleteTask'
import { toast } from 'sonner'

const ws = 'w1'
const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: qc }, children)

beforeEach(() => vi.clearAllMocks())

describe('useDeleteTask', () => {
  it('deletes and invalidates tasks + activity', async () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    deleteTask.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useDeleteTask(ws), { wrapper: wrap(qc) })
    result.current.mutate('t1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(deleteTask).toHaveBeenCalledWith('t1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', ws] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['activity', ws] })
  })

  it('toasts on failure', async () => {
    const qc = new QueryClient()
    deleteTask.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useDeleteTask(ws), { wrapper: wrap(qc) })
    result.current.mutate('t1')
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('nope'))
  })
})
```

Run → FAIL. Create `src/lib/hooks/useDeleteTask.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deleteTask } from '../../data/tasksRepo'

export function useDeleteTask(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onError: (e) => toast.error(`Couldn't delete task: ${(e as Error).message}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      qc.invalidateQueries({ queryKey: ['activity', workspaceId] })
    },
  })
}
```

Re-run → PASS.

- [ ] **Step 3: Failing drawer tests**

In `src/features/taskDrawer/TaskDrawer.test.tsx`, add next to the other hook mocks:

```ts
const delMutate = vi.fn()
vi.mock('../../lib/hooks/useDeleteTask', () => ({ useDeleteTask: () => ({ mutate: delMutate }) }))
```

Add `delMutate.mockClear()` to the existing `beforeEach`. Append tests:

```ts
  it('delete is a two-step confirm: first click arms, Cancel disarms', () => {
    render(<TaskDrawer />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(delMutate).not.toHaveBeenCalled()
    expect(screen.getByText('Delete this task?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Delete this task?')).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete task' })).toBeInTheDocument()
  })

  it('confirming deletes the task and closes the drawer on success', () => {
    render(<TaskDrawer />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(delMutate).toHaveBeenCalledTimes(1)
    expect(delMutate.mock.calls[0][0]).toBe('t1')
    delMutate.mock.calls[0][1].onSuccess()
    expect(setTaskRef).toHaveBeenCalledWith(null)
  })

  it('focuses Cancel when the confirm is armed (destructive-action default)', () => {
    render(<TaskDrawer />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })
```

Run `npx vitest run src/features/taskDrawer/TaskDrawer.test.tsx` → FAIL (no Delete button).

- [ ] **Step 4: Implement the drawer footer**

In `src/features/taskDrawer/TaskDrawer.tsx`:

- Extend the react import: `import { useEffect, useRef, useState } from 'react'`
- Add: `import { useDeleteTask } from '../../lib/hooks/useDeleteTask'`
- Inside the `drawer-body` div, after `<CommentThread …/>`:

```tsx
              <footer className="border-t border-[var(--border)] pt-4">
                <DeleteTaskButton taskId={task.id} workspaceId={activeId ?? ''} onDeleted={close} />
              </footer>
```

- Append the component at the bottom of the file:

```tsx
function DeleteTaskButton({ taskId, workspaceId, onDeleted }: {
  taskId: string
  workspaceId: string
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const del = useDeleteTask(workspaceId)

  if (!confirming)
    return (
      <button onClick={() => setConfirming(true)} className="opm-btn">
        Delete task
      </button>
    )

  return (
    <div className="flex items-center gap-2 text-sm">
      <span>Delete this task?</span>
      <button
        onClick={() => del.mutate(taskId, { onSuccess: onDeleted })}
        className="opm-btn font-semibold"
      >
        Delete
      </button>
      {/* autoFocus lands on the safe option; both stay inside the drawer's focus trap */}
      <button autoFocus onClick={() => setConfirming(false)} className="opm-btn">
        Cancel
      </button>
    </div>
  )
}
```

Run the drawer tests → PASS.

- [ ] **Step 5: ActivityRow `'created'` renderer (failing test first)**

In `src/features/activityView/ActivityView.test.tsx`, add a fixture + test:

```ts
const CREATED = {
  id: 'a4', verb: 'created', from_status: null, to_status: null,
  created_at: '2026-07-07T10:00:00Z',
  actor: { name: 'Kit', color: '#6d5ef0' }, task: { ref: 'NIM-107', title: 'Ship adoption' },
}
```

```ts
  it('renders a created activity row referencing the task', () => {
    useActivity.mockReturnValue({ data: [CREATED], isLoading: false, error: null })
    render(<ActivityView />)
    expect(screen.getByText('Kit')).toBeInTheDocument()
    expect(screen.getByText(/created/)).toBeInTheDocument()
    expect(screen.getByText('NIM-107')).toBeInTheDocument()
    expect(screen.getByText(/Ship adoption/)).toBeInTheDocument()
  })
```

Run → it *half*-fails: the unknown-verb fallback prints "created" but no task ref, so the `NIM-107` assertion fails. Then in `src/features/activityView/ActivityRow.tsx`, extend the verb chain — after the `'commented'` branch, before the final fallback:

```tsx
          ) : item.verb === 'created' ? (
            <>
              <span className="text-[var(--muted)]"> created </span>
              <TaskRef task={item.task} />
            </>
```

Re-run → PASS.

- [ ] **Step 6: Full gate + commit**

```bash
npm run test && npm run build
git add src/data/tasksRepo.ts src/data/tasksRepo.test.ts src/lib/hooks/useDeleteTask.ts \
  src/lib/hooks/useDeleteTask.test.ts src/features/taskDrawer/TaskDrawer.tsx \
  src/features/taskDrawer/TaskDrawer.test.tsx src/features/activityView/ActivityRow.tsx \
  src/features/activityView/ActivityView.test.tsx
git commit -m "feat(drawer): delete task with two-step confirm; Activity 'created' rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: LoginPage name capture + zero-workspace empty state

**Files:**
- Modify: `src/app/LoginPage.tsx` (Name field → `options.data.name`)
- Modify: `src/app/LoginPage.test.tsx`
- Modify: `src/lib/hooks/useSession.ts` (export `signOut` — this file is an architecture carve-out; the app has **no** sign-out affordance today)
- Modify: `src/app/Shell.tsx` (empty state)
- Modify: `src/app/Shell.test.tsx`

**Interfaces:**
- Consumes: `useActiveWorkspace()` (`{ activeId: string | null; loading: boolean }`).
- Produces: `signOut(): ReturnType<typeof supabase.auth.signOut>` from `useSession.ts`.

- [ ] **Step 1: Failing LoginPage tests**

Append to `src/app/LoginPage.test.tsx`:

```ts
  it('passes the name as signup metadata', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@team.dev' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'hunter22' } })
    fireEvent.change(screen.getByPlaceholderText('Name (used when signing up)'), {
      target: { value: '  Kit Klaimak ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'new@team.dev',
        password: 'hunter22',
        options: { data: { name: 'Kit Klaimak' } },
      }))
  })

  it('sign-in ignores the name field', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' }))
  })
```

Run `npx vitest run src/app/LoginPage.test.tsx` → FAIL (no such placeholder).

- [ ] **Step 2: Implement in `LoginPage.tsx`**

Add state next to the others:

```ts
  const [name, setName] = useState('')
```

Change `signUp`:

```ts
  const signUp = async () => {
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() } },
    })
    if (error) setError(error.message)
  }
```

Add the input between the Password input and the error line (same classes as the Email input):

```tsx
        <input
          className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
          placeholder="Name (used when signing up)"
          value={name}
          onChange={e => setName(e.target.value)}
        />
```

Run → PASS. (The trigger's `nullif(…,'')` handles an empty name.)

- [ ] **Step 3: `signOut` helper**

In `src/lib/hooks/useSession.ts`, append:

```ts
// Carve-out file: the only non-data module allowed to touch supabase.auth.
export function signOut() {
  return supabase.auth.signOut()
}
```

- [ ] **Step 4: Failing Shell tests**

`Shell.test.tsx` renders `Shell` without a `WorkspaceProvider`, so adding `useActiveWorkspace` to Shell breaks every existing test until the module is mocked. Add at the top, with the other mocks:

```ts
const { ws, mockSignOut } = vi.hoisted(() => ({
  ws: { activeId: 'w1' as string | null, loading: false },
  mockSignOut: vi.fn(),
}))
vi.mock('../lib/workspace', () => ({
  useActiveWorkspace: () => ({ ...ws, setActiveId: vi.fn() }),
}))
vi.mock('../lib/hooks/useSession', () => ({ signOut: mockSignOut }))
```

Extend the existing `beforeEach`:

```ts
    ws.activeId = 'w1'
    ws.loading = false
    mockSignOut.mockClear()
```

Append tests:

```ts
  it('shows the no-workspace state when the member list is loaded but empty', () => {
    ws.activeId = null
    renderShell()
    expect(screen.getByText('No workspace yet')).toBeInTheDocument()
    expect(screen.getByText('Ask your workspace admin to add you.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Board' })).toBeNull() // no app chrome
  })

  it('signs out from the no-workspace state', async () => {
    ws.activeId = null
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('does not flash the no-workspace state while workspaces load', () => {
    ws.activeId = null
    ws.loading = true
    renderShell()
    expect(screen.queryByText('No workspace yet')).toBeNull()
    expect(screen.getByRole('button', { name: 'Board' })).toBeInTheDocument()
  })
```

Run `npx vitest run src/app/Shell.test.tsx` → the three new tests FAIL; the old ones still pass (mock returns `activeId: 'w1'`).

- [ ] **Step 5: Implement the empty state in `Shell.tsx`**

Add imports:

```ts
import { useActiveWorkspace } from '../lib/workspace'
import { signOut } from '../lib/hooks/useSession'
```

Inside `Shell()`, read the context after the theme state (hooks stay unconditional), and early-return **after** the theme `useEffect`:

```tsx
  const { activeId, loading: workspacesLoading } = useActiveWorkspace()
```

```tsx
  if (!workspacesLoading && activeId === null)
    return (
      <div className="min-h-full grid place-items-center bg-[var(--bg)] text-[var(--text)]">
        <div className="w-96 max-w-full space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <h1 className="text-lg font-semibold">No workspace yet</h1>
          <p className="text-sm text-[var(--muted)]">Ask your workspace admin to add you.</p>
          <button onClick={() => signOut()} className="opm-btn">Sign out</button>
        </div>
      </div>
    )
```

Run the Shell tests → PASS.

- [ ] **Step 6: Full gate + commit**

```bash
npm run test && npm run build
git add src/app/LoginPage.tsx src/app/LoginPage.test.tsx src/lib/hooks/useSession.ts \
  src/app/Shell.tsx src/app/Shell.test.tsx
git commit -m "feat(auth): capture name at sign-up; zero-workspace empty state + sign out

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin runbook + browser smoke + ship

**Files:**
- Create: `docs/admin.md`

**Interfaces:** none — documentation + verification.

- [ ] **Step 1: Write `docs/admin.md`**

```markdown
# Admin Runbook (admin-by-SQL)

This app deliberately has no UI for workspace, project, or member management —
the owner administers by SQL (post-v1 roadmap decision, spec
`2026-07-07-make-it-adoptable-design.md`). Run these in the Supabase SQL editor
(hosted) or `psql` (local); both run as a privileged role, bypassing RLS by design.

Local psql:

    podman exec -it supabase_db_open-project-management psql -U postgres -d postgres

## Create a workspace (and make yourself its owner)

    insert into workspaces (name, created_by)
      values ('Acme Team', (select id from auth.users where email = 'you@example.com'))
      returning id;
    insert into workspace_members (workspace_id, user_id, role)
      values ('<workspace-id-from-above>',
              (select id from auth.users where email = 'you@example.com'),
              'owner');

Do **not** name a real workspace with the demo seed UUID
`20000000-0000-0000-0000-000000000001`; the name "Northwind" is fine —
auto-join is pinned to that UUID, not the name.

## Add a member (they must have signed up first)

    insert into workspace_members (workspace_id, user_id, role)
      values ('<workspace-id>',
              (select id from auth.users where email = 'teammate@example.com'),
              'member');

## Create a project (key becomes the task-ref prefix, e.g. ACME-101)

    insert into projects (workspace_id, name, key)
      values ('<workspace-id>', 'Acme Website', 'ACME');

## Fix a profile name (blank names render as "Someone")

    update profiles set name = 'Real Name'
      where id = (select id from auth.users where email = 'teammate@example.com');

## Remove a member (their tasks stay; assignee falls back to unassigned display)

    delete from workspace_members
      where workspace_id = '<workspace-id>'
        and user_id = (select id from auth.users where email = 'teammate@example.com');
```

- [ ] **Step 2: Full unit + build gate**

```bash
npm run test && npm run build
```

Expected: ~196 tests green across 44 files (164 baseline + 2 projects + 11 data/hooks + 7 toolbar + 7 delete/activity + 5 auth/shell); build clean, six view chunks, main chunk < 500 kB.

- [ ] **Step 3: Browser smoke** (needs the stack)

```bash
export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
podman start supabase_db_open-project-management
podman start $(podman ps -a --format '{{.Names}}' | grep '_open-project-management$' | grep -v '^supabase_db_')
npm run dev
```

At `http://localhost:5173` (sign in with any email/password — local signups auto-join the seeded Northwind):

1. List view → "+ New task" → type a title → Enter → drawer opens on `NIM-1xx`; task appears in Backlog group.
2. Board view → the new card sits in Backlog; Activity view shows "created NIM-1xx".
3. Open the task → Delete task → Cancel (stays) → Delete task → Delete → drawer closes, card gone; Activity row degrades to "created a task".
4. Sign up a fresh user with a Name filled in → List → assignee filter shows that name (not "Someone").
5. Toggle both themes on the empty-state-free shell; check the toolbar input/select in `bloom` and `slate`.

- [ ] **Step 4: Commit the runbook**

```bash
git add docs/admin.md
git commit -m "docs(admin): admin-by-SQL runbook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Ship (user confirms)**

```bash
git checkout main && git merge --ff-only feat/make-it-adoptable
git branch -d feat/make-it-adoptable
git push origin main
```

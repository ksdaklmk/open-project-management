# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Multi-tenant project-management web app: Vite + React + TS + Tailwind on Supabase (Postgres + Auth + RLS + Realtime). Design spec and plans live in `docs/superpowers/`. The six views (List/Board/Gantt/Timeline/Activity/Workload) are not built yet — the foundation is auth + schema + shell.

## Commands

- `npm run test` — Vitest (run mode). One file: `npm run test -- <name>`.
- `npm run build` — `tsc -b && vite build`. **Type-check with `tsc -b`, never plain `tsc`**: the root `tsconfig.json` uses project references + `files: []`, so bare `tsc` checks nothing and silently "passes".
- `npm run dev` — Vite dev server.

## Supabase runs on Podman (no Docker Desktop)

- `supabase start` and `supabase db reset` **hang** under Podman (post-apply service-restart step). Instead: apply migrations with `supabase migration up`; run SQL / seed / pgTAP via `podman exec -i supabase_db_open-project-management psql -U postgres -d postgres`.
- The CLI needs `DOCKER_HOST` set to Podman's socket — re-derive per shell (it changes on machine restart):
  `export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"`
- Migrations are append-only: `supabase/migrations/NNNN_*.sql`. After a schema change, regenerate types: `supabase gen types typescript --local > src/types/database.ts` (generated — don't hand-edit; pipe stderr away if image-pull logs leak in).
- `config.toml` disables `analytics`/`edge_runtime`/`local_smtp` (they hang on Podman).

## Architecture rules (some enforced by tests)

- **`@supabase/supabase-js` and the `supabase` client are used ONLY in `src/lib/supabase.ts` + `src/data/`** (auth carve-out: `src/lib/hooks/useSession.ts`, `src/app/LoginPage.tsx`). Features/components never import the client — they call `data/` repos through TanStack Query hooks. `src/architecture.test.ts` fails the suite on any violation.
- **RLS is the tenant-isolation security boundary.** Every table is member-scoped via the `security definer` `is_member(workspace_id)`; insert policies pin writer identity (`created_by`/`author_id`/`actor_id = auth.uid()`). A NEW table needs: RLS enabled, member-scoped policies, AND `grant … to authenticated` (this Supabase version does not auto-grant — without it every query 42501s before RLS). Isolation is proven in `supabase/tests/rls_test.sql` (pgTAP) — extend it when you touch policies.
- **Themes are CSS variables** (`bloom` default, `slate`) toggled via `data-theme` on `<html>`. Style with `var(--surface)`, `var(--text)`, etc. — never hard-code theme hexes into Tailwind utilities.
- **Status / priority / type / tag taxonomies are client constants** in `src/types/constants.ts`, not DB tables.

## Conventions

- Design / UI work uses the **impeccable** skill (not frontend-design).
- View + selected task live in the URL (`?view=board&task=NIM-101`); theme persists to `localStorage`.
- New signups auto-join the seeded "Northwind" demo workspace (`handle_new_user` trigger).

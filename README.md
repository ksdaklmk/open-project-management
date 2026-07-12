# Open Project Management

Open Project Management is a multi-tenant project-management web app for delivery teams. It
provides List, Board, Gantt, Timeline, Activity, and Workload views, plus task details, filters,
sorting, comments, subtasks, tags, and two themes.

The frontend is Vite, React 18, TypeScript, Tailwind CSS, and TanStack Query. Supabase supplies
PostgreSQL, Auth, Row Level Security (RLS), and Realtime. RLS is the tenant-isolation boundary;
browser code never receives a service-role key.

## Prerequisites

- Node.js 20.19+ or 22.13+
- npm
- Podman Desktop or Podman machine (Docker Desktop is not used locally)
- Supabase CLI
- `psql` only when using `DATABASE_URL` instead of the Podman container

## Local setup

1. Install dependencies: `npm ci`.
2. Start the Podman machine: `podman machine start`.
3. Derive the current socket for this shell:

   ```sh
   export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
   ```

4. Start the local Supabase services if they are not running. `supabase start` can hang after
   applying changes under Podman, so use it only for the initial service creation and interrupt it
   once containers are healthy. Do not use `supabase db reset` locally.
5. Apply tracked migrations: `supabase migration up`.
6. Copy `.env.example` to `.env.local` and fill in the anon key printed by `supabase status`.
7. Start Vite: `npm run dev`, then open `http://localhost:5173`.

The local seed creates Northwind and its explicit demonstration memberships. New signups never
auto-join it. Production must not run `supabase/seed.sql`.

## Quality commands

| Command                 | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `npm run test`          | Run all Vitest tests once                            |
| `npm run test:coverage` | Run Vitest and enforce the coverage baseline         |
| `npm run build`         | Type-check with `tsc -b`, then build with Vite       |
| `npm run lint`          | Run ESLint with zero warnings allowed                |
| `npm run format:check`  | Check tracked source and documentation formatting    |
| `npm run test:e2e`      | Run the Playwright browser smoke test                |
| `npm run test:db`       | Run schema and RLS pgTAP suites against local Podman |

Install the browser once with `npx playwright install chromium`. Never substitute bare `tsc` for
`npm run build`: the root TypeScript config uses project references and otherwise checks nothing.

## Database changes

Migrations are append-only files in `supabase/migrations`. Use the next numeric prefix, run
`supabase migration up`, then regenerate types:

```sh
supabase gen types typescript --local > src/types/database.ts
```

Generated types must not be edited manually. Every new table needs RLS, member-scoped policies,
explicit grants to `authenticated`, and isolation coverage in `supabase/tests/rls_test.sql`.

Under Podman, run SQL directly when needed:

```sh
podman exec -i supabase_db_open-project-management psql -U postgres -d postgres
```

## Architecture boundaries

- Supabase imports belong only in `src/lib/supabase.ts`, `src/data/`, and the existing auth
  carve-outs. `src/architecture.test.ts` enforces this.
- Feature components use repository functions through TanStack Query hooks.
- Theme colours come from CSS variables; Bloom and Slate are both supported.
- View, selected task, filters, and sort stay in the URL. Theme selection stays in local storage.

## Deployment and operations

See [deployment](docs/deployment.md) for hosted environment setup and release promotion, and
[operations](docs/operations.md) for monitoring, backup, recovery, incident, and rollback
procedures. Current privileged workspace administration is documented in [admin](docs/admin.md).

## Known limitations

The repository is an internal beta. Owners and admins can manage normal workspace, project,
membership, invitation, and ownership flows in the settings UI. Realtime reconciliation and
server-authored activity are not yet implemented; large task sets are not yet paginated; and the
full responsive/accessibility production gate remains pending.

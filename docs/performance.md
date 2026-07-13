# Performance budgets and scale fixture

Phase 1C uses explicit budgets so scale regressions fail review instead of becoming subjective.

| Signal                       |                      Initial budget | Measurement                                                                   |
| ---------------------------- | ----------------------------------: | ----------------------------------------------------------------------------- |
| Initial task view p95        |                          < 2,000 ms | Staging browser trace, cold query cache                                       |
| Mutation acknowledgement p95 |                            < 500 ms | Staging client-to-API acknowledgement; exclude declared network extremes      |
| Initial compressed JS + CSS  |                          <= 220 KiB | Entrypoint assets referenced by built `index.html`; lazy view chunks excluded |
| Task page                    |                    <= 200 summaries | `query_tasks`; server hard-cap 500                                            |
| Gantt/Timeline window        | <= 500 scheduled summaries per page | Bounded dates plus a separate unscheduled page                                |

## Generate the fixture

The fixture is deterministic, idempotent, and deliberately separate from `supabase/seed.sql`.
It creates 10 isolated workspaces, 100 users/members, 50 projects, 50,000 tasks, and representative
tags, comments, subtasks, and server-authored activity. Apply it only to disposable local or staging
performance environments:

```sh
scripts/load-scale-fixture.sh
npm run test:performance
npm run test:performance:db
```

Remove only the deterministic fixture afterward with `scripts/remove-scale-fixture.sh`.

The first workspace ID is always `md5('scale-workspace-1')::uuid`, and its first user is always
`md5('scale-user-1')::uuid`, making plans and browser scenarios reproducible. Hosted measurements
must record release, region, browser, fixture revision, warm/cold cache state, and at least 20
samples. Do not copy customer content into a performance environment.

## Query-plan evidence

For every task-query change, capture `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` against the 50k
fixture for the common unfiltered page, a selective status page, text search, a bounded date
window, and Workload. Plans must avoid returning the entire workspace and should use the Phase 1C
indexes when selective. PostgreSQL may correctly choose a sequential scan for tiny local tables.

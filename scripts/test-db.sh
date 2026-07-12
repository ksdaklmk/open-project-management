#!/usr/bin/env bash
set -euo pipefail

repeat=1
if [[ "${1:-}" == "--repeat" ]]; then
  repeat="${2:?usage: scripts/test-db.sh [--repeat COUNT]}"
fi

if ! [[ "$repeat" =~ ^[1-9][0-9]*$ ]]; then
  echo "repeat count must be a positive integer" >&2
  exit 2
fi

run_sql_file() {
  local file="$1"
  if [[ -n "${DATABASE_URL:-}" ]]; then
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$file"
  else
    podman exec -i supabase_db_open-project-management \
      psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <"$file"
  fi
}

run_sql_file supabase/tests/bootstrap.sql

for ((run = 1; run <= repeat; run += 1)); do
  echo "Database test pass $run/$repeat"
  run_sql_file supabase/tests/schema_test.sql
  run_sql_file supabase/tests/rls_test.sql
  run_sql_file supabase/tests/admin_rpc_test.sql
  run_sql_file supabase/tests/invitations_test.sql
  run_sql_file supabase/tests/server_activity_test.sql
  run_sql_file supabase/tests/atomic_move_test.sql
done

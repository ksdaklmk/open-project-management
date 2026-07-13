#!/usr/bin/env bash
set -euo pipefail

file="${1:-supabase/fixtures/e2e.sql}"
if [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$file"
else
  podman exec -i supabase_db_open-project-management \
    psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < "$file"
fi

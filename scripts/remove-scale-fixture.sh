#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/fixtures/remove_scale.sql
else
  podman exec -i supabase_db_open-project-management \
    psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/fixtures/remove_scale.sql
fi

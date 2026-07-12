#!/usr/bin/env bash
set -euo pipefail

generated="$(mktemp)"
trap 'rm -f "$generated"' EXIT

supabase gen types typescript --local >"$generated"
diff -u src/types/database.ts "$generated"

#!/usr/bin/env bash
set -euo pipefail

drift="$(mktemp)"
trap 'rm -f "$drift"' EXIT

supabase db diff --local --schema public >"$drift"
if [[ -s "$drift" ]]; then
  echo "Schema differs from the tracked migrations:" >&2
  cat "$drift" >&2
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

raw="$(mktemp)"
drift="$(mktemp)"
trap 'rm -f "$raw" "$drift"' EXIT

supabase db diff --local --schema public >"$raw"

# Supabase CLI 2.109 emits SQL directly, while newer pg-delta versions wrap
# the same SQL in a JSON object under `diff`. Support both so local verification
# and the pinned CI gate apply the same non-empty-diff rule.
if node -e '
  const fs = require("node:fs")
  JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
' "$raw" 2>/dev/null; then
  node -e '
    const fs = require("node:fs")
    const result = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    process.stdout.write(result.diff ?? "")
  ' "$raw" >"$drift"
else
  cp "$raw" "$drift"
fi

if [[ -s "$drift" ]]; then
  echo "Schema differs from the tracked migrations:" >&2
  cat "$drift" >&2
  exit 1
fi

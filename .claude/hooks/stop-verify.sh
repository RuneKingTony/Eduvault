#!/usr/bin/env bash
# Stop: refuse to finish while affected projects fail lint or typecheck.
input=$(cat)
if echo "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! output=$(pnpm -s nx affected -t lint typecheck 2>&1); then
  echo "nx affected -t lint typecheck failed:" >&2
  echo "$output" | tail -40 >&2
  exit 2
fi

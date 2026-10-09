#!/usr/bin/env bash
# Decides how much e2e a diff needs. Prints one word on stdout: skip | api | browser.
#   browser  the diff touches apps/web-admin, apps/web-portal, libs/ui, libs/shared
#   api      it touches UI-visible API: apps/api source, migrations or seed, libs/api-contract, libs/policy
#   skip     anything else (docs, tests, tooling, .claude)
# Unit and integration specs and apps/api/test never count. The reason goes to stderr.
# Usage: e2e-gate.sh [--stdin | path ...]   no arguments: diff against origin/main plus untracked files.
set -u

if [ "${1:-}" = "--stdin" ]; then
  PATHS=$(cat)
elif [ $# -gt 0 ]; then
  PATHS=$(printf '%s\n' "$@")
else
  cd "$(git rev-parse --show-toplevel)" || exit 2
  BASE=origin/main
  git rev-parse --verify -q "$BASE" >/dev/null || BASE=main
  git rev-parse --verify -q "$BASE" >/dev/null || BASE=HEAD
  PATHS=$({ git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u)
fi

VERDICT=skip
WHY="no UI-visible change"
while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in
    *.spec.ts | *.spec.tsx | *.test.ts | *.test.tsx | apps/api/test/*) continue ;;
    apps/web-admin/* | apps/web-portal/* | libs/ui/* | libs/shared/*)
      VERDICT=browser; WHY="$p"; break ;;
    apps/api/src/* | apps/api/db/migrations/* | apps/api/scripts/* | libs/api-contract/* | libs/policy/*)
      VERDICT=api; WHY="$p" ;;
  esac
done <<<"$PATHS"

echo "e2e-gate: $VERDICT ($WHY)" >&2
echo "$VERDICT"

#!/usr/bin/env bash
# Decides whether a diff needs the required e2e run (ADR 0004, amended). Prints one word: skip | browser.
#   browser  the diff touches product code: apps/web-admin, apps/web-portal, libs/ui, libs/shared, or the
#            API the screens read (apps/api source, migrations or seed, libs/api-contract, libs/policy)
#   skip     anything else (docs, tests, tooling, .claude)
# The old `api` verdict is retired: API-only diffs run browser steps too, with the curl checks.
# Unit and integration specs and apps/api/test never count. The reason goes to stderr.
# Usage: e2e-gate.sh [--stdin | --list | path ...]   no arguments: diff against origin/main plus untracked files.
#   --list reads paths on stdin and prints the ones that count as product code, one per line, instead of the verdict.
set -u

LIST=false
if [ "${1:-}" = "--list" ]; then
  LIST=true
  PATHS=$(cat)
elif [ "${1:-}" = "--stdin" ]; then
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
COUNTED=""
while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in
    *.spec.ts | *.spec.tsx | *.test.ts | *.test.tsx | apps/api/test/*) continue ;;
    apps/web-admin/* | apps/web-portal/* | libs/ui/* | libs/shared/* | \
      apps/api/src/* | apps/api/db/migrations/* | apps/api/scripts/* | libs/api-contract/* | libs/policy/*)
      [ "$VERDICT" = browser ] || { VERDICT=browser; WHY="$p"; }
      COUNTED+="$p"$'\n' ;;
  esac
done <<<"$PATHS"

if $LIST; then printf '%s' "$COUNTED"; exit 0; fi
echo "e2e-gate: $VERDICT ($WHY)" >&2
echo "$VERDICT"

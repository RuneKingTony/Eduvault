#!/bin/bash
# e2e-gate: whether the required e2e stage runs, from the changed paths alone.
# usage: e2e-gate.sh <KEY>   prints {"skip": bool, "mode": "browser|skip", "reason", "app_paths": [...]}
#                            and writes the same line to $D/e2e-gate.json
#   browser  any product code changed: apps/web-*, apps/api runtime code or migrations, libs/ui,
#            libs/api-contract, libs/policy, libs/shared (the classifier no longer emits api)
#   skip     docs, tests, tooling or .github/.claude only: records e2e: skipped with the reason
# exit 0 = recorded, 1 = error
set -u
. "$(dirname "$0")/lib.sh"
KEY=$1 TREE=$(st_get "$1" '.worktree_path') D=$(key_dir "$1")
[ -d "$TREE" ] || { echo "no worktree for $KEY" >&2; exit 1; }

TOUCHED=$(cd "$TREE" && {
  git fetch -q origin main 2>/dev/null
  BASE=$(git merge-base origin/main HEAD 2>/dev/null) || BASE=origin/main
  git diff --name-only "$BASE" 2>/dev/null
  git status --porcelain -uall 2>/dev/null | awk '/^\?\?/ {print $2}'
} | sort -u | sed '/^$/d')

[ -n "$TOUCHED" ] || { echo "e2e-gate: empty diff for $KEY" >&2; exit 1; }
N=$(printf '%s\n' "$TOUCHED" | wc -l | tr -d ' ')
GATE="$(dirname "$0")/../../eduvault-e2e/scripts/e2e-gate.sh"
MODE=$(printf '%s\n' "$TOUCHED" | bash "$GATE" --stdin 2>/dev/null) || { echo "e2e-gate: classifier failed" >&2; exit 1; }
case "$MODE" in browser | skip) ;; *) echo "e2e-gate: unexpected verdict '$MODE'" >&2; exit 1 ;; esac
APP=$(printf '%s\n' "$TOUCHED" | bash "$GATE" --list 2>/dev/null)
case "$MODE" in
  skip) R="e2e-gate: none of the $N changed paths is served by the stack (docs, tests, tooling or CI only)" ;;
  browser) R="e2e-gate: $(printf '%s\n' "$APP" | head -1) is product code ($(printf '%s\n' "$APP" | grep -c .) product path(s) changed)" ;;
esac

X=$(jq -nc --arg m "$MODE" --arg r "$R" --arg a "$([ "$MODE" = skip ] || printf '%s' "$APP")" \
  '{skip: ($m == "skip"), mode: $m, reason: $r, app_paths: ($a | split("\n") | map(select(. != "")))}')
[ "$MODE" = skip ] && bash "$W/state.sh" stage "$KEY" e2e skipped "$(jq -nc --arg r "$R" '{reason: $r}')"
mkdir -p "$D"; echo "$X" > "$D/e2e-gate.json"
echo "$X"

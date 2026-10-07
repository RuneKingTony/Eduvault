#!/bin/bash
# e2e-gate: whether the opt-in e2e stage runs, from the changed paths alone.
# usage: e2e-gate.sh <KEY>   prints {"skip": bool, "mode": "browser|api|skip", "reason", "app_paths": [...]}
#                            and writes the same line to $D/e2e-gate.json
#   browser  apps/web-*, or libs/ui, libs/api-contract, libs/policy, libs/shared changed
#   api      only apps/api runtime code or migrations changed: verify through direct API calls
#   skip     docs, tests, tooling or .github/.claude only: records e2e: skipped with the reason
# exit 0 = recorded, 1 = error
set -u
. "$(dirname "$0")/lib.sh"
KEY=$1 TREE=$(st_get "$1" '.worktree_path') D=$(key_dir "$1")
[ -d "$TREE" ] || { echo "no worktree for $KEY" >&2; exit 1; }

INFRA_RE='^(\.github/|\.claude/|\.husky/|docs/)|\.md$'
TEST_RE='\.(spec|test)\.[cm]?[jt]sx?$|/(__tests__|__mocks__|__fixtures__|fixtures)/|^apps/api/test/|^libs/testcontainers/'
TOOL_RE='(^|/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|project\.json|tsconfig[^/]*\.json|(vite|vitest)\.config\.[cm]?[jt]s|eslint\.config\.[cm]?js|\.prettierrc[^/]*|\.prettierignore|\.gitignore)$|^(nx\.json|scripts/)'
WEB_RE='^apps/web-(admin|portal)/|^libs/(ui|api-contract|policy|shared)/'
API_RE='^apps/api/'

TOUCHED=$(cd "$TREE" && {
  git fetch -q origin main 2>/dev/null
  BASE=$(git merge-base origin/main HEAD 2>/dev/null) || BASE=origin/main
  git diff --name-only "$BASE" 2>/dev/null
  git status --porcelain -uall 2>/dev/null | awk '/^\?\?/ {print $2}'
} | sort -u | sed '/^$/d')

[ -n "$TOUCHED" ] || { echo "e2e-gate: empty diff for $KEY" >&2; exit 1; }
N=$(printf '%s\n' "$TOUCHED" | wc -l | tr -d ' ')
APP=$(printf '%s\n' "$TOUCHED" | grep -vE "$INFRA_RE" || true)
RUN=$(printf '%s\n' "$APP" | sed '/^$/d' | grep -vE "$TEST_RE" | grep -vE "$TOOL_RE" || true)
WEB=$(printf '%s\n' "$RUN" | grep -E "$WEB_RE" || true)
API=$(printf '%s\n' "$RUN" | grep -E "$API_RE" || true)

if [ -z "$WEB" ] && [ -z "$API" ]; then
  MODE=skip R="e2e-gate: none of the $N changed paths is served by the stack (docs, tests, tooling or CI only)"
elif [ -n "$WEB" ]; then
  MODE=browser R="e2e-gate: web app or a lib it imports changed"
else
  MODE=api R="e2e-gate: server-side paths only: verify through direct API calls"
fi

X=$(jq -nc --arg m "$MODE" --arg r "$R" --arg a "$([ "$MODE" = skip ] || printf '%s' "$RUN")" \
  '{skip: ($m == "skip"), mode: $m, reason: $r, app_paths: ($a | split("\n") | map(select(. != "")))}')
[ "$MODE" = skip ] && bash "$W/state.sh" stage "$KEY" e2e skipped "$(jq -nc --arg r "$R" '{reason: $r}')"
mkdir -p "$D"; echo "$X" > "$D/e2e-gate.json"
echo "$X"

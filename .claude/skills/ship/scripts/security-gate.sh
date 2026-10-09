#!/bin/bash
# security-gate.sh [BASE] — decides from the diff shape alone whether the security review stage runs.
# BASE: argument, else $SECURITY_GATE_BASE, else origin/main. Local main is never used: it can lag
# origin and its unmerged lines would count as this change's.
# exit 0  = not triggered
# exit 10 = triggered
# exit 2  = BASE does not resolve
# stdout: {"triggered":bool,"reason":str,"inserted_lines":n,"paths":[...]}
#
# Triggers: more than THRESHOLD inserted lines (generated files, lockfiles, snapshots and .md excluded),
# or a touched path under migrations, libs/policy, auth, tenancy scoping or money code. The money
# words (fee, payment, ledger, wallet, school-account) count only under apps/api and libs/policy:
# a web page named fees-page is not money code.
# Covers committed, staged, unstaged and untracked work.

set -euo pipefail

BASE="${1:-${SECURITY_GATE_BASE:-origin/main}}"
THRESHOLD=600

SIZE_EXCLUDE='(^|/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$|\.snap$|(^|/)__snapshots__/|\.md$|^apps/api/src/db/db-types\.ts$|^apps/api/db/schema\.sql$|^apps/api/db/auth-schema\.snapshot\.sql$|(^|/)routeTree\.gen\.ts$'

CRITICAL='^apps/api/db/migrations/|^libs/policy/|^apps/api/src/(.*/)?auth[^/]*(/|$)|^apps/api/src/app/common/auth/|^apps/api/src/app/common/campus-(guard|scope)|^(apps/api|libs/policy)/.*(organization-auth|wallet|ledger|payment|fee|school[-_]account)'
PATH_EXCLUDE='\.md$|^apps/api/src/db/db-types\.ts$|^apps/api/db/schema\.sql$|^apps/api/db/auth-schema\.snapshot\.sql$|(^|/)routeTree\.gen\.ts$'

emit() {  # <triggered> <reason> <lines> <paths, newline separated>
  local paths
  paths=$(printf '%s' "$4" | jq -Rn '[inputs | select(length > 0)]')
  jq -nc --argjson t "$1" --arg r "$2" --argjson l "$3" --argjson p "$paths" \
    '{triggered: $t, reason: $r, inserted_lines: $l, paths: $p}'
}

git rev-parse -q --verify "$BASE^{commit}" >/dev/null || {
  echo "security-gate: base '$BASE' does not resolve (fetch origin first)" >&2
  exit 2
}
MB=$(git merge-base "$BASE" HEAD)

LINES=0
while IFS=$'\t' read -r add _ path; do
  [ "$add" = - ] && continue
  printf '%s\n' "$path" | grep -qE "$SIZE_EXCLUDE" && continue
  LINES=$(( LINES + add ))
done < <(git diff --numstat "$MB")

while IFS= read -r -d '' f; do
  printf '%s\n' "$f" | grep -qE "$SIZE_EXCLUDE" && continue
  n=$(grep -Ic '' "$f" 2>/dev/null || true)
  [ -n "$n" ] && LINES=$(( LINES + n ))
done < <(git ls-files -o --exclude-standard -z)

TOUCHED=$( { git diff --name-only "$MB"; git ls-files -o --exclude-standard; } | sort -u)
HITS=$(printf '%s\n' "$TOUCHED" | grep -vE "$PATH_EXCLUDE" | grep -E "$CRITICAL" || true)

if [ -n "$HITS" ]; then
  emit true "critical path touched" "$LINES" "$HITS"
  exit 10
fi
if [ "$LINES" -gt "$THRESHOLD" ]; then
  emit true "${LINES} inserted lines exceed ${THRESHOLD}" "$LINES" ""
  exit 10
fi
emit false "below threshold, no critical path" "$LINES" ""
exit 0

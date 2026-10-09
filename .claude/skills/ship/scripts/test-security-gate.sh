#!/bin/bash
# Builds a throwaway repo with an origin/main ref and asserts security-gate.sh exit codes.
set -uo pipefail

GATE="$(cd "$(dirname "$0")" && pwd)/security-gate.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
FAILS=0

g() { git -C "$TMP/repo" -c user.name=t -c user.email=t@t "$@"; }

setup() {
  rm -rf "$TMP/repo" "$TMP/origin.git"
  git init -q --bare "$TMP/origin.git"
  git init -q -b main "$TMP/repo"
  g remote add origin "$TMP/origin.git"
  mkdir -p "$TMP/repo/apps/api/src" "$TMP/repo/docs"
  echo base >"$TMP/repo/apps/api/src/app.ts"
  g add -A && g commit -qm base && g push -q origin main
  g checkout -q -b feature
}

lines() { awk -v n="$1" 'BEGIN { for (i = 0; i < n; i++) print "line " i }'; }

put() {  # <path> <line count>
  mkdir -p "$(dirname "$TMP/repo/$1")"
  lines "$2" >"$TMP/repo/$1"
}

check() {  # <name> <expected exit> [base arg]
  local out code
  out=$(cd "$TMP/repo" && bash "$GATE" ${3:+"$3"}) && code=0 || code=$?
  if [ "$code" -eq "$2" ] && { [ "$2" -eq 2 ] || printf '%s' "$out" | jq -e . >/dev/null 2>&1; }; then
    echo "ok   $1 (exit $code)"
  else
    echo "FAIL $1: expected $2, got $code: $out"
    FAILS=$((FAILS + 1))
  fi
}

setup; put docs/notes.md 5; check "small docs-only diff" 0
setup; put apps/api/db/migrations/20270101000000_x.sql 3; check "migration touch" 10
setup; put apps/api/src/feature.ts 601; check "601 inserted lines" 10
setup; put apps/api/src/feature.ts 600; check "600 inserted lines" 0
setup; put apps/api/src/db/db-types.ts 2000; put pnpm-lock.yaml 2000; put docs/big.md 2000; check "generated-only large diff" 0
setup; put libs/policy/src/roles.ts 2; check "libs/policy touch" 10
setup; put apps/api/src/app/common/auth/guards/organization-auth.guard.ts 2; g add -A; g commit -qm c; check "committed auth path" 10
setup; put apps/api/src/app/modules/school-account/service.ts 2; check "money path (school-account)" 10
setup; put apps/api/src/app/modules/student/student.service.ts 2; check "unrelated small source diff" 0
setup; put apps/api/src/app/common/campus-scope.ts 2; check "campus scope" 10
setup; put apps/web-admin/src/pages/fees-page.tsx 40; check "web fees page is not money code" 0
setup; put libs/ui/src/components/payment-badge.tsx 5; check "ui payment component is not money code" 0
setup; put apps/api/src/app/modules/fee/fee.service.ts 2; check "api fee module" 10
setup; put apps/api/src/app/modules/payment/payment.controller.ts 2; check "api payment module" 10
setup; put apps/api/src/feature.ts 601; g add -A; g commit -qm c; git -C "$TMP/repo" branch -f main HEAD; check "local main moved to HEAD is ignored" 10
setup; put apps/api/src/feature.ts 601; SECURITY_GATE_BASE=origin/main check "env base" 10
setup; check "no diff" 0
setup; check "bad base" 2 does-not-exist

[ "$FAILS" -eq 0 ] && echo "all passed" || { echo "$FAILS failed"; exit 1; }

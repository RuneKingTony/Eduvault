#!/usr/bin/env bash
# Offline tests for e2e-gate.sh, report-check.sh and preflight.sh. No stack, no network.
# Run: bash .claude/skills/eduvault-e2e/scripts/tests/run-tests.sh
set -u
S="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
check() { if [ "$2" = "0" ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }
is() { [ "$1" = "$2" ]; echo $?; }
gate() { printf '%s\n' "$@" | bash "$S/e2e-gate.sh" --stdin 2>/dev/null; }

check "gate: nothing changed is skip" "$(is "$(gate)" skip)"
check "gate: docs only is skip" "$(is "$(gate docs/verification.md CLAUDE.md .claude/skills/x/SKILL.md)" skip)"
check "gate: api test only is skip" "$(is "$(gate apps/api/test/tenancy.integration.spec.ts)" skip)"
check "gate: web spec only is skip" "$(is "$(gate apps/web-admin/src/pages/students-page.spec.tsx)" skip)"
check "gate: api source is api" "$(is "$(gate apps/api/src/app/modules/student/student.service.ts)" api)"
check "gate: migration is api" "$(is "$(gate apps/api/db/migrations/20260101_x.sql)" api)"
check "gate: api-contract is api" "$(is "$(gate libs/api-contract/src/schemas.ts)" api)"
check "gate: policy is api" "$(is "$(gate libs/policy/src/roles.ts)" api)"
check "gate: web-admin is browser" "$(is "$(gate apps/web-admin/src/app.tsx)" browser)"
check "gate: web-portal is browser" "$(is "$(gate apps/web-portal/src/app.tsx)" browser)"
check "gate: shared ui is browser" "$(is "$(gate libs/ui/src/sign-in-form.tsx)" browser)"
check "gate: an e2e spec is browser" "$(is "$(gate apps/web-e2e/src/specs/x.web.spec.ts)" browser)"
check "gate: e2e support is browser" "$(is "$(gate apps/web-e2e/src/support/api.ts)" browser)"
check "gate: browser beats api" "$(is "$(gate apps/api/src/main.ts apps/web-admin/src/app.tsx)" browser)"
check "gate: api then docs stays api" "$(is "$(gate apps/api/src/main.ts README.md)" api)"
check "gate: path arguments work" "$(is "$(bash "$S/e2e-gate.sh" apps/web-admin/src/app.tsx 2>/dev/null)" browser)"

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
printf 'VERDICT: PASS\nartefacts: x\npassed 3, failed 0, blocked 0\n' > "$T/pass.md"
bash "$S/report-check.sh" "$T/pass.md" >/dev/null 2>&1; check "report: clean PASS is valid" $?
printf 'VERDICT: PASS\nnote: step 3 hit a BLOCKED persona\n' > "$T/pass-bad.md"
bash "$S/report-check.sh" "$T/pass-bad.md" >/dev/null 2>&1; check "report: PASS mentioning BLOCKED is invalid" "$(is $? 1)"
printf 'VERDICT: PASS\nstep 2 FAIL then retried\n' > "$T/pass-bad2.md"
bash "$S/report-check.sh" "$T/pass-bad2.md" >/dev/null 2>&1; check "report: PASS mentioning FAIL is invalid" "$(is $? 1)"
{ printf 'VERDICT: PASS\n'; for i in $(seq 1 20); do echo "line $i"; done; echo "later BLOCKED mention"; } > "$T/pass-late.md"
bash "$S/report-check.sh" "$T/pass-late.md" >/dev/null 2>&1; check "report: words after line 15 are allowed in PASS" $?
printf 'VERDICT: BLOCKED\ncause: environment\nblocked: api down\n' > "$T/blocked.md"
bash "$S/report-check.sh" "$T/blocked.md" >/dev/null 2>&1; check "report: BLOCKED with cause is valid" $?
printf 'VERDICT: BLOCKED\nblocked: api down\n' > "$T/blocked-bad.md"
bash "$S/report-check.sh" "$T/blocked-bad.md" >/dev/null 2>&1; check "report: BLOCKED without cause is invalid" "$(is $? 1)"
printf 'VERDICT: FAIL\nfailed: step 2 expected 404\n' > "$T/fail.md"
bash "$S/report-check.sh" "$T/fail.md" >/dev/null 2>&1; check "report: FAIL with failed line is valid" $?
printf 'VERDICT: FAIL\n' > "$T/fail-bad.md"
bash "$S/report-check.sh" "$T/fail-bad.md" >/dev/null 2>&1; check "report: bare FAIL is invalid" "$(is $? 1)"
printf 'all good\n' > "$T/none.md"
bash "$S/report-check.sh" "$T/none.md" >/dev/null 2>&1; check "report: missing verdict line is invalid" "$(is $? 1)"

OUT=$(E2E_API_URL=http://127.0.0.1:9 bash "$S/preflight.sh" api 2>&1); RC=$?
check "preflight: unreachable stack exits 3" "$(is "$RC" 3)"
echo "$OUT" | grep -q 'BLOCKED (environment)'; check "preflight: names the environment cause" $?

echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

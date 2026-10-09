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
check "gate: api source is browser" "$(is "$(gate apps/api/src/app/modules/student/student.service.ts)" browser)"
check "gate: migration is browser" "$(is "$(gate apps/api/db/migrations/20260101_x.sql)" browser)"
check "gate: api-contract is browser" "$(is "$(gate libs/api-contract/src/schemas.ts)" browser)"
check "gate: policy is browser" "$(is "$(gate libs/policy/src/roles.ts)" browser)"
check "gate: web-admin is browser" "$(is "$(gate apps/web-admin/src/app.tsx)" browser)"
check "gate: web-portal is browser" "$(is "$(gate apps/web-portal/src/app.tsx)" browser)"
check "gate: shared ui is browser" "$(is "$(gate libs/ui/src/components/custom/text-field.tsx)" browser)"
check "gate: api and web is browser" "$(is "$(gate apps/api/src/main.ts apps/web-admin/src/app.tsx)" browser)"
check "gate: api then docs is browser" "$(is "$(gate apps/api/src/main.ts README.md)" browser)"
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

list() { printf '%s\n' "$@" | bash "$S/e2e-gate.sh" --list 2>/dev/null; }
check "gate --list: counts product paths only" "$(is "$(list apps/api/src/a.ts apps/api/src/a.spec.ts knip.json apps/api/.env.example libs/ui/x.tsx docs/a.md apps/api/test/t.spec.ts | tr '\n' ' ')" 'apps/api/src/a.ts libs/ui/x.tsx ')"
check "gate --list: docs only prints nothing" "$(is "$(list docs/a.md knip.json)" '')"

. "$S/stack-sweep.sh"
PS_FIXTURE=' 101 node --enable-source-maps /t/wt/apps/api/dist/main.cjs
 102 node /t/wt/node_modules/.pnpm/vite@7/node_modules/vite/bin/vite.js --port 4720 --strictPort --host localhost
 103 node /t/wt/node_modules/.pnpm/vite@7/node_modules/vite/bin/vite.js build
 104 node /t/other/apps/api/dist/main.cjs
 106 node /t/wt2/apps/api/dist/main.cjs
 107 /usr/bin/awk -v tree=/t/wt/ vite --strictPort dist/main.cjs
 108 vitest run --root /t/wt/apps/api'
check "sweep: matches this worktree's API bundle and strict-port vite only" "$(is "$(printf '%s\n' "$PS_FIXTURE" | sweep_match /t/wt | tr '\n' ' ')" '101 102 ')"
check "sweep: a path prefix of another worktree does not match" "$(is "$(printf '%s\n' "$PS_FIXTURE" | sweep_match /t/wt2 | tr '\n' ' ')" '106 ')"

mkdir -p "$T/bin"
cat > "$T/bin/curl" <<'CURL_EOF'
#!/usr/bin/env bash
url="${*: -1}"; w=""; out=""
while [ $# -gt 0 ]; do case "$1" in -w) w="$2"; shift ;; -o) out="$2"; shift ;; esac; shift; done
case "$url" in
  */health) [ "$FAKE_HEALTH" = down ] && exit 22; body='{"status":"ok"}'; code=200 ;;
  */me) case "$FAKE_ME" in eduvault) body='{"message":"Authentication is required","statusCode":401}'; code=401 ;; other) body='{"hello":1}'; code=200 ;; *) body='not found'; code=404 ;; esac ;;
  *) exit 22 ;;
esac
[ -n "$out" ] || printf '%s' "$body"
[ -z "$w" ] || printf '\n%s' "$code"
exit 0
CURL_EOF
chmod +x "$T/bin/curl"
pre() { PATH="$T/bin:$PATH" FAKE_HEALTH="${1:-up}" FAKE_ME="$2" E2E_API_URL=http://fake:1 bash "$S/preflight.sh" api 2>&1; }
OUT=$(pre up eduvault); check "preflight: Eduvault's API passes the identity check" "$(is $? 0)"
echo "$OUT" | grep -q 'stack=shared'; check "preflight: the e2e line names the stack" $?
OUT=$(pre up other); RC=$?; check "preflight: another project's /health fails the identity check" "$(is "$RC" 3)"
echo "$OUT" | grep -q "not Eduvault's API"; check "preflight: names the identity cause" $?
OUT=$(pre up none); check "preflight: a 404 /me fails the identity check" "$(is $? 3)"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

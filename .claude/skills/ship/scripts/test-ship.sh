#!/bin/bash
# Offline test for the ship scripts: no Herdr, no network, no real gh. Nothing outside a temp dir is touched.
# usage: bash .claude/skills/ship/scripts/test-ship.sh
set -u
W=$(cd "$(dirname "$0")" && pwd -P)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
unset HERDR_ENV
export SHIP_OPSX=$T/opsx GH_ISSUES_FIXTURE_DIR=$T/fix
mkdir -p "$SHIP_OPSX" "$GH_ISSUES_FIXTURE_DIR" "$T/bin"
printf '#!/bin/sh\nexit 1\n' > "$T/bin/gh"; chmod +x "$T/bin/gh"; export PATH="$T/bin:$PATH"
FAIL=0
ok() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (want '$2', got '$3')"; FAIL=1; fi; }
has() { if grep -qF -- "$2" <<<"$3"; then echo "ok   $1"; else echo "FAIL $1 (missing '$2')"; FAIL=1; fi; }
rc() { "$@" >/dev/null 2>&1; echo $?; }
S() { bash "$W/state.sh" "$@"; }

echo "== effort / stage table / README"
TABLE=$(bash "$W/stage-table.sh")
while read -r stage model effort; do
  has "table row $stage" "| $stage | $model | $effort |" "$TABLE"
  ok "effort.sh EDU-1 $stage" "$model $effort" "$(bash "$W/effort.sh" EDU-1 "$stage" | cut -d' ' -f1,2)"
done <<'ROWS'
propose opus high
branch haiku low
implement sonnet high
simplify sonnet medium
security opus medium
review sonnet high
fix-blockers sonnet high
e2e sonnet medium
push sonnet low
pr haiku low
ROWS
ok "effort.sh unknown stage" 2 "$(rc bash "$W/effort.sh" EDU-1 nope)"
bash "$W/gen-readme.sh" "$T/README.md" >/dev/null
norm() { sed -E 's/ +/ /g; s/-{2,}/---/g'; }
has "generated README holds the table" "$(printf '%s\n' "$TABLE" | norm)" "$(norm < "$T/README.md")"
ok "checked-in README is current" "$(cat "$T/README.md")" "$(cat "$W/../README.md" 2>/dev/null)"

echo "== state.sh"
K=EDU-7 L=$SHIP_OPSX/EDU-7/.lock
ok "stage running, no lock: attempts 1" '{"attempts": 1}' "$(S stage $K implement running)"
bash "$W/lock.sh" acquire "$L" run-a >/dev/null
S stage $K implement pass >/dev/null
ok "stage running after pass: attempts 2" '{"attempts": 2}' "$(S stage $K implement running)"
ok "same run re-marking: same_run" '{"attempts": 2, "same_run": true}' "$(S stage $K implement running)"
S stage $K implement pass >/dev/null
S stage $K implement running >/dev/null; S stage $K implement pass >/dev/null
ok "4th attempt refused (exit 11)" 11 "$(rc bash "$W/state.sh" stage $K implement running)"
ok "next: first incomplete stage" fetch "$(S next $K | jq -r .next)"
for s in fetch branch propose implement security-gate simplify review; do S stage $K $s pass >/dev/null; done
S stage $K security skipped >/dev/null; S stage $K fix-blockers skipped >/dev/null
ok "next advances to e2e" e2e "$(S next $K | jq -r .next)"
S stage $K e2e pass >/dev/null
ok "skip-e2e refused after e2e pass" 1 "$(rc bash "$W/state.sh" skip-e2e $K "no")"
ok "next after e2e pass: push" push "$(S next $K | jq -r .next)"
K2=EDU-8
ok "skip-e2e records skipped" skipped "$(S skip-e2e $K2 'docs only' >/dev/null; S get $K2 .stages.e2e.result)"
mkdir -p "$SHIP_OPSX/$K2"; printf '## Descoped\n- Bulk import of CSV rows\n\n## Soft dependencies\nNone\n' > "$SHIP_OPSX/$K2/design.md"
ok "descopes: unaccepted exits 1" 1 "$(rc bash "$W/state.sh" descopes $K2)"
S accept-descope $K2 "bulk import of csv" >/dev/null
ok "descopes: accepted exits 0" 0 "$(rc bash "$W/state.sh" descopes $K2)"
S set $K2 '.goal_line = "stale"' >/dev/null; S next $K2 >/dev/null
GOAL=$(S goal $K2)
has "goal pinned from the propose skill" "pnpm validate:quick" "$GOAL"
ok "next rewrites a drifted goal_line" "$GOAL" "$(S get $K2 .goal_line)"
S stage $K2 merge-gate pass >/dev/null
ok "merge-gate pass with no PR: next is cleanup, awaiting merge" "cleanup true" "$(S next $K2 | jq -r '"\(.next) \(.awaiting_merge)"')"
ok "bad key rejected by fetch-ticket" 2 "$(rc bash "$W/state.sh" fetch-ticket FGD-1)"

echo "== fetch-ticket against fixtures"
cat > "$GH_ISSUES_FIXTURE_DIR/issue-12.json" <<'JSON'
{"number":12,"title":"Add fee schedule CRUD","state":"open","labels":["hold-merge"],"parent":3,"blocked_by":[13],
 "body":"Needs a schedule table.\n\n## Acceptance criteria\n- [ ] Owner can create a schedule\n- Teacher cannot\n\n## Notes\nAfter #14 and EDU-15. Before #16."}
JSON
echo '{"number":13,"title":"Campuses","state":"open","labels":[],"body":""}' > "$GH_ISSUES_FIXTURE_DIR/issue-13.json"
echo '{"number":14,"title":"Closed dep","state":"closed","labels":[],"body":""}' > "$GH_ISSUES_FIXTURE_DIR/issue-14.json"
echo '{"number":15,"title":"Other dep","state":"open","labels":[],"body":""}' > "$GH_ISSUES_FIXTURE_DIR/issue-15.json"
OUT=$(S fetch-ticket EDU-12)
ok "fetch-ticket key and summary" "EDU-12 Add fee schedule CRUD" "$(jq -r '"\(.key) \(.summary)"' <<<"$OUT")"
TJ=$SHIP_OPSX/EDU-12/ticket.json
ok "acceptance criteria parsed" '["Owner can create a schedule","Teacher cannot"]' "$(jq -c .acceptance_criteria "$TJ")"
ok "soft deps are the 'after' refs only" '["EDU-14","EDU-15"]' "$(jq -c .soft_deps "$TJ")"
ok "blocked_by becomes an inward link" '["EDU-13"]' "$(jq -c '[.links[] | select(.direction == "inward") | .key]' "$TJ")"
ok "labels kept" '["hold-merge"]' "$(jq -c .labels "$TJ")"
ok "fetch recorded pass" pass "$(S get EDU-12 .stages.fetch.result)"
DEPS=$(S deps EDU-12); drc=$?
ok "deps: unmet are the open ones" '["EDU-13","EDU-15"]' "$(jq -c '.unmet | sort' <<<"$DEPS")"
ok "deps: exit 1 while unmet" 1 "$(rc bash "$W/state.sh" deps EDU-12)"
ok "issue_pending lists the in-progress write" '["assign+in_progress"]' "$(S next EDU-12 | jq -c .issue_pending)"
ok "issue-sync is dry-run under fixtures and records" '{"synced":["in-progress"]}' "$(bash "$W/issue-sync.sh" EDU-12)"

echo "== verify.sh"
K=EDU-30; D=$SHIP_OPSX/$K; mkdir -p "$D"
V() { bash "$W/verify.sh" "$K" "$@"; }
age() { python3 -c 'import os,sys,time; t=time.time()-int(sys.argv[2]); os.utime(sys.argv[1], (t, t))' "$1" "$2"; }
bash "$W/lock.sh" acquire "$D/.lock" run-b >/dev/null
S stage $K simplify running >/dev/null
ok "no handoff: exit 2" 2 "$(rc bash "$W/verify.sh" $K simplify)"
echo '{"result":"pass","summary":"clean"}' > "$D/simplify.json"; age "$D/simplify.json" 3600
ok "stale handoff: exit 2" 2 "$(rc bash "$W/verify.sh" $K simplify)"
has "stale handoff says why" "older than this attempt" "$(V simplify)"
echo '{"result":"pass","summary":"clean"}' > "$D/simplify.json"
ok "fresh handoff: exit 0" 0 "$(rc bash "$W/verify.sh" $K simplify)"
echo '{"result":"fail","summary":"x","failure_reason":"a test broke"}' > "$D/simplify.json"
ok "fresh fail: exit 1" 1 "$(rc bash "$W/verify.sh" $K simplify)"
echo 'not json' > "$D/simplify.json"
ok "malformed handoff: exit 2" 2 "$(rc bash "$W/verify.sh" $K simplify)"
S stage $K review running >/dev/null
echo '{"result":"pass","blockers":2,"summary":"s"}' > "$D/review.json"; echo r > "$D/review.md"
ok "review with blockers is a pass carrying the count" '{"stage":"review","ok":true,"reason":"2 blocker(s)","blockers":2}' "$(V review)"
S stage $K pr running >/dev/null
echo '{"result":"pass","pr_url":"https://github.com/o/r/pull/9"}' > "$D/pr.json"
ok "pr handoff yields the url" "https://github.com/o/r/pull/9" "$(V pr | jq -r .pr_url)"
echo '{"result":"pass","pr_url":"nope"}' > "$D/pr.json"
ok "pr handoff without a PR url: exit 2" 2 "$(rc bash "$W/verify.sh" $K pr)"

echo "== Herdr guard (HERDR_ENV unset)"
for c in "setup.sh EDU-1" "worker.sh status EDU-1" "worker.sh dispatch EDU-1 implement" "wait-worker.sh EDU-1 5" "ready.sh nobody 0"; do
  OUT=$(bash "$W/${c%% *}" ${c#* } 2>&1); R=$?
  ok "$c exits non-zero" 2 "$R"
  has "$c names Herdr" "needs Herdr" "$OUT"
done
ok "setup.sh bad key is usage (1), before the guard" 1 "$(rc bash "$W/setup.sh" nope)"
OUT=$(HERDR_ENV=1 CLAUDE_PID=123 bash "$W/setup.sh" edu-9); R=$?
ok "setup.sh with HERDR_ENV set passes" 0 "$R"
ok "setup.sh normalises the key" "EDU-9 123" "$(jq -r '"\(.key) \(.claude_pid)"' <<<"$OUT")"

echo
[ $FAIL -eq 0 ] && echo "ALL PASS" || echo "FAILURES"
exit $FAIL

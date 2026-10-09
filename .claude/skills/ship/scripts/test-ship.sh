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

echo "== herdr agent names"
. "$W/lib.sh"
for case in "EDU-1 implement 1" "EDU-1234 fix-blockers 1" "EDU-99999 fix-blockers 12"; do
  set -- $case
  n=$(worker_agent_name "$1" "$2" "$3")
  ok "agent name '$n' is 1-32 chars of [a-z0-9_-] starting with a letter" 0 "$([ ${#n} -ge 1 ] && [ ${#n} -le 32 ] && printf '%s' "$n" | grep -qE '^[a-z][a-z0-9_-]*$'; echo $?)"
done

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
S stage $K security running >/dev/null
echo '{"result":"pass","blockers":2,"summary":"s","files_reviewed":["a.ts"]}' > "$D/security.json"; echo r > "$D/security.md"
ok "security with blockers is a pass carrying the count" '{"stage":"security","ok":true,"reason":"2 blocker(s)","blockers":2}' "$(V security)"
S stage $K pr running >/dev/null
echo '{"result":"pass","pr_url":"https://github.com/o/r/pull/9"}' > "$D/pr.json"
ok "pr handoff yields the url" "https://github.com/o/r/pull/9" "$(V pr | jq -r .pr_url)"
echo '{"result":"pass","pr_url":"nope"}' > "$D/pr.json"
ok "pr handoff without a PR url: exit 2" 2 "$(rc bash "$W/verify.sh" $K pr)"

echo "== verify.sh review: fan-out handoffs and the Result line"
RV() { printf '%s\n' "$1" > "$D/review.md"; echo "$2" > "$D/review.json"; }
good_md='Result: 2 blockers, 0 majors, 1 minors.

### Blockers
- **S1. first**
- **S2. second**

### Major

None

### Minor
- **T1. third**'
S stage $K review running >/dev/null
RV "$good_md" '{"result":"pass","blockers":2,"majors":0,"summary":"s"}'
ok "review without the two axis handoffs: exit 2" 2 "$(rc bash "$W/verify.sh" $K review)"
has "review without the axis handoffs says why" "sub-agents" "$(V review)"
echo spec > "$D/review-spec.md"; echo std > "$D/review-standards.md"
ok "review with counts matching: pass with majors and unmet criteria" '{"stage":"review","ok":true,"reason":"2 blocker(s)","majors":0,"unmet_criteria":[],"blockers":2}' "$(V review)"
RV "$(sed 's/1 minors/2 minors/' <<<"$good_md")" '{"result":"pass","blockers":2,"majors":0,"summary":"s"}'
ok "review header and body disagree: exit 2" 2 "$(rc bash "$W/verify.sh" $K review)"
has "review disagreement names both counts" "says 2 blockers, 0 majors, 2 minors but lists 2, 0, 1" "$(V review)"
RV "$(sed 1,2d <<<"$good_md")" '{"result":"pass","blockers":2,"summary":"s"}'
ok "review without a Result line: exit 2" 2 "$(rc bash "$W/verify.sh" $K review)"
RV "$good_md" '{"result":"pass","blockers":1,"summary":"s"}'
ok "review.json blockers differ from the Result line: exit 2" 2 "$(rc bash "$W/verify.sh" $K review)"
RV "Result: 1 blockers, 0 majors, 0 minors." '{"result":"pass","blockers":1,"summary":"s"}'
ok "review with a count but no listed finding: exit 2" 2 "$(rc bash "$W/verify.sh" $K review)"
RV "$(printf 'Result: 0 blockers, 1 majors, 0 minors.\n\n### Major\n**S1. user menu has three items**\n')" '{"result":"pass","blockers":0,"majors":1,"unmet_criteria":["AC10"],"summary":"s"}'
ok "review with a major and an unmet criterion passes carrying both" '{"stage":"review","ok":true,"reason":"0 blocker(s)","majors":1,"unmet_criteria":["AC10"],"blockers":0}' "$(V review)"

echo "== verify.sh fix-blockers: majors, unmet criteria, deferrals"
S stage $K fix-blockers running >/dev/null
RV "Result: 0 blockers, 0 majors, 0 minors." '{"result":"pass","blockers":0,"majors":0,"unmet_criteria":["AC10"],"summary":"s"}'
echo '{"result":"pass","blockers_remaining":0,"summary":"s"}' > "$D/fix-blockers.json"
ok "fix-blockers with an unmet criterion left: exit 1" 1 "$(rc bash "$W/verify.sh" $K fix-blockers)"
RV "$(printf 'Result: 0 blockers, 1 majors, 0 minors.\n\n### Major\n- **S1. menu**\n')" '{"result":"pass","blockers":0,"majors":1,"summary":"s"}'
ok "fix-blockers with a major left and no deferral: exit 1" 1 "$(rc bash "$W/verify.sh" $K fix-blockers)"
echo '{"result":"pass","blockers_remaining":0,"summary":"s","deferred":[{"id":"S1","reason":"needs /me/permissions, out of this slice"}]}' > "$D/fix-blockers.json"
ok "fix-blockers with the major deferred with a reason passes carrying it" '{"stage":"fix-blockers","ok":true,"reason":"0 blockers","deferred":[{"id":"S1","reason":"needs /me/permissions, out of this slice"}]}' "$(V fix-blockers)"
RV "$(printf 'Result: 0 blockers, 0 majors, 0 minors.\n')" '{"result":"pass","blockers":0,"majors":0,"unmet_criteria":[],"summary":"s"}'
echo '{"result":"pass","blockers_remaining":0,"summary":"s"}' > "$D/fix-blockers.json"
ok "fix-blockers with nothing left passes" 0 "$(rc bash "$W/verify.sh" $K fix-blockers)"

echo "== verify.sh simplify: deferring as too large"
K3=EDU-31; D3=$SHIP_OPSX/$K3; mkdir -p "$D3"
bash "$W/lock.sh" acquire "$D3/.lock" run-c >/dev/null
S stage $K3 simplify running >/dev/null
echo '{"result":"pass","summary":"s","deferred":[{"item":"shared test stubs","reason":"larger refactor across apps"}]}' > "$D3/simplify.json"
ok "attempt 1 deferring as too large: exit 2" 2 "$(rc bash "$W/verify.sh" $K3 simplify)"
has "the deferral names the way on" "--note" "$(bash "$W/verify.sh" $K3 simplify)"
S stage $K3 simplify pass >/dev/null; S stage $K3 simplify running >/dev/null
echo '{"result":"pass","summary":"s","deferred":[{"item":"shared test stubs","reason":"larger refactor across apps"}]}' > "$D3/simplify.json"
ok "attempt 2 passes and carries the deferral to the PR body" '{"stage":"simplify","ok":true,"reason":"s","deferred":[{"item":"shared test stubs","reason":"larger refactor across apps"}]}' "$(bash "$W/verify.sh" $K3 simplify)"
S stage $K3 simplify pass >/dev/null; S stage $K3 simplify running >/dev/null; S stage $K3 simplify pass >/dev/null
S stage $K3 simplify running >/dev/null
echo '{"result":"pass","summary":"s","deferred":[{"item":"x","reason":"the lib has no owner yet"}]}' > "$D3/simplify.json"
ok "a concrete-blocker deferral on attempt 1 passes" 0 "$(rc bash "$W/verify.sh" $K3 simplify)"

echo "== verify.sh required specs (integration, drift) per tree"
WT=$T/wt; git init -q -b main "$WT"
G() { git -C "$WT" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$WT/apps/api/src" "$WT/apps/web-admin/src"; echo base > "$WT/apps/api/src/a.ts"; echo base > "$WT/apps/web-admin/src/b.ts"
G add -A; G commit -qm base; G update-ref refs/remotes/origin/main HEAD; G checkout -q -b feat
K4=EDU-32; D4=$SHIP_OPSX/$K4; mkdir -p "$D4"
bash "$W/lock.sh" acquire "$D4/.lock" run-d >/dev/null
S set $K4 ".worktree_path = \"$WT\"" >/dev/null
printf -- '- [x] one\n' > "$D4/tasks.md"
S stage $K4 implement running >/dev/null
echo change > "$WT/apps/web-admin/src/b.ts"
ok "web-only change: no required specs" '{"stage":"implement","ok":true,"reason":"all 1 tasks checked"}' "$(bash "$W/verify.sh" $K4 implement)"
echo change > "$WT/apps/api/src/a.ts"
ok "api change requires the integration suite" '["api:test-integration"]' "$(bash "$W/verify.sh" $K4 implement | jq -c .unrun_specs)"
S ran $K4 api:test-integration >/dev/null
ok "recorded on this tree: not required again" 'null' "$(bash "$W/verify.sh" $K4 implement | jq -c .unrun_specs)"
echo change2 > "$WT/apps/api/src/a.ts"
ok "tree changed since the recorded run: required again" '["api:test-integration"]' "$(bash "$W/verify.sh" $K4 implement | jq -c .unrun_specs)"
mkdir -p "$WT/apps/api/db/migrations"; echo sql > "$WT/apps/api/db/migrations/1_x.sql"
ok "a migration adds drift" '["api:test-integration","pnpm drift"]' "$(bash "$W/verify.sh" $K4 implement | jq -c .unrun_specs)"
echo '{"result":"pass","unrun_specs":["apps/api/test/tenancy.integration.spec.ts (Docker)"]}' > "$D4/implement.json"
ok "the worker's own integration entry is not doubled" '["apps/api/test/tenancy.integration.spec.ts (Docker)","pnpm drift"]' "$(bash "$W/verify.sh" $K4 implement | jq -c .unrun_specs)"

echo "== state.sh: stale propagation, halt, run, note, ran"
K5=EDU-33
for s in implement security-gate simplify review security e2e; do S stage $K5 $s pass >/dev/null; done
S stage $K5 fix-blockers skipped >/dev/null
ok "stage-after simplify marks the finished dependents" '{"stale":["review","security","fix-blockers","e2e"]}' "$(S stale-after $K5 simplify)"
ok "a stale stage is incomplete in next" '["review","security","fix-blockers","e2e"]' "$(S next $K5 | jq -c .stale)"
ok "stale resets attempts" 0 "$(S get $K5 '.stages.review.attempts')"
ok "stale keeps the cause" simplify "$(S get $K5 '.stages.review.stale_by')"
K6=EDU-34
for s in implement security-gate simplify review e2e; do S stage $K6 $s pass >/dev/null; done
S stage $K6 security skipped >/dev/null; S stage $K6 fix-blockers skipped >/dev/null
S stage $K6 simplify running >/dev/null
ok "rerun simplify: a skipped security stays skipped" skipped "$(S get $K6 .stages.security.result)"
ok "rerun simplify: review is stale" stale "$(S get $K6 .stages.review.result)"
ok "rerun simplify: a skipped fix-blockers is stale" stale "$(S get $K6 .stages.\"fix-blockers\".result)"
S stage $K6 simplify pass >/dev/null
S stage $K6 implement running >/dev/null
ok "rerun implement: a skipped security goes stale too" stale "$(S get $K6 .stages.security.result)"
ok "rerun implement: security-gate goes stale" stale "$(S get $K6 '.stages["security-gate"].result')"
K7=EDU-35
ok "stage skipped and fail exit 0" "0 0" "$(S stage EDU-39 security skipped >/dev/null; a=$?; S stage EDU-39 e2e fail >/dev/null; echo "$a $?")"
S stage $K7 security-gate pass >/dev/null; S stage $K7 simplify running >/dev/null
ok "first run of simplify leaves security-gate alone" pass "$(S get $K7 '.stages["security-gate"].result')"
S stage $K7 simplify running >/dev/null
ok "the same attempt again changes nothing" pass "$(S get $K7 '.stages["security-gate"].result')"
S halt $K7 e2e "stack would not start" >/dev/null
ok "halt records the stage as fail" fail "$(S get $K7 .stages.e2e.result)"
ok "halt records where and why" "e2e stack would not start" "$(S get $K7 '"\(.halt.stage) \(.halt.reason)"')"
S stage $K7 e2e running >/dev/null
ok "running again clears the halt" "" "$(S get $K7 .halt)"
ok "halt needs a reason" 2 "$(rc bash "$W/state.sh" halt $K7 e2e)"
K8=EDU-36
S stage $K8 fetch pass >/dev/null; S stage $K8 propose pass >/dev/null
ok "next: propose already passed, so only branch runs" '["branch"]' "$(S next $K8 | jq -c .run)"
S stage $K8 propose running >/dev/null
ok "next: propose unfinished runs beside branch" '["branch","propose"]' "$(S next $K8 | jq -c .run)"
K9=EDU-37
for s in fetch branch propose implement simplify; do S stage $K9 $s pass >/dev/null; done
S stage $K9 security-gate pass '{"fires":true}' >/dev/null
ok "next: review carries security when the gate fired" '["review","security"]' "$(S next $K9 | jq -c .run)"
S stage $K9 security pass >/dev/null
ok "next: security already passed, review alone" '["review"]' "$(S next $K9 | jq -c .run)"
K10=EDU-38
for s in fetch branch propose implement simplify; do S stage $K10 $s pass >/dev/null; done
S stage $K10 security-gate pass '{"fires":false}' >/dev/null; S stage $K10 security skipped >/dev/null
ok "next: gate not fired, review alone" '["review"]' "$(S next $K10 | jq -c .run)"
S note $K10 simplify "do the dedup" >/dev/null
OUT=$(bash "$W/prompt.sh" $K10 simplify); has "prompt.sh appends the note" "do the dedup" "$(cat "$OUT")"
has "the note is introduced" "Extra instructions for this attempt" "$(cat "$OUT")"
S stage $K10 simplify pass >/dev/null
OUT=$(bash "$W/prompt.sh" $K10 simplify); ok "a pass drops the note" "" "$(grep -F 'do the dedup' "$OUT")"
ok "ran without a tree: exit 1" 1 "$(rc bash "$W/state.sh" ran $K10 api:test-integration)"

echo "== state.sh descopes: restated text and follow-ups"
K11=EDU-19; D11=$SHIP_OPSX/$K11; mkdir -p "$D11"
jq -n '{description: "The e2e personas are re-keyed. Deliberately out of this slice: starter roles and the no-roles member, the super admin, portal logins, all money, calendar and class data, and the fixture rewrites owned by M1.1 and M1.2. There are no new tables.", acceptance_criteria: ["Skipped isolation cases (8 to 12) are listed with their unblocking slice, and an isolation block is the documented convention.", "Existing auth and CRUD specs still pass unchanged."]}' > "$D11/ticket.json"
cat > "$D11/design.md" <<'DESIGN_EOF'
## Descoped
- Fee-schedule list does not validate a foreign `campusId` filter the way students do: not in this issue's routes or criteria; M3.2 owns fee lines.
- Isolation cases 8-12: wait for class scope, portal routes, referenced money, approvals and acting; listed with their slices as the criteria require, not implemented.
- Starter roles and the no-roles member (Kemi), the super admin, portal logins, all money, calendar and class data, and the fixture rewrites owned by M1.1 and M1.2: explicitly out of this issue.
DESIGN_EOF
OUT=$(S descopes $K11); R=$?
ok "descopes: a real gap remains, exit 1" 1 "$R"
ok "descopes: the two ticket restatements are accepted via the ticket" '["ticket","ticket"]' "$(jq -c '[.descoped[] | select(.via) | .via]' <<<"$OUT")"
ok "descopes: only the fee-schedule item is a gap" 1 "$(jq '.gaps | length' <<<"$OUT")"
has "descopes: the gap is the fee-schedule one" "Fee-schedule list" "$(jq -r '.gaps[0]' <<<"$OUT")"
ok "followup records the gap as accepted with its issue" '{"followup":"dry-run"}' "$(S followup $K11 "Fee-schedule list does not validate a foreign campusId filter the way students do")"
ok "descopes: nothing left after the follow-up" 0 "$(rc bash "$W/state.sh" descopes $K11)"
ok "followup needs an item" 2 "$(rc bash "$W/state.sh" followup $K11)"

echo "== lock.sh steal"
L=$T/lk/.lock; mkdir -p "$T/lk"
bash "$W/lock.sh" acquire "$L" run-x >/dev/null
ok "steal inside the grace refuses" 40 "$(rc bash "$W/lock.sh" steal "$L" run-y)"
ok "the lock stays with its owner" run-x "$(jq -r .run_id "$L")"
ok "steal from a dead owner (no heartbeat process, grace 0)" 0 "$(LOCK_STEAL_GRACE=0 rc bash "$W/lock.sh" steal "$L" run-y)"
ok "the thief owns the lock" run-y "$(jq -r .run_id "$L")"
bash "$W/heartbeat.sh" "$L" run-y $$ 60 >/dev/null 2>&1 &
HB=$!; sleep 1
ok "steal while the owner's heartbeat runs refuses" 40 "$(LOCK_STEAL_GRACE=0 rc bash "$W/lock.sh" steal "$L" run-z)"
kill $HB 2>/dev/null; pkill -f "heartbeat.sh $L " 2>/dev/null
ok "steal of your own lock is a no-op success" 0 "$(rc bash "$W/lock.sh" steal "$L" run-y)"

echo "== finish.sh (stub gh)"
mkdir -p "$T/bin2"
cat > "$T/bin2/gh" <<'GH_EOF'
#!/bin/sh
echo "$*" >> "$GH_LOG"
case "$1 $2" in "pr view") cat "$GH_VIEW" ;; *) exit 0 ;; esac
GH_EOF
chmod +x "$T/bin2/gh"
export GH_LOG=$T/gh.log GH_VIEW=$T/gh.view
F() { PATH="$T/bin2:$PATH" bash "$W/finish.sh" "$@"; }
view() { echo "{\"state\":\"$1\",\"isDraft\":$2,\"mergeable\":\"$3\",\"headRefOid\":\"abc123\",\"labels\":$4,\"statusCheckRollup\":$5}" > "$GH_VIEW"; }
GREEN='[{"conclusion":"SUCCESS"},{"conclusion":"SKIPPED"}]'
KF=EDU-40
S set $KF '.pr_url = "https://github.com/o/r/pull/7"' >/dev/null
ok "finish before the gate passed: exit 2" 2 "$(rc F $KF)"
S stage $KF merge-gate pass >/dev/null
: > "$GH_LOG"; view OPEN true MERGEABLE '[]' "$GREEN"
OUT=$(F $KF); ok "finish dry run: exit 0" 0 "$?"
ok "finish dry run lists ready, merge at the head and close" '["mark ready","squash-merge at abc123","close issue #40"]' "$(jq -c .plan <<<"$OUT")"
ok "finish dry run touches nothing" "" "$(grep -E '^pr (ready|merge)' "$GH_LOG")"
view OPEN true MERGEABLE '[]' '[{"conclusion":""}]'
ok "a pending check refuses" 1 "$(rc F $KF --yes)"
view OPEN true MERGEABLE '[]' '[{"conclusion":"FAILURE"}]'
ok "a failed check refuses" 1 "$(rc F $KF --yes)"
view OPEN true MERGEABLE '[]' '[]'
ok "no checks at all refuses" 1 "$(rc F $KF --yes)"
view OPEN true CONFLICTING '[]' "$GREEN"
ok "a conflict refuses" 1 "$(rc F $KF --yes)"
view OPEN true MERGEABLE '[{"name":"hold-merge"}]' "$GREEN"
ok "hold-merge refuses with 23" 23 "$(rc F $KF --yes)"
view CLOSED true MERGEABLE '[]' "$GREEN"
ok "a closed PR: 21" 21 "$(rc F $KF --yes)"
ok "none of the refusals merged" "" "$(grep -E '^pr (ready|merge)' "$GH_LOG")"
view OPEN true MERGEABLE '[]' "$GREEN"
OUT=$(F $KF --yes); ok "finish --yes: exit 0" 0 "$?"
has "finish marks the draft ready" "pr ready https://github.com/o/r/pull/7" "$(cat "$GH_LOG")"
has "finish merges at the gate's head, squash, no admin" "pr merge https://github.com/o/r/pull/7 --squash --match-head-commit abc123" "$(cat "$GH_LOG")"
ok "finish never uses --admin" "" "$(grep -- --admin "$GH_LOG")"
ok "finish records the merge" true "$(S get $KF .merged)"
ok "finish closes the issue (dry under fixtures)" '{"merged":"https://github.com/o/r/pull/7","closed":40}' "$(jq -c . <<<"$OUT")"
ok "finish records the close" yes "$([ -n "$(S get $KF .finish.issue_closed)" ] && echo yes)"
: > "$GH_LOG"; view MERGED false MERGEABLE '[]' "$GREEN"
ok "an already merged PR still closes the issue, no second merge" "" "$(F $KF --yes >/dev/null; grep -E '^pr (ready|merge)' "$GH_LOG")"

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

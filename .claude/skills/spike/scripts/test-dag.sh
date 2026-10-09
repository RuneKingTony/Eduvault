#!/bin/bash
# Tests for the spike DAG code. No Herdr and no network: dag.mjs runs on JSON files, only.mjs on strings, and the
# end-to-end cases drive init.sh / graph.sh / walk.sh --dry-run over fixtures/<case>/issue-<N>.json through
# GH_ISSUES_FIXTURE_DIR. Prints PASS/FAIL per case; exit 1 on any failure.
set -u
HERE=$(cd "$(dirname "$0")" && pwd -P)
DAG=$HERE/dag.mjs ONLY=$HERE/only.mjs FIX=$HERE/fixtures
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail=0
ok()  { echo "PASS $1"; }
bad() { echo "FAIL $1${2:+ — $2}"; fail=1; }
check() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }

# ---- dag.mjs on hand-built graphs ------------------------------------------------------------------------
# diamond 10→11,12→13 · component 20→21 · 30 blocked by external 99 · 40 already closed
cat > "$T/g.json" <<'J'
{"epic":"EDU-1","hash":"h","nodes":[
{"key":"EDU-10","summary":"a","done":false},{"key":"EDU-11","summary":"b","done":false},
{"key":"EDU-12","summary":"c","done":false},{"key":"EDU-13","summary":"d","done":false},
{"key":"EDU-20","summary":"e","done":false},{"key":"EDU-21","summary":"f","done":false},
{"key":"EDU-30","summary":"g","done":false},{"key":"EDU-99","summary":"x","done":false,"external":true},
{"key":"EDU-40","summary":"h","done":true}],
"edges":{"EDU-11":["EDU-10"],"EDU-12":["EDU-10"],"EDU-13":["EDU-11","EDU-12"],"EDU-21":["EDU-20"],"EDU-30":["EDU-99"]}}
J
t() {  # <name> <observed> <status> <jq expr that must be true>
  echo "$2" > "$T/o.json"; echo "$3" > "$T/s.json"
  if node "$DAG" next "$T/g.json" "$T/o.json" "$T/s.json" | jq -e "$4" >/dev/null; then ok "$1"; else bad "$1"; fi
}
S='{"concurrency":3,"dispatched":{}}'
t "critical path first"        '{}' "$S" '.dispatch == ["EDU-10","EDU-20"]'
t "merge unblocks dependents"  '{"EDU-10":{"state":"done"}}' "$S" '.dispatch[:2] == ["EDU-11","EDU-12"]'
t "halt freezes its component" '{"EDU-20":{"state":"halted"}}' "$S" '.frozen == ["EDU-21"] and (.dispatch | index("EDU-10"))'
t "blocked-ui is not stalled"  '{"EDU-10":{"state":"blocked-ui"},"EDU-20":{"state":"halted"}}' "$S" '.stalled == false'
t "external blocker gates"     '{}' '{"only":["EDU-30"],"dispatched":{}}' '.stalled and .blocked["EDU-30"] == ["EDU-99"]'
t "--only unknown key errors"  '{}' '{"only":["EDU-555"],"dispatched":{}}' '.errors | length == 1'
t "concurrency fills slots"    '{"EDU-10":{"state":"running"}}' '{"concurrency":1,"dispatched":{"EDU-10":{}}}' '.slots == 0 and .dispatch == []'
t "blocked-ui holds its slot"  '{"EDU-10":{"state":"blocked-ui"}}' '{"concurrency":1,"dispatched":{"EDU-10":{}}}' '.slots == 0 and .dispatch == []'
t "concurrency 15 clamps to 10" '{}' '{"concurrency":15,"dispatched":{}}' '.cap == 10'
t "concurrency 10 stays 10"    '{}' '{"concurrency":10,"dispatched":{}}' '.cap == 10'
t "concurrency default is 3"   '{}' '{"dispatched":{}}' '.cap == 3'
t "max-tickets stops cleanly"  '{"EDU-10":{"state":"done"}}' '{"max_tickets":1,"dispatched":{"EDU-10":{}}}' '.budget_done and (.stalled | not)'
t "max-tickets cuts dispatch"  '{}' '{"concurrency":3,"max_tickets":1,"dispatched":{}}' '.slots == 3 and .dispatch == ["EDU-10"]'
t "budget counts this run only" '{"EDU-10":{"state":"done"}}' '{"max_tickets":1,"run_started":1000,"dispatched":{"EDU-10":{"epoch":900}}}' '.budget_left == 1 and (.budget_done | not) and (.dispatch | length) == 1'
t "budget spent within the run" '{"EDU-10":{"state":"running"}}' '{"max_tickets":1,"run_started":1000,"dispatched":{"EDU-10":{"epoch":1001}}}' '.budget_left == 0 and .dispatch == []'
t "withdrawn frees its slot"   '{"EDU-10":{"state":"running"}}' '{"concurrency":1,"dispatched":{"EDU-10":{"withdrawn_at":"x"}}}' '.slots == 1 and .dispatch == ["EDU-10"] and .withdrawn == ["EDU-10"]'
t "withdrawn, ship still live" '{"EDU-10":{"state":"withdrawn"}}' '{"concurrency":1,"dispatched":{"EDU-10":{"withdrawn_at":"x"}}}' '.slots == 1 and .dispatch == ["EDU-20"] and (.inflight | length) == 0'
t "withdrawn but merged is done" '{"EDU-10":{"state":"done"}}' '{"dispatched":{"EDU-10":{"withdrawn_at":"x"}}}' '(.done | index("EDU-10")) and .withdrawn == []'
t "merged-outside-ship unblocks" '{"EDU-10":{"state":"merged-outside-ship"}}' "$S" '.dispatch[:2] == ["EDU-11","EDU-12"] and .merged_outside == ["EDU-10"]'
t "waiting-user holds a slot"  '{"EDU-10":{"state":"waiting-user","pane_tail":"?"}}' '{"concurrency":1,"dispatched":{"EDU-10":{}}}' '.slots == 0 and (.stalled | not) and .waiting_user[0].key == "EDU-10" and .frozen == []'
t "died freezes its component" '{"EDU-20":{"state":"died"}}' "$S" '.frozen == ["EDU-21"] and .halted[0].state == "died"'

cat > "$T/gh.json" <<'J'
{"epic":"EDU-1","hash":"h","nodes":[{"key":"EDU-20","summary":"a","done":false},{"key":"EDU-21","summary":"b","done":false},
{"key":"EDU-22","summary":"c","done":false}],"edges":{"EDU-21":["EDU-20","EDU-22"]}}
J
th() {  # <graph> <name> <observed> <status> <jq expr that must be true>
  echo "$3" > "$T/o.json"; echo "$4" > "$T/s.json"
  if node "$DAG" next "$T/$1.json" "$T/o.json" "$T/s.json" | jq -e "$5" >/dev/null; then ok "$2"; else bad "$2"; fi
}
H='{"EDU-20":{"state":"held","reason":"the PR carries hold-merge","pr_url":"https://x/pull/1"}}'
th gh "held does not freeze; unrelated sibling is eligible" "$H" "$S" '.dispatch == ["EDU-22"] and .frozen == [] and .halted == [] and .held[0].key == "EDU-20"'
th gh "held's dependents stay blocked" "$H" "$S" '.blocked["EDU-21"] == ["EDU-20","EDU-22"] and (.complete | not) and (.stalled | not) and (.held_done | not)'
th gh "held + sibling done: held_done, not stalled" '{"EDU-20":{"state":"held"},"EDU-22":{"state":"done"}}' "$S" '.held_done and (.stalled | not) and (.complete | not)'

cat > "$T/gs.json" <<'J'
{"epic":"EDU-1","hash":"h","nodes":[{"key":"EDU-50","summary":"a","done":false},{"key":"EDU-51","summary":"b","done":false},
{"key":"EDU-52","summary":"c","done":false},{"key":"EDU-98","summary":"x","done":false,"external":true}],"edges":{},
"soft_edges":[{"key":"EDU-51","blocked_by":"EDU-50","from":"EDU-51","phrase":"do after EDU-50","in_epic":true},
{"key":"EDU-52","blocked_by":"EDU-98","from":"EDU-52","phrase":"do after EDU-98","in_epic":false}]}
J
th gs "soft edge gates dispatch like a link" '{}' "$S" '.dispatch == ["EDU-50"] and .blocked["EDU-51"] == ["EDU-50"] and .blocked["EDU-52"] == ["EDU-98"]'
th gs "soft blocker merged releases it" '{"EDU-50":{"state":"done"}}' "$S" '.dispatch == ["EDU-51"] and .soft_edges[0].satisfied'
jq '.soft_edges += [{"key":"EDU-50","blocked_by":"EDU-51","from":"EDU-50","phrase":"after EDU-51","in_epic":true}]' "$T/gs.json" > "$T/gsc.json"
node "$DAG" validate "$T/gsc.json" | jq -e '.errors | map(test("cycle")) | any' >/dev/null && ok "soft cycle is a graph error" || bad "soft cycle is a graph error"
jq '.soft_edges[0].blocked_by = "EDU-77"' "$T/gs.json" > "$T/gsx.json"
node "$DAG" validate "$T/gsx.json" | jq -e '.errors | map(test("EDU-77")) | any' >/dev/null && ok "soft dangling ref is a graph error" || bad "soft dangling ref is a graph error"
jq '.edges["EDU-10"]=["EDU-13"] | .edges["EDU-21"]=["EDU-77"]' "$T/g.json" > "$T/bad.json"
node "$DAG" validate "$T/bad.json" | jq -e '(.errors | map(test("cycle")) | any) and (.errors | map(test("EDU-77")) | any)' >/dev/null \
  && ok "cycle + dangling ref" || bad "cycle + dangling ref"

# ---- only.mjs: --only expansion -------------------------------------------------------------------------
o() { node "$ONLY" "$1" 2>&1; }
[ "$(o 401-404 | jq -c .keys)" = '["EDU-401","EDU-402","EDU-403","EDU-404"]' ] && ok "range expands" || bad "range expands"
[ "$(o '401-410,415,420-425' | jq '.keys | length')" = 17 ] && ok "mixed ranges and singles" || bad "mixed ranges and singles"
[ "$(o '401-403,402,EDU-403,edu-401-edu-404' | jq -c .keys)" = '["EDU-401","EDU-402","EDU-403","EDU-404"]' ] && ok "overlap and key forms dedupe" || bad "overlap and key forms dedupe"
[ "$(o '+410-411' | jq -c '[.append, .keys]')" = '[true,["EDU-410","EDU-411"]]' ] && ok "+ append form with a range" || bad "+ append form with a range"
node "$ONLY" 410-401 >/dev/null 2>&1; [ $? = 2 ] && ok "reversed range is refused" || bad "reversed range is refused"
node "$ONLY" 401-xyz >/dev/null 2>&1; [ $? = 2 ] && ok "garbage token is refused" || bad "garbage token is refused"
node "$ONLY" 1-9999 >/dev/null 2>&1; [ $? = 2 ] && ok "oversized range is refused" || bad "oversized range is refused"

# ---- end to end: init.sh / graph.sh / walk.sh --dry-run over fixtures, with no Herdr -------------------------
unset HERDR_ENV
n=0
e2e() {  # <case> <epic> <init flags...>; sets OUT (dry-run board), RC, GRAPH_RC
  local c=$1 e=$2; shift 2; n=$((n + 1))
  export SPIKE_OPSX=$T/opsx$n GH_ISSUES_FIXTURE_DIR=$FIX/$c SPIKE_NOTIFY=0
  mkdir -p "$SPIKE_OPSX"
  INIT=$(bash "$HERE/init.sh" "$e" "$@" --dry-run 2>&1); INIT_RC=$?
  GRAPH=$(bash "$HERE/graph.sh" "$e" --fresh 2>&1); GRAPH_RC=$?
  OUT=""; RC=0
  [ $INIT_RC = 0 ] && [ $GRAPH_RC = 0 ] && { OUT=$(bash "$HERE/walk.sh" "$e" --dry-run 2>&1); RC=$?; }
}
e2e linear EDU-100
[ $RC = 0 ] && grep -q 'would dispatch now: EDU-101$' <<<"$OUT" && grep -q 'order: EDU-101(d2)' <<<"$OUT" && ok "linear chain: head first" || bad "linear chain: head first" "$OUT"
[ "$(jq -c '.edges' "$SPIKE_OPSX/epic-EDU-100/graph.json")" = '{"EDU-102":["EDU-101"],"EDU-103":["EDU-102"]}' ] && ok "linear chain: edges from blocked_by links" || bad "linear chain: edges"
grep -q 'EDU-103.*waits on EDU-102' <<<"$OUT" && ok "linear chain: tail waits on its blocker" || bad "linear chain: tail waits"
e2e diamond EDU-100 --concurrency 5
grep -q 'would dispatch now: EDU-101$' <<<"$OUT" && grep -q 'EDU-104.*waits on EDU-102, EDU-103' <<<"$OUT" && ok "diamond: only the root starts, join waits on both" || bad "diamond" "$OUT"
check "diamond: no state left outside dry-status" test ! -e "$SPIKE_OPSX/epic-EDU-100/status.json"
e2e cycle EDU-100
[ $GRAPH_RC = 1 ] && grep -q 'cycle: .*EDU-10[12]' <<<"$GRAPH" && ok "cycle is a hard halt" || bad "cycle is a hard halt" "$GRAPH"
e2e external EDU-100
grep -q 'would dispatch now: EDU-102$' <<<"$OUT" && grep -q 'EDU-101.*waits on EDU-900' <<<"$OUT" && ok "external blocker gates its ticket" || bad "external blocker gates" "$OUT"
[ "$(jq -c '[.nodes[] | select(.external) | .key]' "$SPIKE_OPSX/epic-EDU-100/graph.json")" = '["EDU-900"]' ] && ok "external blocker becomes an external node" || bad "external node"
mkdir -p "$T/ext-closed"; cp "$FIX"/external/*.json "$T/ext-closed/"; jq '.state = "closed"' "$FIX/external/issue-900.json" > "$T/ext-closed/issue-900.json"
n=$((n + 1)); export SPIKE_OPSX=$T/opsx$n GH_ISSUES_FIXTURE_DIR=$T/ext-closed; mkdir -p "$SPIKE_OPSX"
bash "$HERE/init.sh" EDU-100 --dry-run >/dev/null; bash "$HERE/graph.sh" EDU-100 --fresh >/dev/null
bash "$HERE/walk.sh" EDU-100 --dry-run 2>&1 | grep -q 'would dispatch now: EDU-101, EDU-102' && ok "closed external blocker releases its ticket" || bad "closed external blocker"
e2e soft EDU-100
grep -q 'would dispatch now: EDU-101$' <<<"$OUT" && grep -q 'EDU-102.*waits on EDU-101' <<<"$OUT" && grep -q 'EDU-103.*waits on EDU-101, EDU-102' <<<"$OUT" && ok "soft edges from ticket text gate like links" || bad "soft edges" "$OUT"
[ "$(jq '.soft_edges | length' "$SPIKE_OPSX/epic-EDU-100/graph.json")" = 3 ] && ok "soft edges recorded in the graph" || bad "soft edges recorded"
grep -q 'Soft dependencies not linked' <<<"$OUT" && ok "soft edges reported on the board" || bad "soft edges reported"
e2e soft-unresolved EDU-100
[ $GRAPH_RC = 1 ] && grep -q 'EDU-777' <<<"$GRAPH" && ok "unresolved key named in text is a hard halt" || bad "unresolved key in text" "$GRAPH"
e2e range EDU-400 --only 401-410,415,420-425
[ $RC = 0 ] && [ "$(jq -c '.only | length' <<<"$INIT")" = 17 ] && grep -q 'would dispatch now: EDU-401, EDU-402, EDU-403$' <<<"$OUT" && ok "range --only expands and dispatches within the cap" || bad "range --only" "$OUT"
e2e range EDU-400 --only 401-403,402,EDU-403
[ "$(jq -c '.only' <<<"$INIT")" = '["EDU-401","EDU-402","EDU-403"]' ] && ok "range --only dedupes" || bad "range --only dedupe"
e2e range EDU-400 --only 408-411
[ $RC = 3 ] && grep -q 'ERROR: --only EDU-411 is not a child of EDU-400' <<<"$OUT" && ok "range with a non-child halts" || bad "range with a non-child halts" "rc=$RC $OUT"
e2e range EDU-400 --only 401,430
[ $RC = 3 ] && grep -q 'EDU-430 is not a child' <<<"$OUT" && ok "single non-child halts" || bad "single non-child halts" "$OUT"
e2e range EDU-400 --only 410-401
[ $INIT_RC = 2 ] && ok "bad range halts at init" || bad "bad range halts at init"
e2e range EDU-400 --only 401-410 --concurrency 99
[ "$(jq .cap <<<"$INIT")" = 10 ] && [ "$(grep -o 'would dispatch now: .*' <<<"$OUT" | tr ',' '\n' | wc -l | tr -d ' ')" = 10 ] && ok "concurrency 99 clamps to a cap of 10" || bad "concurrency clamp" "$INIT / $OUT"
e2e range EDU-400 --concurrency 4 --max-tickets 2
[ "$(jq .budget_left <<<"$INIT")" = 2 ] && grep -q 'would dispatch now: EDU-401, EDU-402$' <<<"$OUT" && ok "--max-tickets caps the dry-run dispatch" || bad "--max-tickets" "$INIT / $OUT"
e2e range EDU-400
[ "$(jq .cap <<<"$INIT")" = 3 ] && grep -q 'would dispatch now: EDU-401, EDU-402, EDU-403$' <<<"$OUT" && ok "default concurrency is 3" || bad "default concurrency" "$INIT"
bash "$HERE/init.sh" EDU-400 --concurrency 0 >/dev/null 2>&1; [ $? = 2 ] && ok "--concurrency 0 is refused" || bad "--concurrency 0 is refused"

# observe.sh: a green merge-gate with the PR still open is `held` (the human merges), a merged PR is `done`
mkdir -p "$T/bin"; printf '#!/bin/bash\necho "${FAKE_PR_STATE:-OPEN}"\n' > "$T/bin/gh"; chmod +x "$T/bin/gh"
n=$((n + 1)); export SPIKE_OPSX=$T/opsx$n GH_ISSUES_FIXTURE_DIR=$FIX/linear; mkdir -p "$SPIKE_OPSX/EDU-101"
bash "$HERE/graph.sh" EDU-100 --fresh >/dev/null
echo '{"pr_url":"https://example.test/pull/1","stages":{"merge-gate":{"result":"pass"}}}' > "$SPIKE_OPSX/EDU-101/status.json"
obs=$(PATH="$T/bin:$PATH" FAKE_PR_STATE=OPEN SPIKE_READONLY=1 bash "$HERE/observe.sh" EDU-100)
[ "$(jq -r '.["EDU-101"].state' <<<"$obs")" = held ] && ok "green merge-gate with an open PR is held" || bad "open PR is held" "$obs"
obs=$(PATH="$T/bin:$PATH" FAKE_PR_STATE=MERGED SPIKE_READONLY=1 bash "$HERE/observe.sh" EDU-100)
[ "$(jq -r '.["EDU-101"].state' <<<"$obs")" = done ] && ok "merged PR is done" || bad "merged PR is done" "$obs"

# --status with no cached graph and no Herdr
n=$((n + 1)); export SPIKE_OPSX=$T/opsx$n GH_ISSUES_FIXTURE_DIR=$FIX/linear; mkdir -p "$SPIKE_OPSX"
OUT=$(bash "$HERE/walk.sh" EDU-100 --status 2>/dev/null); RC=$?
[ $RC = 0 ] && head -1 <<<"$OUT" | grep -q '^spike loop: not running' && grep -q 'Nothing in flight' <<<"$OUT" && grep -q '0 done' <<<"$OUT" && ok "--status works with no Herdr and fixtures" || bad "--status" "$OUT"
check "--status leaves no run state" test ! -e "$SPIKE_OPSX/epic-EDU-100/status.json"

# ---- observe.sh liveness and idle classification, walk.sh notify and board, with stubbed herdr / lsof ------------
cat > "$T/bin/herdr" <<'H'
#!/bin/bash
d=${HS:?}
case "$1 $2" in
  "agent get") if [ -f "$d/agent.$3" ]; then jq -nc --arg s "$(cat "$d/agent.$3")" '{result:{agent:{agent_status:$s}}}'
               else echo '{"error":{"code":"agent_not_found"}}'; exit 1; fi ;;
  "agent read") cat "$d/text.$3" 2>/dev/null ;;
  "pane read") cat "$d/text.pane" 2>/dev/null ;;
  "pane get") echo '{"result":{"pane":{"agent":null}}}' ;;
  *) exit 1 ;;
esac
H
printf '#!/bin/bash\ncase "$*" in *":${LSOF_PORT:-none}"*) echo 4242 ;; *) exit 1 ;; esac\n' > "$T/bin/lsof"
chmod +x "$T/bin/herdr" "$T/bin/lsof"
ago() { echo $(( $(date +%s) - $1 )); }
# case <hb age> <dispatched age> <agent status|-> <idle seconds|-> <pane text>: a ticket EDU-101 dispatched
# to agent a1 with a ship lock, its ship files 40 minutes old; sets SO (the opsx dir) and HS (the herdr stub dir)
case_() {
  n=$((n + 1)); export SPIKE_OPSX=$T/opsx$n GH_ISSUES_FIXTURE_DIR=$FIX/linear SPIKE_NOTIFY=0 HS=$T/hs$n; SO=$SPIKE_OPSX
  mkdir -p "$SO/EDU-101" "$HS"
  bash "$HERE/graph.sh" EDU-100 --fresh >/dev/null
  jq -nc --argjson e "$(ago "$2")" --argjson i "$( [ "$4" = - ] && echo null || ago "$4")" \
    '{dispatched:{"EDU-101":{agent:"a1",pane:"p1",epoch:$e,at:"x"}},concurrency:3} + (if $i then {idle_since:{"EDU-101":$i}} else {} end)' \
    > "$SO/epic-EDU-100/status.json"
  jq -nc --argjson h "$(ago "$1")" '{run_id:"r",heartbeat_epoch:$h}' > "$SO/EDU-101/.lock"
  echo '{"stages":{"implement":{"result":"running","started_epoch":1}}}' > "$SO/EDU-101/status.json"
  touch -t 202001010000 "$SO/EDU-101/status.json"
  [ "$3" = - ] || echo "$3" > "$HS/agent.a1"
  printf '%s\n' "$5" > "$HS/text.a1"
}
observe_() { PATH="$T/bin:$PATH" HS=$HS bash "$HERE/observe.sh" EDU-100 | jq -c '.["EDU-101"]'; }
st_() { jq -r .state <<<"$1"; }
hbproc() { bash -c 'sleep 25; :' heartbeat.sh "$SO/EDU-101/.lock" x >/dev/null 2>&1 & HBPID=$!; }
hbkill() { kill "$HBPID" 2>/dev/null; wait "$HBPID" 2>/dev/null; return 0; }

case_ 300 3000 working - ''
o=$(observe_); [ "$(st_ "$o")" = died ] && jq -r .reason <<<"$o" | grep -q 'heartbeat 5 min old and ship.s process is gone' && ok "a 5 min stale heartbeat with no process is died now" || bad "fast death" "$o"
case_ 300 3000 working - ''; hbproc
o=$(observe_); hbkill; [ "$(st_ "$o")" = running ] && ok "a 5 min old heartbeat with its process alive is still running" || bad "heartbeat process alive" "$o"
case_ 300 3000 - - ''; hbproc
o=$(observe_); hbkill; [ "$(st_ "$o")" = died ] && ok "a lost agent is died even with a heartbeat process" || bad "agent gone" "$o"
case_ 100 3000 working - ''
o=$(observe_); [ "$(st_ "$o")" = running ] && ok "a fresh heartbeat is never checked for death" || bad "fresh heartbeat" "$o"
case_ 400 100 working - ''
o=$(observe_); [ "$(st_ "$o")" = running ] && jq -r .reason <<<"$o" | grep -q starting && ok "a lock older than the dispatch is the previous run's: starting" || bad "previous run's lock" "$o"
case_ 700 3000 working - ''
o=$(observe_); [ "$(st_ "$o")" = died ] && jq -r .reason <<<"$o" | grep -q 'stale lock, never released' && ok "a 10 min stale lock is still died" || bad "stale lock died" "$o"

case_ 30 3000 idle 1500 '⏺ Should I send simplify back to dedupe the shells?'
o=$(observe_); [ "$(st_ "$o")" = waiting-user ] && jq -r .question <<<"$o" | grep -q 'send simplify back' && ok "idle 25 min and a question is waiting-user" || bad "waiting-user with a question" "$o"
case_ 30 3000 idle 1500 '⏺ Stack is starting in the background. Waiting on it.'
o=$(observe_); [ "$(st_ "$o")" = running ] && jq -r .reason <<<"$o" | grep -q 'waiting on a background task' && ok "idle 25 min on a background task is running, labelled" || bad "background wait" "$o"
case_ 30 3000 idle 1500 '⏺ Review passed.'
o=$(observe_); [ "$(st_ "$o")" = waiting-user ] && jq -r .reason <<<"$o" | grep -q 'no question' && ok "idle with no question and no task is waiting-user, flagged" || bad "idle no question" "$o"
case_ 30 3000 idle 1500 '⏺ Review passed.'
jq '.stack = {up: true, name: "x", api_port: 3999}' "$SO/EDU-101/status.json" > "$T/s.json" && cp "$T/s.json" "$SO/EDU-101/status.json"; touch -t 202001010000 "$SO/EDU-101/status.json"
o=$(PATH="$T/bin:$PATH" LSOF_PORT=3999 HS=$HS bash "$HERE/observe.sh" EDU-100 | jq -c '.["EDU-101"]'); [ "$(st_ "$o")" = running ] && jq -r .reason <<<"$o" | grep -q 'background task' && ok "a listening stack counts as activity" || bad "stack listening" "$o"
case_ 30 3000 idle 4000 '⏺ Stack is starting in the background. Waiting on it.'
o=$(observe_); [ "$(st_ "$o")" = waiting-user ] && ok "a background wait past BG_WAIT_MAX escalates" || bad "background wait escalates" "$o"
case_ 30 3000 idle 100 '⏺ Should I continue?'
o=$(observe_); [ "$(st_ "$o")" = running ] && ok "idle under the threshold is running" || bad "idle under threshold" "$o"
case_ 30 3000 working 1500 '⏺ Should I continue?'
observe_ >/dev/null
[ "$(jq -r '.idle_since["EDU-101"] // "none"' "$SO/epic-EDU-100/status.json")" = none ] && ok "a working pane clears its idle time" || bad "idle cleared"
echo idle > "$HS/agent.a1"; o=$(observe_)
[ "$(st_ "$o")" = running ] && [ "$(jq -r '.idle_since["EDU-101"] // empty' "$SO/epic-EDU-100/status.json" | wc -c | tr -d ' ')" -gt 1 ] && ok "a pane that flaps starts counting again from zero" || bad "flap" "$o"
case_ 30 3000 idle 1500 '⏺ Should I continue?'
before=$(cat "$SO/epic-EDU-100/status.json"); PATH="$T/bin:$PATH" HS=$HS SPIKE_READONLY=1 bash "$HERE/observe.sh" EDU-100 >/dev/null
[ "$(cat "$SO/epic-EDU-100/status.json")" = "$before" ] && ok "SPIKE_READONLY leaves the idle record alone" || bad "readonly idle"

# lib.sh helpers
cd "$HERE" || exit 1
L=$( . ./lib.sh; printf '⏺ Fix the dedupe?\n⏺ That is just the heartbeat ending normally\n⏺ Bash(ls)\n' | last_block )
grep -q 'dedupe' <<<"$L" && ok "last_block skips heartbeat chatter and tool calls" || bad "last_block" "$L"
( . ./lib.sh; printf '⏺ Done.\n' | asks_question ) && bad "asks_question on a statement" || ok "a statement is not a question"
( . ./lib.sh; printf '⏺ Merge it now?\n' | asks_question ) && ok "a question is asked" || bad "asks_question"
n=$((n + 1)); export SPIKE_OPSX=$T/opsx$n; mkdir -p "$SPIKE_OPSX/epic-EDU-100"
jq -nc --argjson h "$(ago 300)" '{run_id:"r",heartbeat_epoch:$h}' > "$SPIKE_OPSX/epic-EDU-100/.spike-lock"
( . ./lib.sh; loop_live EDU-100 ) && bad "dead spike loop reads live" || ok "a spike loop 5 min stale with no heartbeat process is not live"
jq -nc --argjson h "$(ago 30)" '{run_id:"r",heartbeat_epoch:$h}' > "$SPIKE_OPSX/epic-EDU-100/.spike-lock"
( . ./lib.sh; loop_live EDU-100 ) && ok "a fresh spike loop is live" || bad "fresh spike loop"
cd - >/dev/null || exit 1

# walk.sh: halt text, closed panes, notify cooldown
case_ 700 3000 - - ''
jq '.dispatched["EDU-101"].closed_at = "x"' "$SO/epic-EDU-100/status.json" > "$T/s.json" && cp "$T/s.json" "$SO/epic-EDU-100/status.json"
echo '{"EDU-101":{"state":"halted","ship_stage":"implement","halt_reason":"typecheck failed in app-shell.tsx","last_line":"That is just the heartbeat ending normally","pane":"p1"}}' > "$T/obs.json"
OUT=$(PATH="$T/bin:$PATH" SPIKE_OBS=$T/obs.json bash "$HERE/walk.sh" EDU-100 --status 2>&1)
grep -q 'typecheck failed in app-shell.tsx' <<<"$OUT" && ! grep -q 'heartbeat ending' <<<"$OUT" && ok "halt text prefers halt_reason over the pane's last line" || bad "halt_reason first" "$OUT"
grep 'EDU-101 ' <<<"$OUT" | grep -q 'pane p1' && bad "closed pane still on the board" "$OUT" || ok "a closed pane drops off its board row"

case_ 30 3000 - - ''
echo '{"EDU-101":{"state":"waiting-user","ship_stage":"implement","question":"merge it?","pane":"p1"}}' > "$T/obsW.json"
echo '{"EDU-101":{"state":"running","ship_stage":"implement","ship_result":"running","pane":"p1"}}' > "$T/obsR.json"
refresh() { PATH="$T/bin:$PATH" SPIKE_OBS=$1 NOTIFY_COOLDOWN=${2:-1800} bash "$HERE/walk.sh" EDU-100 --refresh >/dev/null 2>&1; }
nlog() { grep -c 'notified: EDU-101' "$SO/epic-EDU-100/log.md" 2>/dev/null || echo 0; }
refresh "$T/obsW.json"; [ "$(nlog)" = 1 ] && ok "entering waiting-user notifies once" || bad "first notify" "$(nlog)"
refresh "$T/obsW.json"; [ "$(nlog)" = 1 ] && ok "staying in it does not notify again" || bad "stay" "$(nlog)"
refresh "$T/obsR.json"; refresh "$T/obsW.json"
[ "$(nlog)" = 1 ] && ok "a flap back into the same state inside the cooldown is not re-announced" || bad "flap notify" "$(nlog)"
refresh "$T/obsR.json" 0; refresh "$T/obsW.json" 0
[ "$(nlog)" = 2 ] && ok "after the cooldown a re-entry is announced" || bad "cooldown expiry" "$(nlog)"

# dispatch.sh --dry-run forwards the epic's auto_decide; init.sh's ship_max_parallel is the cap
case_ 700 3000 - - ''
rm -f "$SO/EDU-101/.lock"
dd_() { PATH="$T/bin:$PATH" HERDR_ENV=1 HS=$HS bash "$HERE/dispatch.sh" EDU-100 EDU-101 --dry-run "$@" 2>&1 | jq -r .auto_decide; }
[ "$(dd_)" = false ] && ok "dispatch without auto_decide stays off" || bad "auto_decide off"
[ "$(dd_ --auto-decide)" = true ] && ok "dispatch --auto-decide forwards it" || bad "auto_decide flag"
jq '.auto_decide = true' "$SO/epic-EDU-100/status.json" > "$T/s.json" && cp "$T/s.json" "$SO/epic-EDU-100/status.json"
[ "$(dd_)" = true ] && ok "dispatch and resume read auto_decide from status.json" || bad "auto_decide from status"
[ "$(dd_ --resume)" = true ] && ok "a resume keeps auto_decide" || bad "auto_decide on resume"
e2e linear EDU-100 --concurrency 2
[ "$(SHIP_MAX_PARALLEL=3 bash "$HERE/init.sh" EDU-100 --concurrency 2 --dry-run | jq -r '.ship_max_parallel')" = 2 ] && ok "init.sh ship_max_parallel is the cap in force" || bad "ship_max_parallel"

# diagnose.sh stack section
case_ 30 3000 working - ''
jq '.stack = {up: true, name: "wt", api_port: 3999, admin_port: 3998}' "$SO/EDU-101/status.json" > "$T/s.json" && cp "$T/s.json" "$SO/EDU-101/status.json"
OUT=$(PATH="$T/bin:$PATH" LSOF_PORT=3999 HS=$HS bash "$HERE/diagnose.sh" EDU-100 EDU-101 2>&1)
grep -q 'api :3999  listening, pid 4242' <<<"$OUT" && grep -q 'admin :3998  free' <<<"$OUT" && ok "diagnose reports who holds each stack port" || bad "diagnose stack" "$OUT"

# ---- every dispatch path refuses without Herdr -----------------------------------------------------------
for cmd in "dispatch.sh EDU-100 EDU-101" "dispatch.sh EDU-100 EDU-101 --dry-run" "dispatch.sh EDU-100 EDU-101 --resume" \
           "relay.sh EDU-100 EDU-101 --show" "withdraw.sh EDU-100 EDU-101" "wait.sh EDU-100" "reap.sh EDU-100"; do
  read -r -a argv <<<"$cmd"
  msg=$(env -u HERDR_ENV bash "$HERE/${argv[0]}" "${argv[@]:1}" 2>&1 >/dev/null); rc=$?
  [ $rc = 13 ] && grep -q 'not inside Herdr' <<<"$msg" && ok "no Herdr: $cmd exits 13" || bad "no Herdr: $cmd" "rc=$rc $msg"
done
msg=$(HERDR_ENV=0 bash "$HERE/dispatch.sh" EDU-100 EDU-101 2>&1); [ $? = 13 ] && ok "HERDR_ENV=0 is refused too" || bad "HERDR_ENV=0"
bash "$HERE/walk.sh" 100 --status >/dev/null 2>&1; [ $? = 2 ] && ok "a bare number is not an epic key" || bad "bare number as epic"
exit $fail

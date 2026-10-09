#!/bin/bash
# One screen on one ticket, so nobody reads ship's status.json, handoff JSONs and panes by hand:
# ship's current stage and why, its lock, spike's pane and ship's worker, its e2e stack's ports and who holds
# them, the pane's last lines, the PR.
# Read-only: writes nothing, never types into a pane.
#
# usage: diagnose.sh <EPIC> <KEY> [lines=10]
set -u
. "$(dirname "$0")/lib.sh"

EPIC=$(norm_epic "${1:-}") || exit 2
KEY=$(norm_epic "${2:-}") || exit 2
N=${3:-10}
d=$OPSX/$KEY s=$d/status.json now=$(date +%s)
ago() { local x=$(( now - ${1:-0} )); [ "${1:-0}" -gt 0 ] || { echo never; return; }
        [ $x -lt 3600 ] && echo "$(( x / 60 )) min ago" || echo "$(( x / 3600 )) h $(( x % 3600 / 60 )) min ago"; }
ast() { [ -n "$1" ] && { herdr agent get "$1" 2>/dev/null | jq -r '.result.agent.agent_status // empty'; } | grep . || echo gone; }

echo "== $KEY"
if [ -f "$s" ]; then
  jq -r '
    ([.stages // {} | to_entries[] | select(.value.result != "pass" and .value.result != "skipped")][0]) as $c
    | ([.stages // {} | to_entries[] | select(.value.result == "pass" or .value.result == "skipped") | .key] | join(" ")) as $ok
    | "ship stage: \(if $c then "\($c.key) \($c.value.result) (attempt \($c.value.attempts // "?"), since \($c.value.started_at // "?"))" else "all stages pass" end)",
      "passed:     \($ok)"' "$s"
  cur=$(jq -r '[.stages // {} | to_entries[] | select(.value.result != "pass" and .value.result != "skipped")][0].key // empty' "$s")
  [ -n "$cur" ] && [ -f "$d/$cur.json" ] &&
    jq -r --arg f "$cur.json" '"handoff:    \($f) " + ([(.verdict // .result // .status // empty), (.failure_reason // .reason // .error // empty)] | map(tostring) | join(" — "))[0:300]' "$d/$cur.json" 2>/dev/null
else echo "ship stage: no status.json (ship never ran)"; fi

if [ -f "$d/.lock" ]; then
  hb=$(jq -r '.heartbeat_epoch // 0' "$d/.lock" 2>/dev/null)
  [ $(( now - hb )) -lt $STALE ] && l=live || l="STALE (not released: the session died)"
  echo "ship lock:  $l, heartbeat $(ago "$hb")"
else echo "ship lock:  none (released or never taken)"; fi

disp=$(es_get "$EPIC" ".dispatched[\"$KEY\"]" -c)
if [ -n "$disp" ]; then
  pane=$(jq -r '.pane // empty' <<<"$disp") agent=$(jq -r '.agent // empty' <<<"$disp")
  echo "spike pane: $pane · agent $agent · $(ast "$agent") · attempts $(jq -r '.attempts // 1' <<<"$disp") · dispatched $(jq -r '.at' <<<"$disp")$(jq -r 'if .withdrawn_at then " · WITHDRAWN \(.withdrawn_at)" else "" end + if .closed_at then " · closed \(.closed_at)" else "" end' <<<"$disp")"
else pane="" agent=""; echo "spike pane: not dispatched by spike"; fi
wn=$(jq -r '.worker.agent_name // empty' "$s" 2>/dev/null)
[ -n "$wn" ] && echo "worker:     $(jq -r '.worker.pane_id' "$s") · $wn · $(ast "$wn")"

# the ticket's e2e stack: the ports ship recorded in status.json, who holds each, and the worktree stack's own pids
if [ -f "$s" ] && jq -e '.stack' "$s" >/dev/null 2>&1; then
  echo "stack:      $(jq -r '.stack | "\(.name // "?") · up=\(.up // false) · database \(.database // "?")"' "$s")"
  for pk in api_port admin_port portal_port web_port; do
    port=$(jq -r --arg k "$pk" '.stack[$k] // empty' "$s"); [ -n "$port" ] || continue
    pid=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)
    if [ -n "$pid" ]; then
      cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
      echo "  ${pk%_port} :$port  listening, pid $pid ($(ps -o comm= -p "$pid" 2>/dev/null | xargs basename 2>/dev/null)) cwd ${cwd:-?}"
    else echo "  ${pk%_port} :$port  free"; fi
  done
  sf=$ROOT/var/e2e/stacks/$(jq -r '.stack.name // empty' "$s")/state.json
  [ -f "$sf" ] && for pk in api_pid admin_pid portal_pid web_pid; do
    pid=$(jq -r --arg k "$pk" '.[$k] // empty' "$sf"); [ -n "$pid" ] || continue
    kill -0 "$pid" 2>/dev/null && echo "  state.json $pk $pid alive" || echo "  state.json $pk $pid DEAD"
  done
else echo "stack:      none recorded"; fi

pr=$(jq -r '.pr_url // empty' "$s" 2>/dev/null)
if [ -n "$pr" ]; then
  echo "PR:         $pr · $(gh pr view "$pr" --json state,isDraft -q '"\(.state)\(if .isDraft then " (draft)" else "" end)"' 2>/dev/null || echo unreadable)"
else echo "PR:         none yet"; fi

if [ -n "$agent" ] && [ "$(ast "$agent")" != gone ]; then
  echo "-- last $N lines of $pane"
  herdr agent read "$agent" --source recent --lines 60 --format text 2>/dev/null | grep -v '^[[:space:]]*$' | tail -"$N"
elif [ -n "$pane" ] && herdr pane get "$pane" >/dev/null 2>&1; then
  echo "-- last $N lines of $pane (no agent in it)"
  herdr pane read "$pane" --source recent --lines 60 --format text 2>/dev/null | grep -v '^[[:space:]]*$' | tail -"$N"
fi
exit 0

#!/bin/bash
# Close the Herdr panes spike split per ticket, once they have nothing left to do. Only tabs recorded in the
# epic's status.json `.dispatched` — never a pane spike didn't create; the run's tab closes with its last ticket pane.
#
# A pane is closed only when ALL hold:
#   - the ticket merged (confirmed merge in `.merged`, i.e. observe.sh saw gh MERGED)
#   - ship finished its own cleanup (stage `cleanup: pass`) — it closes its worker pane and
#     worktree there, and closing its parent pane mid-cleanup would kill that
#   - no live ship lock (heartbeat < 10 min), so the session isn't still releasing
#   - the pane's Claude is not working/blocked
# Halted, blocked-ui and held panes are KEPT: they are the user's window into what went wrong, or into the
# merge-gate hold they resume from.
#
# A pane the user already closed by hand is marked closed whatever the ticket's state, so a stale pane id never
# counts as a live column again (a resume then opens a new one).
#
# usage: reap.sh <EPIC> [--all-done]   --all-done: also report the tabs left open and why
# prints one line per closed pane ("<KEY>: closed pane <pane>", "<KEY>: pane <pane> was already closed") and,
# with --all-done, per kept pane
set -u
. "$(dirname "$0")/lib.sh"

need_herdr
EPIC=$(norm_epic "${1:-}") || exit 2
ALL=${2:-}
now=$(date +%s)

for k in $(es_get "$EPIC" '.dispatched | to_entries[] | select(.value.closed_at | not) | .key'); do
  pane=$(es_get "$EPIC" ".dispatched[\"$k\"].pane // .dispatched[\"$k\"].tab") agent=$(es_get "$EPIC" ".dispatched[\"$k\"].agent")
  if pane_gone "$pane"; then
    es_set "$EPIC" '.dispatched[$k].closed_at = $t' --arg k "$k" --arg t "$(now_iso)"
    echo "$k: pane $pane was already closed"; continue
  fi
  merged=$(es_get "$EPIC" ".merged[\"$k\"]")
  cleanup=$(jq -r '.stages.cleanup.result // empty' "$OPSX/$k/status.json" 2>/dev/null)
  hb=$(jq -r '.heartbeat_epoch // 0' "$OPSX/$k/.lock" 2>/dev/null || echo 0)
  as=$(herdr agent get "$agent" 2>/dev/null | jq -r '.result.agent.agent_status // "unknown"' || echo gone)
  [ -n "$as" ] || as=gone

  why=""
  [ -n "$merged" ] || why="not merged"
  [ -z "$merged" ] && [ "$(jq -r '.stages["merge-gate"].result // empty' "$OPSX/$k/status.json" 2>/dev/null)" = held ] &&
    why="held at merge-gate — kept for its resume"
  [ -z "$why" ] && [ "$cleanup" != pass ] && why="ship cleanup not finished"
  [ -z "$why" ] && [ $(( now - hb )) -lt $STALE ] && why="ship lock still live"
  [ -z "$why" ] && case "$as" in working|blocked) why="pane is $as" ;; esac
  if [ -n "$why" ]; then
    [ "$ALL" = --all-done ] && echo "$k: kept pane $pane ($why)"
    continue
  fi

  case "$as" in idle|done|unknown)   # let Claude exit cleanly before the pane goes
    # agent prompt appends to unsent input, so clear the box first or /exit is submitted with it
    herdr pane send-keys "$pane" ctrl+u >/dev/null 2>&1
    herdr agent prompt "$agent" "/exit" >/dev/null 2>&1
    for _ in $(seq 1 15); do herdr agent get "$agent" >/dev/null 2>&1 || break; sleep 1; done ;;
  esac
  TAB=$(es_get "$EPIC" '.spike_tab')
  if herdr pane get "$pane" >/dev/null 2>&1; then
    n=$(herdr tab get "$TAB" 2>/dev/null | jq -r '.result.tab.pane_count // 0')
    if [ -n "$TAB" ] && [ "$n" = 1 ]; then
      # the ticket's pane is the tab's last: the run's tab goes with it (the next dispatch makes a new one)
      herdr tab close "$TAB" >/dev/null 2>&1 || { echo "$k: tab $TAB would not close"; continue; }
      es_set "$EPIC" 'del(.spike_tab, .spike_tab_root)'
    else
      herdr pane close "$pane" >/dev/null 2>&1 || { echo "$k: pane $pane would not close"; continue; }
    fi
  fi   # already gone (user closed it) = success; Herdr gives its space back to the neighbour
  es_set "$EPIC" '.dispatched[$k].closed_at = $t' --arg k "$k" --arg t "$(now_iso)"
  echo "$k: closed pane $pane"
done
TAB=$(es_get "$EPIC" '.spike_tab')
[ -n "$TAB" ] && bash "$SP/rebalance.sh" "$TAB"
exit 0

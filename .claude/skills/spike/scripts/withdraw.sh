#!/bin/bash
# Take one dispatched ticket out of the run (e.g. a Blocks link added mid-run now gates it): its
# slot frees on the next walk and, once its ship has stopped, it is `none` again — eligible when
# its blockers are done. It never stops ship: that is the user's call, through ship's own lock.
#
# usage: withdraw.sh <EPIC> <KEY> [--close]
#   --close  also close its pane, but only when ship's lock is no longer live and no Claude in the
#            pane is working/blocked; a pane already gone just counts as closed
# exit:  0 withdrawn (one line: "<KEY> withdrawn · ship <live|stopped> · pane <pane> <kept|closed>")
#        1 <KEY> was never dispatched in this epic
set -u
. "$(dirname "$0")/lib.sh"

need_herdr
EPIC=$(norm_epic "${1:-}") || exit 2
KEY=$(norm_epic "${2:-}") || exit 2
CLOSE=${3:-}
[ -n "$(es_get "$EPIC" ".dispatched[\"$KEY\"]")" ] || { echo "$KEY was never dispatched in $EPIC"; exit 1; }
PANE=$(es_get "$EPIC" ".dispatched[\"$KEY\"].pane") AGENT=$(es_get "$EPIC" ".dispatched[\"$KEY\"].agent")
es_set "$EPIC" '.dispatched[$k].withdrawn_at = $t' --arg k "$KEY" --arg t "$(now_iso)"

hb=$(jq -r '.heartbeat_epoch // 0' "$OPSX/$KEY/.lock" 2>/dev/null || echo 0)
live=stopped; [ $(( $(date +%s) - ${hb:-0} )) -lt $STALE ] && live=live
as=$(herdr agent get "$AGENT" 2>/dev/null | jq -r '.result.agent.agent_status // "gone"'); [ -n "$as" ] || as=gone
pane=kept
if [ -n "$PANE" ] && ! herdr pane get "$PANE" >/dev/null 2>&1; then
  pane=closed   # the user already closed it: it must stop counting as a live column in dispatch.sh
elif [ "$CLOSE" = --close ] && [ "$live" = stopped ]; then
  case "$as" in
    working|blocked) pane="kept (its Claude is $as)" ;;
    # agent prompt appends to unsent input, so clear the box first or /exit is submitted with it
    *) [ "$as" = gone ] || { herdr pane send-keys "$PANE" ctrl+u >/dev/null 2>&1; herdr agent prompt "$AGENT" "/exit" >/dev/null 2>&1
         for _ in $(seq 1 15); do herdr agent get "$AGENT" >/dev/null 2>&1 || break; sleep 1; done; }
       herdr pane close "$PANE" >/dev/null 2>&1 && pane=closed || pane="kept (would not close)" ;;
  esac
elif [ "$CLOSE" = --close ]; then
  pane="kept (ship's lock is live — stop ship first if the user wants it stopped)"
fi
[ "$pane" = closed ] && es_set "$EPIC" '.dispatched[$k].closed_at = $t' --arg k "$KEY" --arg t "$(now_iso)"
TAB=$(es_get "$EPIC" '.spike_tab'); [ "$pane" = closed ] && [ -n "$TAB" ] && bash "$SP/rebalance.sh" "$TAB"
echo "$KEY withdrawn · ship $live · pane ${PANE:-?} $pane"

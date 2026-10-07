#!/bin/bash
# Start one ticket's /ship in its own Herdr pane beside the spike: a fresh, top-level Claude session
# in the main checkout, which is where /ship is known to work (it needs Herdr, spawns its own
# subagents and pins its heartbeat to its own Claude pid). Records the pane in status.json.
#
# Layout — one tab per spike run, one vertical pane (column) per ticket in it:
#   the run's tab   → created on the first dispatch ("spike · <EPIC>", unfocused), recorded as
#                     .spike_tab; re-created if it has been closed
#   first ticket    → runs in that tab's root pane (no split), while no Claude is running in it
#   every further   → split the rightmost live ticket pane RIGHT, so tickets sit side by side
#   ship then splits its worker DOWN inside each ticket column (worker.sh, --ratio 0.65)
#   rebalance.sh then evens every column out to W/N
# The spike's own pane, in the tab you ran /spike from, is never split.
#
# usage: dispatch.sh <EPIC> <KEY> [--auto-decide] [--resume|--auto-resume] [--dry-run]
#   --resume       the user-approved re-run of a halted/died ticket: reuses its recorded pane when that
#                  pane is still open with no busy Claude in it, otherwise opens a new column
#   --auto-resume  walk.sh's `auto_resume`: --resume for a died ticket (stale ship lock still on disk), at
#                  most once per run (`.auto_resumed[KEY]`, against `.run_started`); a halted ticket is refused
#   --dry-run      decide the placement and print it ({key, dry_run, tab, pane, anchor, direction}) without
#                  creating, splitting, exiting or starting anything
# exit:  0 started (prints {key, pane, anchor, direction, agent, attempts, auto_resume})
#        12 already live (its agent is working/blocked, or ship's lock for it is live) — skip it
#        13 Herdr is broken (not inside Herdr, tab create / pane split failed) — halt the run
#        14 Claude started but sits on a startup dialog (pane printed)   15 /ship didn't start
#        16 `herdr agent start` failed in the chosen pane and in a fresh column — nothing recorded;
#           retry on the next walk
#        17 --auto-resume refused: not died, or already auto-resumed in this run
# Every pane gets HERDR_ENV=1, SHIP_MAX_PARALLEL=<cap> and SPIKE_EPIC=<EPIC>.
set -u
. "$(dirname "$0")/lib.sh"

need_herdr
EPIC=$(norm_epic "${1:-}") || exit 2
KEY=$(norm_epic "${2:-}") || exit 2
shift 2
FLAGS="" RESUME=false AUTO=false DRY=false
for a in "$@"; do case "$a" in
  --auto-decide) FLAGS=" --auto-decide" ;;
  --resume) RESUME=true ;;
  --auto-resume) RESUME=true AUTO=true ;;
  --dry-run) DRY=true ;;
  *) echo "unknown flag $a"; exit 2 ;;
esac; done
[ "$(es_get "$EPIC" '.auto_decide')" = true ] && FLAGS=" --auto-decide"
test "${HERDR_ENV:-}" = 1 || { echo "not inside Herdr (HERDR_ENV != 1)"; exit 13; }
if $AUTO; then
  # ship's halts are deterministic, so only a killed run (its lock never released) is retried, and once
  [ -f "$OPSX/$KEY/.lock" ] || { echo "$KEY: no stale ship lock — it halted, not died; not auto-resuming"; exit 17; }
  rs=$(es_get "$EPIC" '.run_started'); ar=$(es_get "$EPIC" ".auto_resumed[\"$KEY\"].epoch")
  [ -n "$ar" ] && [ "$ar" -ge "${rs:-0}" ] &&
    { echo "$KEY: already auto-resumed in this run ($(es_get "$EPIC" ".auto_resumed[\"$KEY\"].at")) — the user decides now"; exit 17; }
fi

# a live ship lock is the real guard: a ticket started by hand has no .dispatched record at all
hb=$(jq -r '.heartbeat_epoch // 0' "$OPSX/$KEY/.lock" 2>/dev/null || echo 0)
[ $(( $(date +%s) - ${hb:-0} )) -lt $STALE ] && { echo "$KEY: ship's lock is live — not dispatching again"; exit 12; }
prev=$(es_get "$EPIC" ".dispatched[\"$KEY\"].agent")
if [ -n "$prev" ]; then
  case "$(herdr agent get "$prev" 2>/dev/null | jq -r '.result.agent.agent_status // "gone"')" in
    working|blocked) echo "$KEY: pane $prev is still live — not dispatching again"; exit 12 ;;
  esac
fi

# a pane is free for a new Claude when it exists and Herdr sees no agent, live or stale, in it: a
# Claude that died rather than /exited leaves agent_session set, and agent start never launches there
pane_free() { herdr pane get "$1" 2>/dev/null | jq -e '.result.pane and (.result.pane.agent // null) == null and (.result.pane.agent_session // null) == null' >/dev/null; }
# none = a clean shell; stale = a dead Claude's session still bound; otherwise the agent's status;
# gone = no such pane
pane_status() {
  local j; j=$(herdr pane get "$1" 2>/dev/null) || { echo gone; return; }
  jq -r '.result.pane | if (.agent // null) != null then (.agent_status // "unknown")
         elif (.agent_session // null) != null then "stale" else "none" end' <<<"$j"
}

# the ticket's /ship must admit as many parallel runs as spike dispatches, or slot.sh parks the extras
CAP=$(es_get "$EPIC" '.concurrency'); CAP=${CAP:-3}; [ "$CAP" -gt 10 ] && CAP=10
ENVS=(--env HERDR_ENV=1 --env "SHIP_MAX_PARALLEL=$CAP" --env "SPIKE_EPIC=$EPIC")
fresh_tab() {   # sets TAB and ROOTPANE to a new unfocused tab for the run (walk.sh retitles it, keeping the prefix)
  if $DRY; then TAB="(new tab)" ROOTPANE="(its root pane)"; return; fi
  TJ=$(herdr tab create --cwd "$ROOT" "${ENVS[@]}" --label "spike · $EPIC" --no-focus 2>/dev/null) ||
    { echo "herdr tab create failed"; exit 13; }
  TAB=$(jq -r '.result.tab.tab_id' <<<"$TJ") ROOTPANE=$(jq -r '.result.root_pane.pane_id' <<<"$TJ")
  es_set "$EPIC" '.spike_tab = $t | .spike_tab_root = $p' --arg t "$TAB" --arg p "$ROOTPANE"
}
TAB=$(live_tab "$EPIC") && ROOTPANE=$(es_get "$EPIC" '.spike_tab_root') || fresh_tab

new_column() {   # sets PANE, ANCHOR, DIR, SPLIT to a fresh column split off the rightmost pane
  # rightmost pane in the run's tab anchors the next column (any pane, so an unrecorded column counts too);
  # recorded pane ids go stale when the user closes panes by hand, so only live panes are asked
  ANY=$(herdr pane list 2>/dev/null | jq -r --arg t "$TAB" 'first(.result.panes[] | select(.tab_id == $t) | .pane_id) // empty')
  if [ -z "$ANY" ]; then
    fresh_tab; PANE=$ROOTPANE ANCHOR="" DIR=root SPLIT=false REUSED=false; return
  fi
  ANCHOR=$(herdr pane layout --pane "$ANY" 2>/dev/null |
           jq -r '.result.layout as $l | [$l.panes[] | select(.rect.y == $l.area.y)] | max_by(.rect.x) | .pane_id // empty')
  [ -n "$ANCHOR" ] || ANCHOR=$ANY
  DIR=right SPLIT=true
  # equal columns: with N = the run's concurrency cap and k-1 columns already open (the rightmost
  # holding the unclaimed width), keeping 1/(N-k+2) of the rightmost on its left leaves every
  # column W/N wide. Beyond N (a cap raised mid-run) just halve.
  N=$CAP
  K=$(( $(herdr pane layout --pane "$ANCHOR" 2>/dev/null | jq -r '.result.layout as $l | [$l.panes[] | select(.rect.y == $l.area.y)] | length' || echo 1) + 1 ))
  RATIO=$( [ "$K" -le "$N" ] && awk -v n="$N" -v k="$K" 'BEGIN{printf "%.4f", 1/(n-k+2)}' || echo 0.5 )
  $DRY && { PANE="(new column)"; return; }
  PANE=$(herdr pane split "$ANCHOR" --direction right --ratio "$RATIO" --cwd "$ROOT" "${ENVS[@]}" --no-focus 2>/dev/null |
         jq -r '.result.pane.pane_id // empty')
  [ -n "$PANE" ] || { echo "herdr pane split $ANCHOR --direction right failed"; exit 13; }
}

PANE="" ANCHOR="" DIR="" SPLIT=false REUSED=false
if $RESUME; then
  RP=$(es_get "$EPIC" ".dispatched[\"$KEY\"].pane")
  case "$( [ -n "$RP" ] && pane_status "$RP" || echo gone )" in   # gone/stale/working/blocked → a new column
    none)
      PANE=$RP DIR=resume REUSED=true ;;
    idle|done|unknown)   # its old Claude has finished: /exit it so a fresh one starts with this run's env
      if $DRY; then PANE=$RP DIR=resume REUSED=true
      else
        old=$(herdr agent get "$RP" 2>/dev/null | jq -r '.result.agent.name // empty')
        # agent prompt appends to unsent input, so clear the box first or /exit is submitted with it
        [ -n "$old" ] && { herdr pane send-keys "$RP" ctrl+u >/dev/null 2>&1; herdr agent prompt "$old" "/exit" >/dev/null 2>&1; }
        for _ in $(seq 1 15); do pane_free "$RP" && break; sleep 1; done
        pane_free "$RP" && PANE=$RP DIR=resume REUSED=true
      fi ;;
  esac
fi
if [ -z "$PANE" ]; then
  # the root pane is reused only when no live ticket holds it AND no Claude is running in it (an
  # idle Claude left by a ticket re-dispatched elsewhere still occupies it, and agent start fails there)
  held=$(es_get "$EPIC" '[.dispatched[] | select(.closed_at | not) | select(.withdrawn_at | not) | select(.pane == $p)] | length' --arg p "$ROOTPANE")
  if [ -n "$ROOTPANE" ] && [ "${held:-0}" = 0 ] && pane_free "$ROOTPANE"; then
    PANE=$ROOTPANE DIR=root REUSED=true
  else
    new_column
  fi
fi
$DRY && { jq -nc --arg k "$KEY" --arg t "$TAB" --arg p "$PANE" --arg a "$ANCHOR" --arg d "$DIR" --argjson ar "$AUTO" \
            '{key: $k, dry_run: true, tab: $t, pane: $p, anchor: $a, direction: $d, auto_resume: $ar}'; exit 0; }
prep_pane() {
  # a reused pane's shell predates this dispatch, so it may lack this run's env
  $REUSED && herdr pane run "$PANE" "export HERDR_ENV=1 SHIP_MAX_PARALLEL=$CAP SPIKE_EPIC=$EPIC" >/dev/null 2>&1
  herdr pane rename "$PANE" "spike · $KEY" >/dev/null 2>&1
  bash "$SP/rebalance.sh" "$TAB"
}
start_agent() {
  for _ in 1 2 3; do       # a fresh tab's shell may need a moment
    herdr agent start "$NAME" --kind claude --pane "$PANE" --timeout 60000 \
      -- --permission-mode bypassPermissions >/dev/null 2>&1 && return 0
    sleep 5
  done
  return 1
}
prep_pane
NAME="spike-$(echo "$KEY" | tr '[:upper:]' '[:lower:]')-$(date +%s | tail -c 5)"
started=false
start_agent && started=true
# a reused pane can still refuse a new Claude: leave it as it was and try once in a fresh column
if ! $started && ! $SPLIT; then
  echo "$KEY: herdr agent start failed in $DIR pane $PANE (kept) — trying a new column" >&2
  REUSED=false; new_column; prep_pane; NAME="$NAME-n"
  start_agent && started=true
fi
# never leave an orphan: a pane this call split is closed at once; a reused pane (root, resumed) stays
if ! $started; then
  if $SPLIT; then herdr pane close "$PANE" >/dev/null 2>&1; echo "$KEY: herdr agent start failed in pane $PANE (split pane closed)"
  else echo "$KEY: herdr agent start failed in pane $PANE ($DIR pane kept; is a program still running in it?)"; fi
  exit 16
fi

# recorded the moment Claude runs, so no started ticket is ever missing from .dispatched; a
# re-dispatch clears withdrawn_at/closed_at and keeps every earlier pane in .panes
es_set "$EPIC" '.dispatched[$k] = ((.dispatched[$k] // {}) as $o
    | {at: $t, epoch: $e, tab: $tab, pane: $p, anchor: $a, direction: $dir, agent: $n, attempts: (($o.attempts // 0) + 1),
       panes: (($o.panes // (if $o.pane then [{pane: $o.pane, agent: $o.agent, at: $o.at}] else [] end))
               + [{pane: $p, agent: $n, at: $t}])})' \
  --arg k "$KEY" --arg t "$(now_iso)" --argjson e "$(date +%s)" --arg tab "$TAB" --arg p "$PANE" --arg a "$ANCHOR" --arg dir "$DIR" --arg n "$NAME"
if $AUTO; then
  es_set "$EPIC" '.auto_resumed[$k] = {at: $t, epoch: $e, pane: $p}' --arg k "$KEY" --arg t "$(now_iso)" --argjson e "$(date +%s)" --arg p "$PANE"
  echo "$(now_iso) $KEY auto-resumed after it died (pane $PANE)" >> "$(epic_dir "$EPIC")/log.md"
fi

# not ready after 30 s is a startup dialog (folder trust, …) — same rule as ship's worker.sh. A reused
# pane's fresh Claude can report `done` (the pane's old idle-after-unseen state); ready.sh accepts it
bash "$W/ready.sh" "$NAME" 30 >/dev/null || { herdr pane read "$PANE" 2>/dev/null | tail -25; exit 14; }
if ! herdr agent prompt "$NAME" "/ship $KEY$FLAGS" --wait --until working --timeout 60000 >/dev/null 2>&1; then
  # a startup notice can swallow the Enter and leave /ship typed but unsent: submit it once, only on a text match
  # (the prompt glyph is followed by a no-break space, so match the line, not "❯ /ship")
  bash "$W/ready.sh" "$NAME" 0 >/dev/null || exit 15
  herdr pane read "$PANE" --source visible --lines 15 --format text 2>/dev/null |
    grep '^❯' | grep -qF "/ship $KEY" || exit 15
  herdr pane send-keys "$PANE" enter >/dev/null 2>&1
  herdr agent wait "$NAME" --until working --timeout 60000 >/dev/null 2>&1 || exit 15
fi
jq -nc --arg k "$KEY" --arg p "$PANE" --arg a "$ANCHOR" --arg d "$DIR" --arg n "$NAME" --argjson ar "$AUTO" \
  --argjson at "$(es_get "$EPIC" ".dispatched[\"$KEY\"].attempts")" \
  '{key: $k, pane: $p, anchor: $a, direction: $d, agent: $n, attempts: $at, auto_resume: $ar}'

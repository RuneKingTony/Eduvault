#!/bin/bash
# Poll the ticket's worker until it needs the orchestrator. Run in the background; the
# orchestrator is notified when it exits. (The lock is kept fresh by heartbeat.sh, not here.)
#
# usage: wait-worker.sh <KEY> <timeout_seconds> [interval_seconds=30] [first_wait_seconds=0] [grace_seconds=300]
#   first_wait: sleep before the first poll
#   grace: idle with no fresh handoff (verify.sh exit 2) is not done — a worker can end its turn with
#   its own background work still running; it gets this long to wake up or write the handoff
#   timeout: hit while still working, it's extended once by half before giving up
# exit:  0 idle/done with a fresh handoff (pass or fail — verify.sh decides)   10 blocked
#        20 agent gone   25 idle for the whole grace with no fresh handoff   30 timed out
set -u
. "$(dirname "$0")/lib.sh"
require_herdr

KEY=$1 TIMEOUT=$2 INTERVAL=${3:-30} FIRST=${4:-0} GRACE=${5:-300}
NAME=$(st_get "$KEY" '.worker.agent_name')
STAGE=$(st_get "$KEY" '.worker.stage')
[ -n "$STAGE" ] || STAGE=$(echo "$NAME" | sed -E "s/^ship-$(echo "$KEY" | tr '[:upper:]' '[:lower:]')-//; s/-[0-9]+-[0-9]+\$//")
DEADLINE=$(( $(date +%s) + TIMEOUT )) EXTENDED=false IDLE_SINCE=""

# Workers sometimes drop the repo segment and write the handoff under ~/.claude/opsx/<KEY>/.
recover_stray() {
  local stray=$HOME/.claude/opsx/$KEY dest start f rc=1
  dest=$(key_dir "$KEY")
  [ -d "$stray" ] && [ "$stray" != "$dest" ] || return 1
  start=$(st_get "$KEY" ".stages[\"$STAGE\"].started_epoch")
  [ -n "$start" ] && [ "$start" -gt 0 ] || return 1
  for f in "$stray/$STAGE.json" "$stray/$STAGE.md"; do
    [ -f "$f" ] && [ "$(mtime "$f")" -ge "$start" ] || continue
    mv "$f" "$dest/" && echo "recovered misplaced $(basename "$f") from $stray" && rc=0
  done
  return $rc
}

sleep "$FIRST"

while :; do
  STATE=$(agent_status "$NAME")
  case "$STATE" in
    idle|done)
      bash "$W/verify.sh" "$KEY" "$STAGE" >/dev/null 2>&1; rc=$?
      [ $rc -eq 2 ] && recover_stray && { bash "$W/verify.sh" "$KEY" "$STAGE" >/dev/null 2>&1; rc=$?; }
      [ $rc -ne 2 ] && { echo "$STATE"; exit 0; }
      IDLE_SINCE=${IDLE_SINCE:-$(date +%s)}
      [ $(( $(date +%s) - IDLE_SINCE )) -ge "$GRACE" ] &&
        { echo "$STATE for ${GRACE}s with no fresh $STAGE handoff"; exit 25; } ;;
    blocked)   echo "blocked"; exit 10 ;;
    gone)      echo "agent $NAME gone"; exit 20 ;;
    *)         IDLE_SINCE="" ;;
  esac
  if [ -z "$IDLE_SINCE" ] && [ "$(date +%s)" -ge "$DEADLINE" ]; then
    if [ "$STATE" = working ] && ! $EXTENDED; then
      EXTENDED=true DEADLINE=$(( DEADLINE + TIMEOUT / 2 ))
    else
      echo "timed out in state $STATE$($EXTENDED && echo " (extended once to $(( TIMEOUT * 3 / 2 ))s)")"; exit 30
    fi
  fi
  sleep "$INTERVAL"
done

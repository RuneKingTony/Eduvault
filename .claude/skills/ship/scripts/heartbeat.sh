#!/bin/bash
# The run's only lock refresher: started once in the background right after the lock is taken.
# usage: heartbeat.sh <lock_file> <run_id> <watch_pid> [interval_seconds]
#   watch_pid: the orchestrating Claude process (CLAUDE_PID from setup.sh). When it dies the lock
#   is released at once.
# exit: 40 lock taken by another run (stop at once)   0 the orchestrator died or the run released it
set -u

LOCK=$1 RUN_ID=$2 WATCH=$3 INTERVAL=${4:-60}
L="$(dirname "$0")/lock.sh"

while :; do
  [ -f "$LOCK" ] || exit 0
  if ! kill -0 "$WATCH" 2>/dev/null; then bash "$L" release "$LOCK" "$RUN_ID"; exit 0; fi
  bash "$L" refresh "$LOCK" "$RUN_ID" || exit 40
  sleep "$INTERVAL"
done

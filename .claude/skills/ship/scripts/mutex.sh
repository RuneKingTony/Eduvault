#!/bin/bash
# Repo-wide mutexes shared by parallel /ship runs: `git-ops` (anything that moves the main
# checkout or creates a worktree) and `merge` (one merge into main at a time).
#
# usage: mutex.sh acquire <name> <KEY> <run_id> [timeout_s=3600] [interval_s=5]
#        mutex.sh release <name> <KEY> <run_id>        # only if the owner is still you; always 0
# exit:  0 held   30 timed out
# A holder is reclaimed when its run's .lock is stale or gone. A holder whose run is alive is never
# stolen on age alone (start-branch's pnpm install can hold git-ops well past 15 min); the only age
# cap is 60 min, for a holder that died while its run lives on (e.g. a subagent that never released).
set -u
. "$(dirname "$0")/lib.sh"

CMD=$1 NAME=$2 KEY=$3 RUN_ID=$4 TIMEOUT=${5:-3600} INTERVAL=${6:-5}
M=$OPSX/.$NAME.lock

stale_holder() {
  local ok ork olock beat
  { read -r ok ork < "$M/owner"; } 2>/dev/null || return 1
  [ $(( $(date +%s) - $(mtime "$M") )) -gt 3600 ] && return 0
  olock=$OPSX/$ok/.lock
  [ -f "$olock" ] || return 0
  [ "$(jq -r .run_id "$olock" 2>/dev/null)" = "$ork" ] || return 0
  beat=$(jq -r '.heartbeat_epoch // 0' "$olock" 2>/dev/null)
  [ $(( $(date +%s) - beat )) -gt 600 ]
}

case "$CMD" in
  acquire)
    deadline=$(( $(date +%s) + TIMEOUT ))
    while :; do
      if mkdir "$M" 2>/dev/null; then echo "$KEY $RUN_ID" > "$M/owner"; exit 0; fi
      { read -r ok ork < "$M/owner"; } 2>/dev/null
      [ "${ok:-}" = "$KEY" ] && [ "${ork:-}" = "$RUN_ID" ] && exit 0
      if { [ -f "$M/owner" ] && stale_holder; } || \
         { [ ! -f "$M/owner" ] && [ $(( $(date +%s) - $(mtime "$M") )) -gt 60 ]; }; then
        rm -rf "$M"; continue                        # holder died, or died between mkdir and owner
      fi
      [ "$(date +%s)" -ge "$deadline" ] && { echo "$NAME mutex still held by ${ok:-?} after ${TIMEOUT}s"; exit 30; }
      sleep "$INTERVAL"
    done ;;
  release)
    { read -r ok ork < "$M/owner"; } 2>/dev/null
    [ "${ok:-}" = "$KEY" ] && [ "${ork:-}" = "$RUN_ID" ] && rm -rf "$M"
    exit 0 ;;
  *) echo "usage: mutex.sh acquire|release <name> <KEY> <run_id> [timeout] [interval]" >&2; exit 2 ;;
esac

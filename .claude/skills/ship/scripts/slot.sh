#!/bin/bash
# Parallel cap: wait until fewer than <cap> other live runs are AHEAD of this one. "Ahead" = a live
# .lock (heartbeat < 10 min) acquired earlier (tie: lower run_id). Counting every live run would
# deadlock simultaneous starts — each would wait on the others. The cap is re-read every loop
# (ship_cap in lib.sh: SHIP_MAX_PARALLEL env > $OPSX/config.json .max_parallel > 3), so
# `slot.sh cap N` takes effect on runs already waiting. A /spike's epic-*/ dir is never a run.
# Run in the background; prints one line when it starts waiting, when the cap changes, and at exit.
#
# usage: slot.sh <KEY> <run_id> [timeout_s=7200]
#        slot.sh cap [N]      print (or set, in config.json) the cap → {cap, source, config}
# exit:  0 slot free   30 still full after the timeout   2 bad cap
set -u
. "$(dirname "$0")/lib.sh"

if [ "${1:-}" = cap ]; then
  if [ -n "${2:-}" ]; then
    case "$2" in ''|*[!0-9]*|0) echo "cap must be a positive integer"; exit 2 ;; esac
    mkdir -p "$OPSX"; f=$OPSX/config.json
    { cat "$f" 2>/dev/null || echo '{}'; } | jq --argjson n "$2" '.max_parallel = $n' > "$f.tmp.$$" && mv "$f.tmp.$$" "$f"
  fi
  read -r c src < <(ship_cap)
  jq -nc --argjson c "$c" --arg s "$src" --argjson f "$(jq '.max_parallel // null' "$OPSX/config.json" 2>/dev/null || echo null)" \
    '{cap: $c, source: $s, config: $f}'
  exit 0
fi

KEY=$1 RUN_ID=$2 TIMEOUT=${3:-7200}
deadline=$(( $(date +%s) + TIMEOUT ))
mine=$(jq -r '.acquired_epoch // 0' "$OPSX/$KEY/.lock" 2>/dev/null)
said=""

while :; do
  read -r MAX _ < <(ship_cap)
  now=$(date +%s) ahead=0
  for l in "$OPSX"/*/.lock; do
    [ -f "$l" ] || continue
    [ "$l" = "$OPSX/$KEY/.lock" ] && continue
    case "$l" in "$OPSX"/epic-*) continue ;; esac
    read -r r b a < <(jq -r '"\(.run_id) \(.heartbeat_epoch // 0) \(.acquired_epoch // 0)"' "$l" 2>/dev/null)
    [ $(( now - ${b:-0} )) -lt 600 ] || continue
    if [ "${a:-0}" -lt "$mine" ] || { [ "${a:-0}" -eq "$mine" ] && [[ "$r" < "$RUN_ID" ]]; }; then
      ahead=$(( ahead + 1 ))
    fi
  done
  [ "$ahead" -lt "$MAX" ] && { [ -n "$said" ] && echo "slot free (cap $MAX)"; exit 0; }
  [ "$said" = "$MAX" ] || { echo "waiting: $ahead run(s) ahead, cap $MAX"; said=$MAX; }
  [ "$now" -ge "$deadline" ] && { echo "no free /ship slot after ${TIMEOUT}s"; exit 30; }
  sleep 60
done

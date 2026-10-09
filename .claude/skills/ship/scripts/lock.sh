#!/bin/bash
# Atomic per-ticket run lock for /ship. Every check-then-write on the lock file happens inside a
# mkdir mutex (mkdir is atomic; macOS has no flock), so two runs can never both see the lock free,
# both take over the same stale lock, or overwrite each other's refresh.
#
# usage: lock.sh acquire <lock_file> <run_id>   # 0 acquired (fresh, stale takeover, or already yours)
#                                                # 40 held by another live run (heartbeat < 10 min)
#        lock.sh refresh <lock_file> <run_id>   # 0 refreshed   40 another run owns it, or it was released
#        lock.sh release <lock_file> <run_id>   # deletes it only if it's still yours; always 0
#        lock.sh status  <lock_file> [run_id]   # {held, run_id, mine, age, live, heartbeats: [pids]}; always 0
#        lock.sh steal   <lock_file> <run_id>   # take a lock whose owner died: no heartbeat process is running
#                                                # for it and its last refresh is over STEAL_GRACE (30 s) old.
#                                                # 0 stolen (prints the previous owner)   40 its heartbeat is alive
#   `status` is the only way to ask whether a heartbeat is running: never `ps | grep heartbeat` —
#   a /spike's heartbeat on epic-*/.spike-lock is the parent's, not a rival /ship.
set -u

CMD=${1:-} LOCK=${2:-} RUN_ID=${3:-}
MUTEX="$LOCK.mutex"
STALE=600
GRACE=${LOCK_STEAL_GRACE:-30}

mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }

enter() {
  for _ in $(seq 1 100); do
    mkdir "$MUTEX" 2>/dev/null && return 0
    # A holder that died inside the critical section (it lasts milliseconds) — reclaim.
    [ $(( $(date +%s) - $(mtime "$MUTEX") )) -gt 30 ] && rmdir "$MUTEX" 2>/dev/null
    sleep 0.2
  done
  echo "could not enter lock mutex $MUTEX" >&2; exit 1
}
leave() { rmdir "$MUTEX" 2>/dev/null; }

owner()     { jq -r '.run_id // empty' "$LOCK" 2>/dev/null; }
beat_age()  {
  local t; t=$(jq -r '.heartbeat_epoch // 0' "$LOCK" 2>/dev/null)
  echo $(( $(date +%s) - ${t:-0} ))
}
write() {
  # acquired_epoch is kept across refreshes: the parallel cap admits the oldest runs first.
  local acq; acq=$([ "$(owner)" = "$RUN_ID" ] && jq -r '.acquired_epoch // empty' "$LOCK" 2>/dev/null)
  jq -n --arg r "$RUN_ID" --arg t "$(date -u +%FT%TZ)" --argjson e "$(date +%s)" \
    --argjson a "${acq:-$(date +%s)}" \
    '{run_id: $r, heartbeat: $t, heartbeat_epoch: $e, acquired_epoch: $a}' \
    > "$LOCK.tmp.$$" && mv "$LOCK.tmp.$$" "$LOCK"
}

if [ "$CMD" = status ]; then
  pids=$(pgrep -f "heartbeat.sh $LOCK " 2>/dev/null | tr '\n' ' ')
  jq -nc --arg r "$(owner)" --arg me "$RUN_ID" --argjson age "$( [ -f "$LOCK" ] && beat_age || echo null)" \
    --argjson p "$(printf '%s\n' $pids | jq -R 'select(. != "") | tonumber' | jq -sc .)" --argjson st "$STALE" \
    '{held: ($r != ""), run_id: ($r | select(. != "") // null), mine: ($me != "" and $r == $me), age: $age,
      live: ($age != null and $age < $st), heartbeats: $p}'
  exit 0
fi
[ -n "$LOCK" ] && [ -n "$RUN_ID" ] || { echo "usage: lock.sh acquire|refresh|release|steal|status <lock_file> <run_id>" >&2; exit 2; }
mkdir -p "$(dirname "$LOCK")"
enter
trap leave EXIT

case "$CMD" in
  acquire)
    if [ -f "$LOCK" ] && [ "$(owner)" != "$RUN_ID" ] && [ "$(beat_age)" -lt "$STALE" ]; then
      echo "held by $(owner), last seen $(jq -r .heartbeat "$LOCK")"; exit 40
    fi
    write ;;
  refresh)
    # A missing lock means it was released: refreshing must never recreate it, or a heartbeat
    # that outlived its run would make the next /ship see a live run for ten minutes.
    [ -f "$LOCK" ] || { echo "lock released"; exit 40; }
    [ "$(owner)" != "$RUN_ID" ] && { echo "lock held by another run"; exit 40; }
    write ;;
  release)
    [ "$(owner)" = "$RUN_ID" ] && rm -f "$LOCK" ;;
  steal)
    # The grace covers a run that has just acquired and not yet started its heartbeat.
    if [ -f "$LOCK" ] && [ "$(owner)" != "$RUN_ID" ]; then
      [ "$(beat_age)" -lt "$GRACE" ] && { echo "held by $(owner), refreshed ${GRACE}s ago or less: not stealing"; exit 40; }
      [ -n "$(pgrep -f "heartbeat.sh $LOCK " 2>/dev/null)" ] && { echo "held by $(owner): its heartbeat is running"; exit 40; }
      echo "stole the lock from $(owner), last seen $(jq -r .heartbeat "$LOCK")"
    fi
    write ;;
  *) echo "usage: lock.sh acquire|refresh|release|steal|status <lock_file> <run_id>" >&2; exit 2 ;;
esac
exit 0

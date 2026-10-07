#!/bin/bash
# Shared helpers for the ship scripts. Sourced, never run.
# ROOT is the main checkout (the git common dir's parent), so a worker in a worktree that calls
# these scripts still reads and writes the one shared .claude/opsx.
W=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
if [ -n "${SHIP_ROOT:-}" ]; then ROOT=$SHIP_ROOT
else
  _g=$(git -C "$W" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [ -n "$_g" ]; then ROOT=$(dirname "$_g"); else ROOT=$(cd "$W/../../../.." && pwd -P); fi
fi
OPSX=${SHIP_OPSX:-$ROOT/.claude/opsx}   # SHIP_OPSX: tests only
GHI=$W/../../github-issues/scripts/gh-issues.sh
PROPOSE_SKILL=$W/../../propose/SKILL.md
export EDU_ORCHESTRATED=1

STAGES=(fetch branch propose implement security-gate simplify review security fix-blockers e2e push pr merge-gate cleanup)

# Herdr is a hard dependency: every script that talks to Herdr calls this first.
require_herdr() {
  [ -n "${HERDR_ENV:-}" ] || { echo "ship needs Herdr: HERDR_ENV is unset. Start Claude inside a Herdr pane and run it again." >&2; exit 2; }
}

key_dir() { echo "$OPSX/$1"; }
now_iso() { date -u +%FT%TZ; }
mtime()   { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }
issue_num() { echo "${1#EDU-}"; }

st_get() {  # <KEY> <jq filter> [jq args...]  raw output, empty when unset
  local k=$1 f=$2; shift 2
  jq -r "$@" "$f // empty" "$(key_dir "$k")/status.json" 2>/dev/null
}
st_set() {  # <KEY> <jq filter> [jq args...]  atomic; creates the file if missing
  local k=$1 f=$2; shift 2
  local d; d=$(key_dir "$k"); mkdir -p "$d"
  [ -f "$d/status.json" ] || echo '{"stages":{}}' > "$d/status.json"
  jq "$@" "$f" "$d/status.json" > "$d/status.json.tmp.$$" && mv "$d/status.json.tmp.$$" "$d/status.json"
}
agent_status() {  # <agent name> → idle|working|blocked|done|unknown, or "gone"
  local out; out=$(herdr agent get "$1" 2>/dev/null) || { echo gone; return; }
  printf '%s' "$out" | jq -r '.result.agent.agent_status // "unknown"'
}
pane_alive() { [ -n "${1:-}" ] && herdr pane get "$1" >/dev/null 2>&1; }
# The key matched exactly and case-insensitively, never as a substring (EDU-12 != EDU-123).
key_re() { echo "(^|[^A-Za-z0-9])$1([^0-9]|\$)"; }

lock_run() {  # run_id of the ticket's lock while its heartbeat is fresh (< 10 min), else empty
  local l; l=$(key_dir "$1")/.lock
  [ -f "$l" ] || return 0
  jq -r --argjson now "$(date +%s)" 'select($now - (.heartbeat_epoch // 0) < 600) | .run_id // empty' "$l" 2>/dev/null
}
# stage_next_attempt <KEY> <stage> → "<n> <same_run>": a `running` mark made earlier in this same
# run is the same attempt, so re-marking it does not bump attempts.
stage_next_attempt() {
  local n r rid; rid=$(lock_run "$1")
  read -r n r < <(st_get "$1" ".stages[\"$2\"] | \"\\(.attempts // 0) \\(if .result == \"running\" then (.run_id // \"-\") else \"-\" end)\"")
  case "${n:-0}" in ''|*[!0-9]*) n=0 ;; esac
  if [ -n "$rid" ] && [ "${r:--}" = "$rid" ] && [ "$n" -gt 0 ]; then echo "$n true"; else echo "$(( n + 1 )) false"; fi
}

# Parallel cap: SHIP_MAX_PARALLEL (spike exports it) > $OPSX/config.json .max_parallel > 3 → "<cap> <source>"
ship_cap() {
  local c
  case "${SHIP_MAX_PARALLEL:-}" in ''|*[!0-9]*) ;; *) echo "$SHIP_MAX_PARALLEL env"; return ;; esac
  c=$(jq -r '.max_parallel // empty' "$OPSX/config.json" 2>/dev/null)
  case "$c" in ''|*[!0-9]*) echo "3 default" ;; *) echo "$c config" ;; esac
}

# The /spike run that launched this ship, as JSON or null. Its .spike-lock heartbeat is the
# parent's, never a rival /ship.
parent_spike() {  # <KEY>
  local e="${SPIKE_EPIC:-}" f
  if [ -z "$e" ]; then
    for f in "$OPSX"/epic-*/status.json; do
      [ -f "$f" ] || continue
      jq -e --arg k "$1" '.dispatched[$k] and (.dispatched[$k].closed_at | not)' "$f" >/dev/null 2>&1 &&
        { e=${f%/status.json}; e=${e##*/epic-}; break; }
    done
  fi
  [ -n "$e" ] || { echo null; return; }
  jq -nc --arg e "$e" --arg src "$([ -n "${SPIKE_EPIC:-}" ] && echo env || echo epic-status)" \
    --slurpfile l <(cat "$OPSX/epic-$e/.spike-lock" 2>/dev/null || echo '{}') --argjson now "$(date +%s)" \
    '{epic: $e, source: $src, run_id: ($l[0].run_id // null), live: ($now - ($l[0].heartbeat_epoch // 0) < 600)}'
}

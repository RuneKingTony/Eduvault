#!/bin/bash
# Shared helpers for the spike scripts. Sourced, never run.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)
SP=$ROOT/.claude/skills/spike/scripts
W=$ROOT/.claude/skills/ship/scripts            # ship's own scripts — reused, never copied
GH=${SPIKE_GH_ISSUES:-$ROOT/.claude/skills/github-issues/scripts/gh-issues.sh}   # SPIKE_GH_ISSUES: tests only
OPSX=${SPIKE_OPSX:-$ROOT/.claude/opsx}   # SPIKE_OPSX: tests only
STALE=600                                       # same staleness as ship's lock.sh / slot.sh
DEAD_FAST=180                                   # a heartbeat this old with no heartbeat process is a dead run, not a slow one

# The epic's state dir. Its lock is `.spike-lock`, NOT `.lock`: ship's slot.sh counts every
# $OPSX/*/.lock as a live /ship run, so a `.lock` here would eat one of the parallel slots.
epic_dir() { echo "$OPSX/epic-$1"; }
now_iso()  { date -u +%FT%TZ; }
es_get() { jq -r "${@:3}" "$2 // empty" "$(epic_dir "$1")/status.json" 2>/dev/null; }
es_set() {  # atomic, like ship's st_set
  local e=$1 f=$2; shift 2
  local d rc; d=$(epic_dir "$e"); mkdir -p "$d"
  [ -f "$d/status.json" ] || echo '{"dispatched":{}}' > "$d/status.json"
  # wait.sh writes .notified/.merged in the background while dispatch.sh records panes: serialise the
  # read-modify-write, or one of them drops the other's field
  for _ in $(seq 1 50); do
    mkdir "$d/.status.mutex" 2>/dev/null && break
    [ $(( $(date +%s) - $(stat -f %m "$d/.status.mutex" 2>/dev/null || echo 0) )) -gt 10 ] && rmdir "$d/.status.mutex" 2>/dev/null
    sleep 0.1
  done
  jq "$@" "$f" "$d/status.json" > "$d/status.json.tmp.$$" && mv "$d/status.json.tmp.$$" "$d/status.json"; rc=$?
  rmdir "$d/.status.mutex" 2>/dev/null
  return $rc
}
mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }

SHIP_STAGES=$(sed -n 's/^STAGES=(\(.*\))$/\1/p' "$W/lib.sh" 2>/dev/null)
SHIP_STAGES=${SHIP_STAGES:-fetch branch propose implement security-gate simplify review security fix-blockers e2e push merge-gate cleanup}
# ship_stage <KEY> → {stage, result, since} from ship's status.json ({} when ship never ran): the stage
# whose result is `running`, else ship's next one (a passed merge-gate jumps to cleanup). `since` is its
# start, else when the stage before it finished. merge-sync is an auxiliary record, never the stage.
ship_stage() {
  jq -c --arg o "$SHIP_STAGES" '
    def ep: try fromdateiso8601 catch null;
    ($o | split(" ")) as $order | (.stages // {}) as $s
    | (first($order[] | select($s[.].result == "running")) // null) as $run
    | (if $s["merge-gate"].result == "pass" then (if $s.cleanup.result == "pass" then null else "cleanup" end)
       else first($order[] | select(($s[.].result // "") | . != "pass" and . != "skipped")) // null end) as $next
    | ($run // $next) as $cur
    | if $cur == null then {stage: "done", result: "pass"}
      else ($s[$cur] // {}) as $c
      | {stage: $cur, result: ($c.result // "next"),
         since: ($c.started_epoch // (($c.started_at // "") | ep)
                 // ([$s[] | (.at // "") | ep | select(. != null)] | max))}
      end' "$OPSX/$1/status.json" 2>/dev/null || echo '{}'
}

# A Claude pane's text without the chrome: rules, the status bar, mode lines, timing lines, and the trailing
# input prompt (which can hold a ghost suggestion the user never typed).
pane_clean() {
  grep -v -E '^[[:space:]]*$|^[[:space:]]*[─━]{3,}|│.*●|manual mode on|bypass permissions|⏵⏵|\? for shortcuts|^[[:space:]]*✻ ' |
    awk '{ l[NR] = $0 } END { n = NR; while (n > 0 && l[n] ~ /^❯/) n--; for (i = 1; i <= n; i++) print l[i] }'
}
# pane_text <agent> <pane> <agent status> [lines=150] — cleaned. A blocked agent refuses `agent read`, and its
# dialog is on the visible screen. Panes are ~80 rows of mostly blank space below a short chat, so ask for
# well over a screen of lines.
pane_text() {
  local n=${4:-150} t=""
  if [ "$3" = blocked ]; then t=$(herdr pane read "$2" --source visible --lines "$n" --format text 2>/dev/null)
  else
    [ -n "$1" ] && t=$(herdr agent read "$1" --source recent --lines "$n" --format text 2>/dev/null)
    { [ -z "$t" ] || grep -q '"error"' <<<"$t"; } && t=$(herdr pane read "$2" --source recent --lines "$n" --format text 2>/dev/null)
  fi
  printf '%s\n' "$t" | pane_clean
}
OPT_RE='^[[:space:]]*(❯[[:space:]]*)?[0-9]+\.[[:space:]]'
# last_block < cleaned text → the last ⏺ block that is Claude talking, not a tool call or a background-task
# notice ("That's just the heartbeat ending normally"); the last block of any kind when every one is chatter
CHATTER_RE='heartbeat|task-notification|background (task|command)|exited with code|^⏺ *(ran|bash[(])'
last_block() {
  awk -v re="$CHATTER_RE" '
    function close_block() { if (!f) return; last = b; if (tolower(first) !~ re) keep = b }
    /^⏺/ { close_block(); b = ""; first = $0; f = 1 }
    f { b = b $0 "\n" }
    END { close_block(); printf "%s", (keep != "" ? keep : last) }'
}
# asks_question < cleaned text → 0 when Claude's last real message asks something
asks_question() { last_block | grep -q '?'; }
# question_of <dialog|text|halt> < cleaned text → one line: a dialog's question (the line above its first
# option); else from the last thing Claude said (its last ⏺ block), the last line asking something (text) or
# its first line
question_of() {
  local t q="" first b; t=$(cat)
  if [ "$1" = dialog ] && first=$(grep -n -E "$OPT_RE" <<<"$t" | head -1 | cut -d: -f1) && [ "${first:-1}" -gt 1 ]; then
    q=$(head -n $(( first - 1 )) <<<"$t" | grep -v -E '^[[:space:]]*[☐☒✔]' | tail -1)
  fi
  if [ -z "$q" ]; then
    b=$(last_block <<<"$t")
    [ "$1" = text ] && q=$(grep '?' <<<"$b" | tail -1)
    [ -z "$q" ] && q=$(head -1 <<<"$b")
  fi
  [ -z "$q" ] && q=$(tail -1 <<<"$t")
  printf '%s' "$q" | sed -E 's/^[[:space:]]*(⏺|☐|☒)?[[:space:]]*//' | jq -Rr '.[0:200]'
}

# loop_live <EPIC> → 0 while a /spike session's heartbeat holds the epic's .spike-lock (read-only, needs no ship script)
loop_live() {
  local f hb; f=$(epic_dir "$1")/.spike-lock; [ -f "$f" ] || return 1
  hb=$(jq -r '.heartbeat_epoch // 0' "$f" 2>/dev/null)
  [ $(( $(date +%s) - ${hb:-0} )) -lt $STALE ] && ! lock_dead "$f"
}
loop_line() {
  if loop_live "$1"; then echo "spike loop: live"
  else echo "spike loop: not running (resume with /spike $1)"; fi
}

# The run's tab, only while it still carries this epic's label: a recorded id that now names another tab
# (renamed by the user, or reissued after a Herdr restart) must never get ticket panes split into it.
live_tab() {
  local t; t=$(es_get "$1" '.spike_tab'); [ -n "$t" ] || return 1
  herdr tab get "$t" 2>/dev/null | jq -e --arg p "spike · $1" '.result.tab.label | . == $p or startswith($p + " ")' >/dev/null && echo "$t"
}
# agent_gone <agent> → 0 only when Herdr answers that the agent doesn't exist
agent_gone() { [ -n "${1:-}" ] && herdr agent get "$1" 2>&1 | grep -q '"agent_not_found"'; }
# lock_dead <lock_file> [agent] → 0 when the run behind the lock is gone before STALE says so: the heartbeat is
# over DEAD_FAST old and either no heartbeat process holds the lock (lock.sh status) or Herdr lost the agent
lock_dead() {
  local f=$1 hb age
  [ -f "$f" ] || return 1
  hb=$(jq -r '.heartbeat_epoch // 0' "$f" 2>/dev/null); age=$(( $(date +%s) - ${hb:-0} ))
  [ "$age" -gt "$DEAD_FAST" ] || return 1
  [ "$(bash "$W/lock.sh" status "$f" 2>/dev/null | jq -r '.heartbeats | length')" = 0 ] && return 0
  agent_gone "${2:-}"
}
# pane_gone <pane> → 0 only when Herdr answers that the pane doesn't exist; Herdr itself being down is not "gone"
pane_gone() { [ -n "${1:-}" ] && herdr pane get "$1" 2>&1 >/dev/null | grep -q '"pane_not_found"'; }

# norm_epic <KEY> -> EDU-<n> uppercased, or a message on stderr and status 2
norm_epic() {
  local k; k=$(printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]')
  [[ "$k" =~ ^EDU-[0-9]+$ ]] || { echo "expected an issue key like EDU-123, got '${1:-}'" >&2; return 2; }
  printf '%s' "$k"
}
# need_herdr: every path that starts, answers, stops or closes a ticket pane needs Herdr
need_herdr() {
  if [ "${HERDR_ENV:-}" != 1 ] || ! command -v herdr >/dev/null 2>&1; then
    echo "$(basename "$0"): not inside Herdr (HERDR_ENV=${HERDR_ENV:-unset}, herdr on PATH: $(command -v herdr >/dev/null 2>&1 && echo yes || echo no)). Start Claude from a Herdr pane; --status and --dry-run work without it." >&2
    exit 13
  fi
}

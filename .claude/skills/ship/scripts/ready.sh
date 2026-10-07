#!/bin/bash
# Is a freshly started Claude ready for its first prompt? `idle`, or `done` (Herdr's idle-after-
# unseen-work, which a new Claude inherits from the reused pane of an unfocused tab) once
# interactive_ready is true and the screen shows the input prompt, not a startup dialog.
# working, blocked and unknown are never ready; a folder-trust dialog doesn't show as blocked.
#
# usage: ready.sh <agent name> [wait_seconds=30]   polls once a second; 0 = a single check
# exit:  0 ready (prints idle|done)   1 not ready (prints the last status, or gone)
set -u
. "$(dirname "$0")/lib.sh"
require_herdr
NAME=$1 WAIT=${2:-30}

prompt_shown() {   # <pane> — an input prompt is on screen, and no numbered menu (a dialog) is
  local v; v=$(herdr pane read "$1" --source visible --lines 15 --format text 2>/dev/null) || return 1
  grep -q '^❯' <<<"$v" && ! grep -qE '❯[^0-9A-Za-z]{0,4}[0-9]+\.' <<<"$v"
}

s=gone
for i in $(seq 0 "$WAIT"); do
  if j=$(herdr agent get "$NAME" 2>/dev/null); then
    read -r s r p < <(jq -r '.result.agent | "\(.agent_status // "unknown") \(.interactive_ready // false) \(.pane_id // "-")"' <<<"$j")
    case "$s" in
      idle) echo idle; exit 0 ;;
      done) [ "$r" = true ] && prompt_shown "$p" && { echo done; exit 0; } ;;
    esac
  else s=gone; fi
  [ "$i" -lt "$WAIT" ] && sleep 1
done
echo "$s"; exit 1

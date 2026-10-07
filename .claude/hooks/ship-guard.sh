#!/bin/bash
# PreToolUse guard (matcher: ScheduleWakeup). Denies ScheduleWakeup while this session drives a live
# /ship run: a heartbeat.sh watching one of this hook's ancestor pids (the orchestrating claude) holds a
# fresh lock, or cwd is inside the worktree of an issue whose lock is fresh (a ship worker).
# Anything else, or input it can't parse: no output, exit 0 (allow).
set -u

IN=$(cat)
TOOL=$(jq -r '.tool_name // empty' <<<"$IN" 2>/dev/null) || exit 0
[ "$TOOL" = ScheduleWakeup ] || exit 0

if [ -n "${SHIP_OPSX:-}" ]; then OPSX=$SHIP_OPSX
else
  G=$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
  OPSX=$(dirname "$G")/.claude/opsx
fi

deny() {
  jq -nc --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}
fresh_lock() { [ -f "$1" ] && jq -e --argjson now "$(date +%s)" '$now - (.heartbeat_epoch // 0) < 600' "$1" >/dev/null 2>&1; }

REASON="This session is driving a /ship run: wait on a Bash call with run_in_background: true and end your turn (the harness wakes you when it exits). Never ScheduleWakeup."
ANC=" " p=$PPID
while [ -n "$p" ] && [ "$p" -gt 1 ] 2>/dev/null; do ANC="$ANC$p "; p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' '); done
while read -r _ args; do
  set -- $args
  while [ $# -gt 0 ] && [[ "$1" != *heartbeat.sh ]]; do shift; done
  [ $# -ge 4 ] || continue
  [[ "$ANC" == *" $4 "* ]] && fresh_lock "$2" && deny "$REASON"
done < <(pgrep -lf 'heartbeat\.sh ' 2>/dev/null)
CWD=$(jq -r '.cwd // empty' <<<"$IN" 2>/dev/null)
[ -n "$CWD" ] || exit 0
for f in "$OPSX"/*/status.json; do
  [ -f "$f" ] || continue
  t=$(jq -r '.worktree_path // empty' "$f" 2>/dev/null)
  [ -n "$t" ] && { [ "$CWD" = "$t" ] || [[ "$CWD" == "$t"/* ]]; } && fresh_lock "${f%/status.json}/.lock" && deny "$REASON"
done
exit 0

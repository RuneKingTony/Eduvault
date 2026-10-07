#!/bin/bash
# Offline test for ship-guard.sh. usage: bash .claude/hooks/test-ship-guard.sh
set -u
H=$(cd "$(dirname "$0")" && pwd -P)
HB=$H/../skills/ship/scripts/heartbeat.sh
HBPID=
T=$(mktemp -d); trap 'kill $HBPID 2>/dev/null; rm -rf "$T"' EXIT
export SHIP_OPSX=$T/opsx
mkdir -p "$SHIP_OPSX/EDU-1" "$T/wt/sub"
FAIL=0
ok() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (want '$2', got '$3')"; FAIL=1; fi; }
run() { jq -nc --arg t "$1" --arg c "${2:-}" '{tool_name: $t, cwd: $c}' | bash "$H/ship-guard.sh"; }
dec() { [ -n "${1:-}" ] && jq -r '.hookSpecificOutput.permissionDecision // "allow"' <<<"$1" || echo allow; }
lock() { jq -nc --argjson e "$1" '{run_id: "r", heartbeat_epoch: $e, acquired_epoch: $e}' > "$SHIP_OPSX/EDU-1/.lock"; }
echo "{\"worktree_path\": \"$T/wt\", \"stages\": {}}" > "$SHIP_OPSX/EDU-1/status.json"

lock "$(date +%s)"
ok "worker cwd in worktree, fresh lock: deny" deny "$(dec "$(run ScheduleWakeup "$T/wt/sub")")"
ok "cwd elsewhere: allow" allow "$(dec "$(run ScheduleWakeup /tmp)")"
ok "other tool, fresh lock: allow" allow "$(dec "$(run Bash "$T/wt")")"
lock "$(( $(date +%s) - 700 ))"
ok "stale lock: allow" allow "$(dec "$(run ScheduleWakeup "$T/wt")")"
rm -f "$SHIP_OPSX/EDU-1/.lock"
ok "no lock: allow" allow "$(dec "$(run ScheduleWakeup "$T/wt")")"
ok "unparseable input: allow" allow "$(dec "$(echo 'not json' | bash "$H/ship-guard.sh")")"

# orchestrator: a heartbeat watching an ancestor pid of the hook
lock "$(date +%s)"
OUT=$(bash -c 'bash "$1" "$2" r $$ 60 & HBPID=$!; sleep 1; echo "{\"tool_name\":\"ScheduleWakeup\",\"cwd\":\"/tmp\"}" | bash "$3"; kill $HBPID' _ "$HB" "$SHIP_OPSX/EDU-1/.lock" "$H/ship-guard.sh")
ok "heartbeat watching an ancestor: deny" deny "$(dec "$OUT")"
exit $FAIL

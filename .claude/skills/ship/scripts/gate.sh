#!/bin/bash
# security-gate: run the mechanical predicate in the worktree and record it.
# usage: gate.sh <KEY>   prints {"fires": bool, "reason"}; records security-gate (and
#                        security: skipped when it doesn't fire)
# security-gate.sh: exit 0 = not triggered, 10 = triggered, anything else = error.
set -u
. "$(dirname "$0")/lib.sh"
KEY=$1 TREE=$(st_get "$1" '.worktree_path')
OUT=$(cd "$TREE" && {
  git fetch -q origin main 2>/dev/null
  bash "$W/security-gate.sh" origin/main
} 2>&1); rc=$?
case $rc in 0) F=false ;; 10) F=true ;; *) echo "security-gate.sh failed ($rc): $OUT" >&2; exit 1 ;; esac
X=$(jq -nc --argjson f $F --arg r "$OUT" '{fires: $f, reason: $r}')
bash "$W/state.sh" stage "$KEY" security-gate pass "$X"
[ $F = false ] && bash "$W/state.sh" stage "$KEY" security skipped
echo "$X"

#!/bin/bash
# The merge gate waits for CI and nothing else. A human merges. It never runs `gh pr merge`, never
# uses --admin and never marks the PR ready.
#
# usage: merge-gate.sh <KEY> <run_id>
# A red check on a branch behind main updates the branch once and waits again. A red check whose job
# logs show no failing test, lint or type error is rerun once per workflow run (merge-gate .rerun).
# exit:  0 CI green, PR open and mergeable, not held: recorded `pass` (the human merges now)
#        1 a check failed on an up-to-date branch (names them, with the failing job's error lines)
#        20 conflicts with main: run a merge-sync worker turn, then this again
#        21 PR not open
#        23 held: `hold-merge` on ticket.json .labels or the PR (recorded `held`, never `pass`)
#        30 timed out waiting for checks
set -u
. "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 1

KEY=$1 RUN_ID=${2:-}
PR=$(st_get "$KEY" '.pr_url')
[ -n "$PR" ] || { echo "no pr_url in status.json"; exit 21; }
behind() { gh api "repos/{owner}/{repo}/compare/main...$1" --jq .behind_by 2>/dev/null || echo 0; }
held() {  # fails closed: PR labels that can't be read count as held
  if jq -e 'any(.labels[]?; . == "hold-merge")' "$(key_dir "$KEY")/ticket.json" >/dev/null 2>&1; then
    echo "held: ticket.json carries hold-merge"; return 0
  fi
  local l
  l=$(gh pr view "$PR" --json labels -q '.labels[].name' 2>/dev/null) || { echo "held: could not read the PR's labels"; return 0; }
  grep -qx hold-merge <<<"$l" && { echo "held: the PR carries hold-merge"; return 0; }
  return 1
}
hold_exit() {
  local why; why=$(held) || return 0
  echo "$why"
  st_set "$KEY" '.stages["merge-gate"] = ((.stages["merge-gate"] // {}) + {result: "held", at: $t, reason: $r})' \
    --arg t "$(now_iso)" --arg r "$why"
  exit 23
}
rerun() {  # <run ids>: each at most once across resumes; 1 when none is left to rerun
  local id did=false s
  for id in "$@"; do
    st_get "$KEY" '.stages["merge-gate"].rerun[]?' | grep -qx "$id" && continue
    for _ in $(seq 1 40); do
      s=$(gh run view "$id" --json status -q .status 2>/dev/null); [ "$s" = completed ] && break; sleep 30
    done
    st_set "$KEY" '.stages["merge-gate"].rerun = ((.stages["merge-gate"].rerun // []) + [$id])' --arg id "$id"
    gh run rerun "$id" --failed >/dev/null 2>&1 && { echo "run $id failed with no test, lint or type error in its logs: reran its failed jobs once"; did=true; }
  done
  $did
}
SYNCED_RED=false OUT_F=$(mktemp)
trap 'rm -f "$OUT_F"' EXIT

for round in 1 2 3 4 5 6; do
  bash "$W/wait-checks.sh" "$PR" 3600 | tee "$OUT_F"; rc=${PIPESTATUS[0]}
  if [ $rc -eq 2 ]; then
    IDS=$(sed -n 's/^rerunnable://p' "$OUT_F" | tail -1)
    [ -n "$IDS" ] && rerun $IDS && { sleep 20; continue; }
    rc=1
  fi
  if [ $rc -eq 1 ] && ! $SYNCED_RED; then
    H=$(gh pr view "$PR" --json headRefOid -q .headRefOid 2>/dev/null)
    B=$([ -n "$H" ] && behind "$H" || echo 0)
    if [ "${B:-0}" -gt 0 ]; then
      SYNCED_RED=true
      gh pr update-branch "$PR" >/dev/null 2>&1 || { echo "update-branch refused: conflicts with main"; exit 20; }
      echo "red while $B behind main: updated the branch, waiting for CI once more"; sleep 20; continue
    fi
  fi
  [ $rc -ne 0 ] && exit $rc

  V=$(gh pr view "$PR" --json state,isDraft,mergeable)
  read -r STATE DRAFT MERGEABLE < <(jq -r '"\(.state) \(.isDraft) \(.mergeable)"' <<<"$V")
  [ "$STATE" = MERGED ] && { st_set "$KEY" '.merged = true | .stages["merge-gate"] = {result: "pass", via: "merged-externally", at: $t}' --arg t "$(now_iso)"; echo "already merged"; exit 0; }
  hold_exit
  [ "$STATE" = OPEN ] || { echo "PR is $STATE"; exit 21; }
  [ "$MERGEABLE" = CONFLICTING ] && { echo "conflicts with main"; exit 20; }
  st_set "$KEY" '.stages["merge-gate"] = ((.stages["merge-gate"] // {}) + {result: "pass", at: $t, draft: ($d == "true")} | del(.reason))' \
    --arg t "$(now_iso)" --arg d "$DRAFT"
  echo "CI green on $PR: waiting for a human to merge"
  exit 0
done
echo "CI never settled after 6 rounds"; exit 30

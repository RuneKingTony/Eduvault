#!/bin/bash
# The finish step, for `/ship <KEY> --finish` and for an `--auto-decide` run (which has no human gate): mark
# the PR ready, squash-merge it at the head the merge gate saw, and close the issue. Nothing else in ship does
# any of the three. It refuses unless the merge gate recorded pass and the PR is still open, mergeable, green
# and not held; it never uses --admin and never merges around a red or pending check. Without --yes it
# prints the plan only.
# Closing the issue runs without EDU_ORCHESTRATED, because the request is explicit (--finish or --auto-decide).
#
# usage: finish.sh <KEY> [--yes] [--via=auto-decide]   --via only labels the request in status.json
# exit:  0 done (or, without --yes, ready to do)
#        1 refused: checks not all green, conflicts with main, or a gh write failed (output says which)
#        2 not at the gate: no PR recorded, or the merge gate has not recorded pass
#        21 PR not open and not merged      23 held: hold-merge on the issue or the PR
#        3 gh could not read the PR
set -u
. "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 1

KEY=${1:-} YES=false VIA=--finish
[ -n "$KEY" ] || { sed -n '2,15p' "$0"; exit 2; }
shift
for a in "$@"; do
  case "$a" in
    --yes) YES=true ;;
    --via=auto-decide) VIA=--auto-decide ;;
    *) echo "unknown argument $a"; exit 2 ;;
  esac
done
N=$(issue_num "$KEY") PR=$(st_get "$KEY" '.pr_url')
[ -n "$PR" ] || { echo "no pr_url in status.json: nothing to finish for $KEY"; exit 2; }
[ "$(st_get "$KEY" '.stages["merge-gate"].result')" = pass ] ||
  { echo "the merge gate has not recorded pass for $KEY: run it first"; exit 2; }

V=$(gh pr view "$PR" --json state,isDraft,mergeable,headRefOid,labels,statusCheckRollup 2>/dev/null) ||
  { echo "gh pr view $PR failed"; exit 3; }
read -r STATE DRAFT MERGEABLE HEAD < <(jq -r '"\(.state) \(.isDraft) \(.mergeable) \(.headRefOid)"' <<<"$V")

if [ "$STATE" != MERGED ]; then
  [ "$STATE" = OPEN ] || { echo "PR is $STATE"; exit 21; }
  if jq -e 'any(.labels[]?; .name == "hold-merge")' <<<"$V" >/dev/null 2>&1 ||
     jq -e 'any(.labels[]?; . == "hold-merge")' "$(key_dir "$KEY")/ticket.json" >/dev/null 2>&1; then
    echo "held: hold-merge is on the issue or the PR"; exit 23
  fi
  [ "$MERGEABLE" = CONFLICTING ] && { echo "conflicts with main: run the merge gate again"; exit 1; }
  NOT_GREEN=$(jq -r '[.statusCheckRollup[]? | (.conclusion // .state // "PENDING") | select(. != "SUCCESS" and . != "SKIPPED" and . != "NEUTRAL")] | length' <<<"$V")
  TOTAL=$(jq '[.statusCheckRollup[]?] | length' <<<"$V")
  [ "${TOTAL:-0}" -gt 0 ] && [ "${NOT_GREEN:-1}" -eq 0 ] ||
    { echo "checks are not all green ($NOT_GREEN of $TOTAL not): run the merge gate again"; exit 1; }
fi

PLAN=()
[ "$STATE" = OPEN ] && [ "$DRAFT" = true ] && PLAN+=("mark ready")
[ "$STATE" = OPEN ] && PLAN+=("squash-merge at $HEAD")
PLAN+=("close issue #$N")
if ! $YES; then
  jq -nc --arg pr "$PR" --argjson p "$(printf '%s\n' "${PLAN[@]}" | jq -R . | jq -sc .)" '{dry_run: true, pr: $pr, plan: $p}'
  exit 0
fi

if [ "$STATE" = OPEN ]; then
  [ "$DRAFT" = true ] && { gh pr ready "$PR" >/dev/null 2>&1 || { echo "gh pr ready failed"; exit 1; }; }
  gh pr merge "$PR" --squash --match-head-commit "$HEAD" >/dev/null 2>&1 ||
    { echo "gh pr merge refused (the head moved, or a rule blocks it): nothing was forced"; exit 1; }
fi
st_set "$KEY" '.merged = true | .finish = {at: $t, via: $v}
  | .stages["merge-gate"] = ((.stages["merge-gate"] // {}) + {result: "pass", via: "finish", at: $t})' --arg t "$(now_iso)" --arg v "$VIA"

CLOSE=$(env -u EDU_ORCHESTRATED bash "$GHI" close-issue "$N" --yes 2>&1) ||
  { echo "merged, but closing #$N failed: $(tail -c 200 <<<"$CLOSE" | tr '\n' ' ')"; exit 1; }
st_set "$KEY" '.finish.issue_closed = $t' --arg t "$(now_iso)"
jq -nc --arg pr "$PR" --argjson n "$N" '{merged: $pr, closed: $n}'

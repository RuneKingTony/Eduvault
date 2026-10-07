#!/bin/bash
# The routine issue writes, through gh-issues.sh, recorded in status.json .issue so a resume skips them.
# A failed write is reported, never a halt. Closing the issue is human-only and never done here.
#
# usage: issue-sync.sh <KEY>   after fetch: assign @me + label in-progress; after pr: label in-review
set -u
. "$(dirname "$0")/lib.sh"
KEY=$1 N=$(issue_num "$1")
OUT=()
if [ "$(st_get "$KEY" '.stages.fetch.result')" = pass ] && [ -z "$(st_get "$KEY" '.issue.in_progress')" ]; then
  if bash "$GHI" assign "$N" @me --yes >/dev/null 2>&1 && bash "$GHI" transition "$N" in-progress --yes >/dev/null 2>&1; then
    st_set "$KEY" '.issue.in_progress = $t' --arg t "$(now_iso)"; OUT+=(in-progress)
  else OUT+=("in-progress FAILED"); fi
fi
if [ "$(st_get "$KEY" '.stages.pr.result')" = pass ] && [ -z "$(st_get "$KEY" '.issue.in_review')" ]; then
  if bash "$GHI" transition "$N" in-review --yes >/dev/null 2>&1; then
    st_set "$KEY" '.issue.in_review = $t' --arg t "$(now_iso)"; OUT+=(in-review)
  else OUT+=("in-review FAILED"); fi
fi
jq -nc --argjson o "$(printf '%s\n' "${OUT[@]+"${OUT[@]}"}" | jq -R . | jq -sc 'map(select(. != ""))')" '{synced: $o}'

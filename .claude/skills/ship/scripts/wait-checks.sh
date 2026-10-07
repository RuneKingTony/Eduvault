#!/bin/bash
# Wait for a PR's checks to settle. (The lock is kept fresh by heartbeat.sh, not here.)
# While waiting it prints "waiting on <checks> (<elapsed>)" whenever the pending set changes and at
# least every 5 minutes, so a background call's output answers "still waiting?".
# A conflict with main is checked on every poll, first: GitHub runs no checks on a conflicting PR.
# On a failure it prints each failed check's error lines from its job log.
#
# usage: wait-checks.sh <pr_url> <timeout_seconds> [interval_seconds=30]
# exit:  0 all checks passed or skipped   1 a check failed or was cancelled
#        2 failed, but no failing test, lint or type error in any failed job's log (runner died, or
#          an infrastructure flake) — the last line is "rerunnable: <run ids>"
#        20 the PR conflicts with main (GitHub runs no checks on it until that is resolved)
#        30 timed out (still pending, or no checks ever registered)
set -u
. "$(dirname "$0")/lib.sh"

PR=$1 TIMEOUT=$2 INTERVAL=${3:-30}
START=$(date +%s) DEADLINE=$(( $(date +%s) + TIMEOUT ))
LAST="" LAST_AT=$START
REAL_FAILURE=' FAIL |×|✗|[0-9]+ failed|[0-9]+ failing|AssertionError|error TS[0-9]+|[0-9]+:[0-9]+ +error |Failed tasks:|Code style issues|Run failed|ELIFECYCLE'
el() { local s=$(( $(date +%s) - START )); [ $s -ge 60 ] && echo "$(( s / 60 ))m" || echo "${s}s"; }
# job log lines without ANSI colour or the "<job>\t<step>\t<timestamp>" prefix
joblog() { gh run view --job "$1" --log-failed 2>/dev/null | sed -E $'s/(\x1b|\\^\\[)\\[[0-9;]*m//g; s/^[^\t]*\t[^\t]*\t[0-9T:.-]+Z ?//'; }

failed() {
  local real=false runs="" name link run job log
  echo "failed: $(jq -r '[.[] | select(.bucket=="fail" or .bucket=="cancel") | .name] | join(", ")' <<<"$C")"
  while IFS=$'\t' read -r name link; do
    if [[ "$link" =~ /actions/runs/([0-9]+)/job/([0-9]+) ]]; then
      run=${BASH_REMATCH[1]} job=${BASH_REMATCH[2]}
      log=$(joblog "$job")
      echo "── $name (run $run)"
      if grep -qE "$REAL_FAILURE" <<<"$log"; then
        real=true; grep -E "$REAL_FAILURE|##\[error\]" <<<"$log" | awk '!seen[$0]++' | tail -12 | cut -c1-200
      else
        tail -12 <<<"$log" | cut -c1-200
        [[ " $runs " == *" $run "* ]] || runs="$runs $run"
      fi
    else
      real=true; echo "── $name: ${link:-no link}"
    fi
  done < <(jq -r '.[] | select(.bucket=="fail" or .bucket=="cancel") | [.name, (.link // "")] | @tsv' <<<"$C")
  if ! $real && [ -n "$runs" ]; then echo "rerunnable:$runs"; exit 2; fi
  exit 1
}

while :; do
  M=$(gh pr view "$PR" --json mergeable,mergeStateStatus -q '"\(.mergeable) \(.mergeStateStatus)"' 2>/dev/null)
  case " $M " in *" CONFLICTING "*|*" DIRTY "*) echo "conflicts with main — no checks will run ($(el))"; exit 20 ;; esac
  C=$(gh pr checks "$PR" --json bucket,name,link 2>/dev/null)
  BUCKETS=$(jq -r '[.[].bucket] | unique | join(",")' <<<"${C:-[]}" 2>/dev/null)
  case ",$BUCKETS," in
    *,fail,*|*,cancel,*) failed ;;
    ,,|*,pending,*) ;;
    *) echo "green: $BUCKETS ($(el))"; exit 0 ;;
  esac
  P=$(jq -r '[.[] | select(.bucket=="pending") | .name] | if length > 3 then (.[:3] | join(", ")) + " +\(length - 3)" else join(", ") end' <<<"${C:-[]}" 2>/dev/null)
  P=${P:-no checks registered yet}
  if [ "$P" != "$LAST" ] || [ $(( $(date +%s) - LAST_AT )) -ge 300 ]; then
    echo "waiting on $P ($(el))"; LAST=$P LAST_AT=$(date +%s)
  fi
  [ "$(date +%s)" -ge "$DEADLINE" ] && { echo "timed out: ${BUCKETS:-no checks registered}"; exit 30; }
  sleep "$INTERVAL"
done

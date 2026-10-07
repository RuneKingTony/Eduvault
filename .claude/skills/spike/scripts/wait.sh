#!/bin/bash
# Block until some in-flight ticket changes state (merged, halted, died, blocked on a prompt,
# waiting on the user), so the orchestrator re-walks the DAG the moment a slot frees. Run in the background.
# Every tick it also reaps, re-renders progress.md, retitles the run's tab and notifies (walk.sh --refresh),
# so the board stays live between wakes.
#
# A ship stage moving on (implement → simplify) is not a wake: at a handful of tickets that is a re-walk every
# minute or two for nothing to dispatch. Those moves are collected and printed with the next wake instead.
#
# usage: wait.sh <EPIC> [timeout_s=5400] [interval_s=60]
# exit:  0 a ticket changed state   30 nothing changed before the timeout
# prints one line per changed ticket, always led by its key, e.g.
#   EDU-356 merged https://github.com/…/pull/260
#   EDU-357 halted ship stopped at e2e: running with no live lock
#   EDU-330 waiting-user ship's pane w7:p1G idle for 25 min with a live lock
#   EDU-433 held the PR carries hold-merge
#   EDU-330 | <the question the pane is asking>       (waiting-user / blocked-ui only)
# then one line per in-flight ticket whose ship stage moved since the walk, e.g.
#   EDU-358 review → running
# and reap.sh's lines for the panes it closed meanwhile
set -u
. "$(dirname "$0")/lib.sh"

need_herdr
EPIC=$(norm_epic "${1:-}") || exit 2
TIMEOUT=${2:-5400} INTERVAL=${3:-60}
D=$(epic_dir "$EPIC") deadline=$(( $(date +%s) + TIMEOUT ))
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# baseline = the walk's own observation, so a ticket that finished during dispatch still counts
cp "$D/observed.json" "$TMP/base.json" 2>/dev/null || bash "$SP/observe.sh" "$EPIC" > "$TMP/base.json"
since=$(mtime "$D/observed.json")
moved='{}'
stage_lines() { jq -r 'to_entries[] | "\(.key) \(.value)"' <<<"$moved"; cat "$TMP/reaped" 2>/dev/null; }
while [ "$(date +%s)" -lt "$deadline" ]; do
  sleep "$INTERVAL"
  # ship's cleanup lands minutes after the merge that freed the slot — reap its tab as soon as it does
  bash "$SP/reap.sh" "$EPIC" >> "$TMP/reaped"
  bash "$SP/observe.sh" "$EPIC" > "$TMP/obs.json" || continue
  SPIKE_OBS=$TMP/obs.json bash "$SP/walk.sh" "$EPIC" --refresh >/dev/null 2>&1
  moved=$(jq -c --slurpfile a "$TMP/base.json" --argjson m "$moved" '
    $m + ([to_entries[] | select(.value.state | IN("running", "waiting-user", "blocked-ui")) | select(.value.ship_stage)
           | select(($a[0][.key] | "\(.ship_stage) \(.ship_result)") != "\(.value.ship_stage) \(.value.ship_result)")
           | {(.key): "\(.value.ship_stage) → \(.value.ship_result)"}] | add // {})' "$TMP/obs.json")
  # none -> running is the dispatch this walk just made, and died/halted -> running a resume spike made
  # after the walk: neither is a state change worth a re-walk
  changed=$(jq -rn --slurpfile a "$TMP/base.json" --slurpfile b "$TMP/obs.json" --argjson since "$since" \
              --slurpfile s "$D/status.json" '
    ($a[0] | map_values(.state)) as $a | ($s[0].dispatched // {}) as $d
    | $b[0] | to_entries[] | select($a[.key] != .value.state)
    | select(($a[.key] // "none") != "none" or .value.state != "running")
    | select(.value.state != "running" or (($d[.key].epoch // 0) <= $since))
    | .key as $k | .value as $v
    | ({done: "merged", "merged-outside-ship": "merged-outside-ship"}[$v.state] // $v.state) as $s
    | "\($k) \($s) \(if ($s | test("merged")) then ($v.pr_url // "") else ($v.reason // $v.stage // "") end)"
      , (if ($v.state == "waiting-user" or $v.state == "blocked-ui") and ($v.question // $v.pane_tail)
         then ($v.question // ($v.pane_tail | split("\n") | last) | "\($k) | \(.)") else empty end)')
  [ -n "$changed" ] && { printf '%s\n' "$changed" | sed 's/ *$//'; stage_lines; exit 0; }
done
stage_lines
echo "no ticket changed state in ${TIMEOUT}s"; exit 30

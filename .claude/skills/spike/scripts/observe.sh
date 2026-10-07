#!/bin/bash
# What each ticket's /ship run is doing, from ship's own files — never from a tab's chat.
# Read-only on ship's state: it never calls `state.sh next` (that writes, and would race the live
# run). A claimed merge is confirmed with `gh pr view` before it counts as done.
#
# SPIKE_READONLY=1 (walk.sh --status/--dry-run) skips the one write: caching a confirmed merge.
#
# usage: observe.sh <EPIC> [graph=<epic dir>/graph.json]
#        → {KEY: {state, stage?, ship_stage?, ship_result?, since?, pr_url?, reason?, agent?, pane?,
#                 pane_tail?, question?, last_line?, halt_reason?}}
#   ship_stage/ship_result/since: the stage ship is in (lib.sh ship_stage) and since when (epoch)
#   question: blocked-ui / waiting-user — the line the pane is asking; last_line: halted / died — the last
#   thing the ticket pane's Claude said (ship's halt line); halt_reason: the failed handoff of that stage
#   state: none      nothing to wait on — never run, or a prior run left partial state with no
#                    live lock and spike didn't dispatch it (ship resumes it when dispatched)
#          running   live ship lock (heartbeat < 10 min), or dispatched < 15 min ago with no lock yet
#          blocked-ui  spike's tab is sitting on a permission prompt/question — a human's call
#          waiting-user  live ship lock, but the ticket pane's Claude is idle, its worker isn't
#                    working and ship hasn't written a file for WAIT_USER s (default 1200): ship is
#                    waiting on the user. Carries pane_tail (last 5 lines of the pane)
#          done      merge-gate pass AND gh says MERGED
#          merged-outside-ship  gh says MERGED but ship's merge-gate never passed (merged by hand)
#          halted    spike dispatched it, no live lock, ship released its lock, not merged — ship
#                    stopped; fix with /ship <KEY>
#          held      no live lock, PR not merged, and either ship's merge-gate recorded `held` (hold-merge label) or it
#                    recorded `pass` with the PR still open (merging is the human's step): a deliberate wait, not a
#                    halt — it freezes nothing and its dependents wait; merge the PR, then /ship <KEY> cleans up
#          died      spike dispatched it, not merged, and ship's lock went stale WITHOUT a release
#                    (the session was killed); resume with dispatch.sh <EPIC> <KEY> --resume
#          withdrawn withdraw.sh took it out of the run while its ship still holds a live lock
set -u
. "$(dirname "$0")/lib.sh"

EPIC=$(norm_epic "${1:-}") || exit 2
G=${2:-$(epic_dir "$EPIC")/graph.json}
[ -f "$G" ] || { echo "no graph at $G — run graph.sh $EPIC first" >&2; exit 1; }
now=$(date +%s) out='{}'
WAIT_USER=${WAIT_USER:-1200}
astatus() { [ -n "$1" ] && herdr agent get "$1" 2>/dev/null | jq -r '.result.agent.agent_status // empty'; }
# newest write ship made to its own dir; .lock only moves with the heartbeat, so it doesn't count
last_write() {
  local m=0 f t
  for f in "$1"/* "$1"/.[!.]*; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in .lock|.lock.*) continue ;; esac
    t=$(mtime "$f"); [ "$t" -gt "$m" ] && m=$t
  done
  echo "$m"
}

for k in $(jq -r '.nodes[] | select(.external | not) | .key' "$G"); do
  d=$OPSX/$k s=$d/status.json
  disp=$(es_get "$EPIC" ".dispatched[\"$k\"]" -c)
  agent=$(printf '%s' "${disp:-}" | jq -r '.agent // empty' 2>/dev/null)
  pane=$(printf '%s' "${disp:-}" | jq -r '.pane // empty' 2>/dev/null)
  withdrawn=$(printf '%s' "${disp:-}" | jq -r '.withdrawn_at // empty' 2>/dev/null)
  hb=$(jq -r '.heartbeat_epoch // 0' "$d/.lock" 2>/dev/null || echo 0)
  mg=$(jq -r '.stages["merge-gate"].result // empty' "$s" 2>/dev/null)
  pr=$(jq -r '.pr_url // empty' "$s" 2>/dev/null)
  ss=$(ship_stage "$k")
  stage=$(jq -r 'select(.stage and .stage != "done") | "\(.stage): \(if .result == "next" then "not started" else .result end)"' <<<"$ss")
  st=none reason="" tail="" q="" last="" hr=""

  if [ -n "$(es_get "$EPIC" ".merged_outside[\"$k\"]")" ]; then
    st=merged-outside-ship reason="merged outside ship: merge-gate never passed"
  elif [ -n "$(es_get "$EPIC" ".merged[\"$k\"]")" ]; then
    st=done   # a merge is irreversible, so a confirmed one is cached rather than re-asked every tick
  elif [ "$mg" = pass ] && [ -n "$pr" ]; then
    ps=$(gh pr view "$pr" --json state -q .state 2>/dev/null)
    if [ "$ps" = MERGED ]; then
      st=done
      [ "${SPIKE_READONLY:-}" = 1 ] || es_set "$EPIC" '.merged[$k] = $p' --arg k "$k" --arg p "$pr"
    elif [ $(( now - hb )) -lt $STALE ]; then st=running reason="ship is finishing after merge-gate"
    elif [ "$ps" = OPEN ]; then st=held reason="PR is green at merge-gate; waiting for your merge"
    else st=halted reason="merge-gate recorded pass but $pr is ${ps:-unreadable}"; fi
  elif [ -n "$pr" ] && [ $(( now - hb )) -ge $STALE ] &&
       [ "$(gh pr view "$pr" --json state -q .state 2>/dev/null)" = MERGED ]; then
    # only once ship is gone: a live ship mid merge-gate has merged the PR itself and not yet recorded pass
    st=merged-outside-ship reason="merged outside ship: merge-gate is ${mg:-not run}"
    [ "${SPIKE_READONLY:-}" = 1 ] ||
      es_set "$EPIC" '.merged[$k] = $p | .merged_outside[$k] = $p' --arg k "$k" --arg p "$pr"
  elif [ -n "$withdrawn" ]; then
    # withdraw.sh freed the slot; the ticket counts again only once its ship has stopped
    [ $(( now - hb )) -lt $STALE ] && st=withdrawn reason="withdrawn at $withdrawn; its ship still holds a live lock"
  elif [ $(( now - hb )) -lt $STALE ]; then
    st=running
    as=$(astatus "$agent")
    if [ "$as" = blocked ]; then
      st=blocked-ui reason="pane of $agent is waiting on a prompt"
      tail=$(pane_text "$agent" "$pane" blocked); q=$(question_of dialog <<<"$tail"); tail=$(tail -5 <<<"$tail")
    elif [ "$as" = idle ] || [ "$as" = done ]; then
      ws=$(astatus "$(jq -r '.worker.agent_name // empty' "$s" 2>/dev/null)")
      lw=$(last_write "$d")
      if [ "$ws" != working ] && [ "$ws" != blocked ] && [ $(( now - lw )) -gt "$WAIT_USER" ]; then
        tail=$(pane_text "$agent" "$pane" "$as")
        # parked in ship's slot.sh waiting for a free /ship slot is not a question for the user
        if ! tail -5 <<<"$tail" | grep -q 'run(s) ahead, cap'; then
          st=waiting-user reason="ship's pane $pane idle for $(( (now - lw) / 60 )) min with a live lock"
          q=$(question_of text <<<"$tail"); tail=$(tail -5 <<<"$tail")
        else tail=""; fi
      fi
    fi
  elif [ "$mg" = held ]; then
    st=held reason=$(jq -r '.stages["merge-gate"].reason // "hold-merge"' "$s" 2>/dev/null | sed 's/^held — //')
  elif [ -n "$disp" ]; then
    de=$(printf '%s' "$disp" | jq -r '.epoch // 0')
    as=$(astatus "$agent")
    if [ "$as" = blocked ]; then
      st=blocked-ui reason="pane of $agent is waiting on a prompt"
      tail=$(pane_text "$agent" "$pane" blocked); q=$(question_of dialog <<<"$tail"); tail=$(tail -5 <<<"$tail")
    elif [ $(( now - de )) -lt 900 ]; then st=running reason="starting"
    elif [ -f "$d/.lock" ]; then
      # ship releases (deletes) its lock when it halts; a stale lock still on disk means it was killed
      st=died reason="ship died at ${stage:-an unknown stage} (stale lock, never released)"
    else st=halted reason="ship stopped at ${stage:-an unknown stage} with no live lock"; fi
    case "$st" in halted|died)
      # ship writes its halt reason only to its chat; the stage's handoff may carry the failure
      cur=$(jq -r '.stage // empty' <<<"$ss")
      # only a failed handoff written in this attempt: an older one, or a pass report, is not why it stopped
      hr=""
      [ -f "$d/$cur.json" ] && [ "$(mtime "$d/$cur.json")" -ge "$(jq -r '.since // 0' <<<"$ss")" ] &&
        hr=$(jq -r '.failure_reason // (select((.verdict // .result // "") | ascii_downcase | test("fail|blocked")) | .reason)
                    // empty' "$d/$cur.json" 2>/dev/null | head -1)
      [ "$cur" = propose ] && hr=$(jq -r '.propose_reason // empty' "$s" 2>/dev/null)
      [ -n "$hr" ] && hr=$(jq -Rr '.[0:200]' <<<"$hr") && reason="$reason — $hr"
      [ -n "$as" ] && [ "$as" != gone ] && last=$(pane_text "$agent" "$pane" "$as" | question_of halt) ;;
    esac
  fi
  out=$(jq -c --arg k "$k" --arg st "$st" --arg r "$reason" --arg p "$pr" --arg sg "$stage" --arg a "$agent" \
        --arg pn "$pane" --arg tl "$tail" --arg q "$q" --arg l "$last" --arg h "$hr" --argjson ss "$ss" \
        '.[$k] = ({state: $st} + (if $r != "" then {reason: $r} else {} end)
                  + (if $p != "" then {pr_url: $p} else {} end) + (if $sg != "" then {stage: $sg} else {} end)
                  + (if $ss.stage and $st != "done" and $st != "merged-outside-ship"
                     then {ship_stage: $ss.stage, ship_result: $ss.result, since: $ss.since} else {} end)
                  + (if $a != "" then {agent: $a} else {} end) + (if $pn != "" then {pane: $pn} else {} end)
                  + (if $tl != "" then {pane_tail: $tl} else {} end) + (if $q != "" then {question: $q} else {} end)
                  + (if $l != "" then {last_line: $l} else {} end) + (if $h != "" then {halt_reason: $h} else {} end))' <<<"$out")
done
echo "$out"

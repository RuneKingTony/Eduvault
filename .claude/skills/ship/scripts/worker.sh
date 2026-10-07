#!/bin/bash
# The run's single worker pane. Each stage gets a FRESH Claude process in the same pane, started
# with --model/--effort: launch flags last only for that session, whereas typing /model or
# /effort saves the choice to ~/.claude/settings.json and rewrites the user's global defaults.
# A fresh process also replaces /clear and always ends a finished /goal.
#
# usage:
#   worker.sh dispatch <KEY> <stage> [prompt_file]    prompt defaults to prompt.sh's rendering;
#                                                     model/effort come from effort.sh
#       exit 0  dispatched; prints {"agent","pane","model","effort","attempts","stray_patch","replaced_pane"}
#            11 attempts exhausted (> 3)          12 worker busy (working/blocked) — never restart it
#            13 couldn't stop or start Claude     14 blocked right after start (prints the pane)
#            15 prompt didn't start a turn — read the pane; never re-send blind
#       A `running` record without a model (state.sh stage … running just before) is this attempt,
#       not a new one. A previous Claude that won't /exit in 90 s gets its pane closed and a fresh one.
#   worker.sh status <KEY>             → idle|working|blocked|done|unknown|gone
#   worker.sh read <KEY> [lines=40]    → last lines of the pane, plain text (visible screen when blocked)
#   worker.sh say <KEY> <text>         → type an answer into the worker
#   worker.sh nudge <KEY>              → tell an idle worker to finish in the foreground and write its handoff
#   worker.sh close <KEY>              → close the pane (cleanup only); already closed = success
#   (every subcommand but snapshot and tidy needs Herdr)
#   worker.sh snapshot <KEY> <stage>   → record the worktree (untracked included) in $D/tree.pass (verify.sh, on pass)
#   worker.sh tidy <KEY> <stage> <n>   → worktree changes since tree.pass → $D/stray-<stage>-attempt<n>.patch,
#                                        tree restored to tree.pass; prints the patch path, or nothing
set -u
. "$(dirname "$0")/lib.sh"

CMD=$1 KEY=$2 D=$(key_dir "$2")
case "$CMD" in snapshot|tidy) ;; *) require_herdr ;; esac
NAME=$(st_get "$KEY" '.worker.agent_name')
PANE=$(st_get "$KEY" '.worker.pane_id')
TREE=$(st_get "$KEY" '.worktree_path')
SENT_ESC="" SENT_ENTER=""
WORKER_ENV="NX_DAEMON=false NX_ISOLATE_PLUGINS=false EDU_ORCHESTRATED=1"

exited() {
  [ "$(agent_status "$NAME")" = gone ] && return 0
  pane_alive "$PANE" || return 0
  [ -z "$(herdr pane get "$PANE" 2>/dev/null | jq -r '.result.pane.agent // empty')" ] && return 0
  herdr pane process-info --pane "$PANE" 2>/dev/null |
    jq -e '[.result.process_info.foreground_processes[]? | select(.argv0 == "claude")] | length == 0' >/dev/null
}
# Answer a known /exit confirm, each key at most once and only on a text match: a blind
# `esc esc` opened the rewind menu. Returns 1 when no known dialog is showing.
exit_dialog() {
  local v; v=$(herdr pane read "$PANE" --source visible --lines 15 --format text 2>/dev/null)
  if [ -z "$SENT_ESC" ] && grep -q 'Esc to discard and exit' <<<"$v"; then
    herdr pane send-keys "$PANE" esc >/dev/null 2>&1; SENT_ESC=1
  elif [ -z "$SENT_ENTER" ] && grep -qE '❯ *1\. Exit and stop tasks' <<<"$v"; then
    herdr pane send-keys "$PANE" enter >/dev/null 2>&1; SENT_ENTER=1
  else return 1; fi
}
stop_claude() {   # exit the worker's Claude, leaving the pane at its shell prompt
  [ -z "$NAME" ] && return 0
  exited && return 0
  if ! exit_dialog; then
    case "$(agent_status "$NAME")" in working|blocked) return 12 ;; esac
    # agent prompt appends to unsent input, so clear the box first or /exit is submitted with it
    herdr pane send-keys "$PANE" ctrl+u >/dev/null 2>&1
    herdr agent prompt "$NAME" "/exit" >/dev/null 2>&1
  fi
  for _ in $(seq 1 45); do sleep 2; exited && return 0; exit_dialog; done
  return 13
}
stale_pane() {    # the pane exists with no agent running but a dead Claude's session still bound
  herdr pane get "$PANE" 2>/dev/null |
    jq -e '.result.pane and (.result.pane.agent // null) == null and (.result.pane.agent_session // null) != null' >/dev/null
}
own_pane() {      # the pane status.json records, in this run's worktree, and not the orchestrator's
  pane_alive "$PANE" && [ "$PANE" != "${HERDR_PANE_ID:-}" ] &&
    herdr pane get "$PANE" 2>/dev/null | jq -e --arg t "$TREE" \
      '.result.pane | ((.cwd // "") | startswith($t)) or ((.foreground_cwd // "") | startswith($t))' >/dev/null
}
snap() {          # → "<HEAD> <tree>" of the worktree, untracked files included; the real index is untouched
  local i; i=$(mktemp) || return 1
  cp "$(git -C "$TREE" rev-parse --path-format=absolute --git-path index)" "$i" 2>/dev/null
  GIT_INDEX_FILE=$i git -C "$TREE" add -A >/dev/null 2>&1 &&
    echo "$(git -C "$TREE" rev-parse HEAD) $(GIT_INDEX_FILE=$i git -C "$TREE" write-tree)"
  rm -f "$i"
}
tidy() {          # <stage> <n> — never discards: the patch is written and checked before the tree is touched
  local bh bt ch ct p=$D/stray-$1-attempt$2.patch
  read -r bh bt _ < "$D/tree.pass" 2>/dev/null && [ -n "$bt" ] || return 0
  read -r ch ct <<<"$(snap)"; [ -n "${ct:-}" ] && [ "$ct" != "$bt" ] || return 0
  [ "$ch" = "$bh" ] || { echo "HEAD moved since tree.pass — stray changes left in place" >&2; return 0; }
  git -C "$TREE" diff --binary "$bt" "$ct" > "$p" 2>/dev/null && [ -s "$p" ] ||
    { rm -f "$p"; echo "couldn't save stray changes — tree left as is" >&2; return 0; }
  git -C "$TREE" add -A && git -C "$TREE" read-tree --reset -u "$bt" && git -C "$TREE" reset -q ||
    { echo "restore to tree.pass failed — stray changes are in $p" >&2; }
  echo "$p"
}

case "$CMD" in
dispatch)
  STAGE=$3 PROMPT=${4:-$(bash "$W/prompt.sh" "$KEY" "$STAGE")}
  [ -s "$PROMPT" ] || { echo "empty prompt file $PROMPT" >&2; exit 2; }
  read -r MODEL EFFORT _ < <(bash "$W/effort.sh" "$KEY" "$STAGE") || exit 2
  N=$(st_get "$KEY" ".stages[\"$STAGE\"].attempts" | grep -E '^[0-9]+$' || echo 0)
  if [ "$(st_get "$KEY" ".stages[\"$STAGE\"].result")" = running ] && [ -z "$(st_get "$KEY" ".stages[\"$STAGE\"].model")" ] &&
     [ "$N" -gt 0 ]; then ATTEMPTS=$N; else ATTEMPTS=$(( N + 1 )); fi
  [ "$ATTEMPTS" -gt 3 ] && { echo "$STAGE failed to complete in 3 attempts"; exit 11; }
  [ -d "$TREE" ] || { echo "worktree $TREE missing" >&2; exit 13; }

  stop_claude; rc=$?
  [ $rc -eq 12 ] && { echo "worker $NAME is $(agent_status "$NAME") with nothing recorded — not touching it"; exit 12; }
  REPLACED=""
  if [ $rc -ne 0 ]; then
    own_pane || { echo "worker $NAME didn't exit after /exit" >&2; exit 13; }
    herdr pane close "$PANE" >/dev/null 2>&1; sleep 1
    pane_alive "$PANE" && { echo "worker $NAME didn't exit after /exit and pane $PANE wouldn't close" >&2; exit 13; }
    echo "worker $NAME didn't exit after /exit — closed its pane $PANE" >&2
    REPLACED=$PANE PANE=""
    st_set "$KEY" '.worker = {pane_id: null, agent_name: null}'
  fi

  STRAY=""
  [ "$ATTEMPTS" -ge 2 ] && case "$STAGE" in simplify|review) STRAY=$(tidy "$STAGE" $(( ATTEMPTS - 1 ))) ;; esac

  # a Claude that died rather than /exited leaves its session bound to the pane, and agent start
  # never launches there: replace such a pane of this run's with a fresh one
  if stale_pane && own_pane; then
    herdr pane close "$PANE" >/dev/null 2>&1; sleep 1
    echo "worker pane $PANE held a dead Claude's session — replaced it" >&2
    REPLACED=$PANE PANE=""
  fi
  split_worker() {
    # below the orchestrator, which keeps 65% of the height; the worker gets the bottom 35%
    PANE=$(herdr pane split --current --direction down --ratio 0.65 --cwd "$TREE" --no-focus | jq -r '.result.pane.pane_id')
    [ -n "$PANE" ] && [ "$PANE" != null ] || { echo "pane split failed" >&2; exit 13; }
    FRESH=true
  }
  FRESH=false
  pane_alive "$PANE" || split_worker
  # the pane's shell doesn't inherit this script's env. Nx's daemon and isolated plugin workers fail
  # inside the sandbox; EDU_ORCHESTRATED=1 makes gh-issues.sh refuse to close an issue.
  ENVLINE=" export $WORKER_ENV"
  herdr pane run "$PANE" "$ENVLINE" >/dev/null 2>&1 && sleep 1
  NEW=$(worker_agent_name "$KEY" "$STAGE" "$ATTEMPTS")
  start_worker() {
    for _ in 1 2 3; do       # the shell may need a moment after Claude exits
      herdr agent start "$NEW" --kind claude --pane "$PANE" --timeout 60000 \
        -- --permission-mode bypassPermissions --model "$MODEL" --effort "$EFFORT" >/dev/null 2>&1 && return 0
      sleep 5
    done
    return 1
  }
  started=false
  start_worker && started=true
  # a reused pane can still refuse a new Claude: replace it once with a fresh one
  if ! $started && ! $FRESH && own_pane; then
    herdr pane close "$PANE" >/dev/null 2>&1; sleep 1
    echo "herdr agent start failed in reused pane $PANE — replaced it" >&2
    REPLACED=$PANE; split_worker; NEW="$NEW-n"
    start_worker && started=true
  fi
  $started || { echo "herdr agent start failed in pane $PANE" >&2; exit 13; }
  st_set "$KEY" '.worker = {pane_id: $p, agent_name: $n, stage: $s, attempt: $a}' \
    --arg p "$PANE" --arg n "$NEW" --arg s "$STAGE" --argjson a "$ATTEMPTS"
  herdr pane rename "$PANE" "ship worker · $KEY · $STAGE ($MODEL/$EFFORT)" >/dev/null 2>&1

  # Only ever type the prompt into a ready session (ready.sh: idle, or done with the prompt showing).
  # A startup dialog (folder trust — measured: it does NOT show as blocked) would otherwise take the
  # prompt as its answer.
  bash "$W/ready.sh" "$NEW" 30 >/dev/null || { herdr pane read "$PANE" 2>/dev/null | tail -25; exit 14; }

  # recorded BEFORE the prompt: a death from here on resumes by reattaching, not restarting
  st_set "$KEY" ".stages[\"$STAGE\"] = {result: \"running\", started_at: \$t, started_epoch: \$e,
      model: \$m, effort: \$f, attempts: \$a}" \
    --arg t "$(now_iso)" --argjson e "$(date +%s)" --arg m "$MODEL" --arg f "$EFFORT" --argjson a "$ATTEMPTS"
  herdr agent prompt "$NEW" "$(cat "$PROMPT")" --wait --until working --timeout 60000 >/dev/null 2>&1 || exit 15
  jq -nc --arg a "$NEW" --arg p "$PANE" --arg m "$MODEL" --arg f "$EFFORT" --argjson n "$ATTEMPTS" \
    --arg sp "$STRAY" --arg rp "$REPLACED" \
    '{agent: $a, pane: $p, model: $m, effort: $f, attempts: $n,
      stray_patch: ($sp | select(. != "") // null), replaced_pane: ($rp | select(. != "") // null)}' ;;
status) [ -n "$NAME" ] && agent_status "$NAME" || echo gone ;;
read)
  n=${3:-40}
  out=$(herdr agent read "$NAME" --source recent --lines "$n" --format text 2>/dev/null) && ! grep -q agent_not_idle <<<"$out" ||
    out=$(herdr agent read "$NAME" --source visible --lines "$n" --format text 2>/dev/null) ||
    out=$(herdr pane read "$PANE" --source visible --lines "$n" --format text 2>/dev/null) || exit 1
  printf '%s\n' "$out" ;;
say)    herdr agent prompt "$NAME" "$3" --wait --until working --timeout 60000 >/dev/null ;;
nudge)
  herdr agent prompt "$NAME" "Your turn ended without this stage's JSON handoff. Finish the stage in the foreground: wait for any running command or task in the foreground (never run_in_background, &, ScheduleWakeup, Monitor or /loop), then write the handoff last." \
    --wait --until working --timeout 60000 >/dev/null ;;
snapshot)
  [ -d "$TREE" ] || exit 1
  s=$(snap) && [ -n "$s" ] || exit 1
  echo "$s $3 $(date +%s)" > "$D/tree.pass.tmp.$$" && mv "$D/tree.pass.tmp.$$" "$D/tree.pass" ;;
tidy) [ -d "$TREE" ] && tidy "$3" "$4" ;;
close)
  stop_claude >/dev/null 2>&1
  pane_alive "$PANE" && [ "$PANE" != "${HERDR_PANE_ID:-}" ] && herdr pane close "$PANE" >/dev/null 2>&1
  echo "worker closed" ;;
*) sed -n '2,26p' "$0"; exit 2 ;;
esac

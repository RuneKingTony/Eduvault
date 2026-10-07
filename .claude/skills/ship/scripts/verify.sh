#!/bin/bash
# Mechanical verification of a stage's handoff. Reads only small JSON handoffs (and tasks.md's
# checkboxes) — the markdown reports are for humans and never need to enter the orchestrator.
# Prints one JSON line; a handoff's non-empty `unrun_specs` is passed through for the orchestrator to run.
#
# usage: verify.sh <KEY> <stage>
# exit:  0 pass   1 the stage reported fail (halt with .reason)   2 missing, stale or malformed
#
# Handoff schema, per stage (every file must be written after the stage's started_epoch):
#   branch.json        {result, branch, worktree_path, failure_reason?}   + the worktree exists
#   propose            design.md + tasks.md (≥ 1 task) non-empty, status goal_line; exempt from
#                      freshness. status .propose_verdict "not-shippable" (+ .propose_reason) → 1
#   simplify.json      {result: pass|fail, summary, failure_reason?}
#   review.json        {result, blockers: <int>, summary, failure_reason?}     + review.md
#   security.json      {result, blockers: <int>, summary, files_reviewed: [..≥1], failure_reason?} + security.md
#                      review/security fail only on a failure_reason; blockers > 0 is a pass for fix-blockers
#   fix-blockers.json  {result, blockers_remaining: <int>, summary, failure_reason?}
#                      and review.json rewritten (fresh) by a re-run /code-review
#   e2e.json           {verdict: PASS|FAIL|BLOCKED, report: <path to report.md>, reason?}
#   push.json          {result, head, failure_reason?}
#   pr.json            {result, pr_url, failure_reason?}
#   merge-sync.json    {result, head, failure_reason?}      a pass records merge-sync pass itself (unless unrun_specs)
#   implement          tasks.md: every task checked (progress state — exempt from freshness);
#                      implement.json {unrun_specs} optional
# A worker stage's pass records the worktree in $D/tree.pass (worker.sh snapshot); a stage that ran the
# tests (implement, simplify, fix-blockers, merge-sync) also copies it to $D/tested.pass, which push reads.
# A result "fail" whose failure_reason is only unrunnable specs (Docker/testcontainers), with unrun_specs
# listed, passes with those unrun_specs.
set -u
. "$(dirname "$0")/lib.sh"

KEY=$1 STAGE=$2 D=$(key_dir "$1")
START=$(st_get "$KEY" ".stages[\"$STAGE\"].started_epoch"); START=${START:-0}

out()   { local x=${3:-}; [ -n "$x" ] || x='{}'
          [ "$1" = 0 ] && case "$STAGE" in
            implement|simplify|fix-blockers|merge-sync)
              bash "$W/worker.sh" snapshot "$KEY" "$STAGE" >/dev/null 2>&1 && cp "$D/tree.pass" "$D/tested.pass" ;;
            review|push|pr) bash "$W/worker.sh" snapshot "$KEY" "$STAGE" >/dev/null 2>&1 ;;
          esac
          [ "$1" = 0 ] && [ "$STAGE" = merge-sync ] && [ "$(unrun)" = '[]' ] &&
            bash "$W/state.sh" stage "$KEY" merge-sync pass >/dev/null
          jq -nc --arg s "$STAGE" --arg r "$2" --argjson x "$x" --argjson c "$1" --argjson u "$(unrun)" \
            '{stage: $s, ok: ($c == 0), reason: $r} + $x + (if ($u | length) > 0 then {unrun_specs: $u} else {} end)'; exit "$1"; }
fresh() { [ -f "$1" ] && [ "$(mtime "$1")" -ge "$START" ]; }
need()  { fresh "$D/$1" || out 2 "$1 missing or older than this attempt"
          jq -e . "$D/$1" >/dev/null 2>&1 || out 2 "$1 is not valid JSON"; }
field() { jq -r "$1 // empty" "$D/$2"; }
unrun() { local f=$D/$STAGE.json; fresh "$f" && jq -c '[(.unrun_specs // [])[] | strings]' "$f" 2>/dev/null || echo '[]'; }
# A stage fails only by saying so: result "fail", or a failure_reason. A missing result (a handoff
# written under the older schema, e.g. push.json as just {pr_url}) passes on its other fields.
own_fail() { local r; r=$(field .result "$1")
             { [ "$r" = pass ] || { [ -z "$r" ] && [ -z "$(field .failure_reason "$1")" ]; }; } && return
             unrun_only "$1" && return
             out 1 "$(field '.failure_reason // .summary' "$1")"; }
# A fail whose only reason is specs the sandbox can't run (Docker, testcontainers, localhost ports)
# is a pass: those specs reach the orchestrator as unrun_specs.
unrun_only() { local fr; fr=$(field .failure_reason "$1")
               [ "$(unrun)" != '[]' ] && grep -qiE 'docker|testcontainer|unrun|sandbox|globalsetup|localhost|supertest' <<<"$fr" &&
                 ! grep -qiE '[0-9]+ (tests?|specs?) fail|fail(ed|ing) (tests?|specs?|assertion)|assert|error TS|lint errors?|type errors?' <<<"$fr"; }

case "$STAGE" in
  branch)
    need branch.json; own_fail branch.json
    t=$(field .worktree_path branch.json); [ -n "$t" ] && [ -d "$t" ] || out 2 "worktree ${t:-?} missing"
    out 0 "$(field .branch branch.json) at $t" "$(jq -c '{branch, worktree_path}' "$D/branch.json")" ;;
  propose)
    [ "$(st_get "$KEY" '.propose_verdict')" = not-shippable ] && out 1 "not shippable: $(st_get "$KEY" '.propose_reason')"
    for f in design.md tasks.md; do [ -s "$D/$f" ] || out 2 "$f missing or empty"; done
    n=$(grep -cE '^\s*[-*] \[[ xX]\]' "$D/tasks.md"); [ "$n" -gt 0 ] || out 2 "tasks.md has no task checkboxes"
    [ -n "$(st_get "$KEY" '.goal_line')" ] || out 2 "status.json has no goal_line"
    out 0 "$n tasks" "{\"tasks\": $n}" ;;
  implement)
    [ -f "$D/tasks.md" ] || out 2 "tasks.md missing"
    open=$(grep -cE '^\s*[-*] \[ \]' "$D/tasks.md"); done=$(grep -ciE '^\s*[-*] \[x\]' "$D/tasks.md")
    [ "$open" -eq 0 ] && [ "$done" -gt 0 ] || out 2 "$open task(s) still unchecked" "{\"open\": $open}"
    out 0 "all $done tasks checked" ;;
  simplify) need simplify.json; own_fail simplify.json; out 0 "$(field .summary simplify.json)" ;;
  review|security)
    need "$STAGE.json"
    fr=$(field .failure_reason "$STAGE.json"); [ -n "$fr" ] && out 1 "$fr"
    b=$(field .blockers "$STAGE.json")
    [[ "$b" =~ ^[0-9]+$ ]] || { [ "$(field .result "$STAGE.json")" = fail ] && out 1 "$(field .summary "$STAGE.json")"
                                out 2 "$STAGE.json has no integer blockers"; }
    fresh "$D/$STAGE.md" || out 2 "$STAGE.md missing or stale"
    [ "$STAGE" = security ] && ! jq -e '(.files_reviewed | type) == "array" and (.files_reviewed | length) > 0' "$D/security.json" >/dev/null 2>&1 &&
      out 2 "security.json lists no files_reviewed"
    out 0 "$b blocker(s)" "{\"blockers\": $b}" ;;
  fix-blockers)
    need fix-blockers.json; own_fail fix-blockers.json; need review.json
    r=$(field .blockers_remaining fix-blockers.json); b=$(field .blockers review.json)
    [ "${r:-1}" = 0 ] && [ "${b:-1}" = 0 ] || out 1 "blockers remain (fix-blockers: ${r:-?}, review: ${b:-?})"
    out 0 "0 blockers" ;;
  e2e)
    need e2e.json
    v=$(field .verdict e2e.json) rep=$(field .report e2e.json)
    [ "$v" = PASS ] || out 1 "verdict ${v:-missing}: $(field .reason e2e.json) (report: $rep)"
    [ -f "$rep" ] && head -15 "$rep" | grep -q 'PASS' && ! head -15 "$rep" | grep -qE 'FAIL|BLOCKED' ||
      out 2 "report $rep missing, or its headline isn't a clean PASS"
    n=$(jq '[(.evidence // [])[] | select(.path as $p | $p | test("\\.png$"))] | length' "$D/e2e.json")
    out 0 "PASS" "{\"report\": \"$rep\", \"evidence\": $n}" ;;
  push)
    need push.json; own_fail push.json
    out 0 "pushed $(field .head push.json)" ;;
  pr)
    need pr.json; own_fail pr.json
    u=$(field .pr_url pr.json)
    [[ "$u" =~ ^https://github.com/.+/pull/[0-9]+$ ]] || out 2 "pr.json has no PR URL"
    out 0 "$u" "{\"pr_url\": \"$u\"}" ;;
  merge-sync) need merge-sync.json; own_fail merge-sync.json; out 0 "synced at $(field .head merge-sync.json)" ;;
  *) echo "usage: verify.sh <KEY> <stage>" >&2; exit 2 ;;
esac

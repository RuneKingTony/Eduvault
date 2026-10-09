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
#   simplify.json      {result: pass|fail, summary, failure_reason?, deferred?: [{item, reason}]}
#                      a deferral whose reason is "too large" sends simplify back once (exit 2 on attempt 1)
#   review.json        {result, blockers: <int>, majors?: <int>, unmet_criteria?: [..], summary, failure_reason?}
#                      + review.md opening `Result: <b> blockers, <m> majors, <n> minors.` with one `- **S1. title**`
#                      line per finding under ### Blockers / ### Major / ### Minor, counts matching the Result line
#                      and review.json + review-spec.md and review-standards.md (the code-review axes' sub-agents)
#   security.json      {result, blockers: <int>, summary, files_reviewed: [..≥1], failure_reason?} + security.md
#                      review/security fail only on a failure_reason; blockers > 0 is a pass for fix-blockers
#   fix-blockers.json  {result, blockers_remaining: <int>, summary, failure_reason?, deferred?: [{id, reason}]}
#                      and review.json rewritten (fresh) by a re-run /code-review: no blockers, no unmet
#                      criteria, and no more majors than fix-blockers.json defers with a reason
#   e2e.json           {verdict: PASS|FAIL|BLOCKED, report: <path to report.md>, reason?, partial?}
#                      a PASS report must quote preflight's `e2e:` line naming status.json .stack's three ports
#                      and mention every partial entry's path
#   push.json          {result, head, failure_reason?}
#   pr.json            {result, pr_url, failure_reason?}
#   merge-sync.json    {result, head, failure_reason?}      a pass records merge-sync pass itself (unless unrun_specs)
#   implement          tasks.md: every task checked (progress state — exempt from freshness);
#                      implement.json {unrun_specs} optional
# A worker stage's pass records the worktree in $D/tree.pass (worker.sh snapshot); a stage that ran the
# tests (implement, simplify, fix-blockers, merge-sync) also copies it to $D/tested.pass, which push reads.
# A result "fail" whose failure_reason is only unrunnable specs (Docker/testcontainers), with unrun_specs
# listed, passes with those unrun_specs. For implement, simplify, fix-blockers and merge-sync the output's
# unrun_specs also carries what the tree needs on top of the worker's list: api:test-integration when
# apps/api, libs/policy or libs/api-contract changed, pnpm drift when the schema or auth options did,
# until `state.sh ran` records them on this exact tree.
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
          [ "$1" = 0 ] && [ "$STAGE" = merge-sync ] && [ "$(unrun_out "$1")" = '[]' ] &&
            bash "$W/state.sh" stage "$KEY" merge-sync pass >/dev/null
          jq -nc --arg s "$STAGE" --arg r "$2" --argjson x "$x" --argjson c "$1" --argjson u "$(unrun_out "$1")" \
            '{stage: $s, ok: ($c == 0), reason: $r} + $x + (if ($u | length) > 0 then {unrun_specs: $u} else {} end)'; exit "$1"; }
fresh() { [ -f "$1" ] && [ "$(mtime "$1")" -ge "$START" ]; }
need()  { fresh "$D/$1" || out 2 "$1 missing or older than this attempt"
          jq -e . "$D/$1" >/dev/null 2>&1 || out 2 "$1 is not valid JSON"; }
field() { jq -r "$1 // empty" "$D/$2"; }
unrun() { local f=$D/$STAGE.json; fresh "$f" && jq -c '[(.unrun_specs // [])[] | strings]' "$f" 2>/dev/null || echo '[]'; }
required_specs() {  # specs this tree needs run, as a JSON array; only for the stages that ran the tests
  case "$STAGE" in implement|simplify|fix-blockers|merge-sync) ;; *) echo '[]'; return ;; esac
  local tree base files cur="" specs=()
  tree=$(st_get "$KEY" '.worktree_path'); [ -d "$tree" ] || { echo '[]'; return; }
  base=$(git -C "$tree" merge-base HEAD origin/main 2>/dev/null) || { echo '[]'; return; }
  files=$( { git -C "$tree" diff --name-only "$base"; git -C "$tree" ls-files -o --exclude-standard; } | sort -u)
  read -r _ cur _ < "$D/tree.pass" 2>/dev/null
  grep -qE '^(apps/api/|libs/policy/|libs/api-contract/)' <<<"$files" && specs+=("api:test-integration")
  grep -qE '^apps/api/(db/|src/app/common/auth/|src/.*auth[^/]*\.ts$)' <<<"$files" && specs+=("pnpm drift")
  printf '%s\n' "${specs[@]+"${specs[@]}"}" | jq -R 'select(. != "")' |
    jq -sc --arg t "$cur" --slurpfile r <(cat "$D/ran.json" 2>/dev/null || echo '{}') '[.[] | select(($r[0][.] // "") != $t)]'
}
unrun_out() {  # <exit>: the worker's unrun_specs, plus the required ones it didn't list in any wording
  [ "$1" = 0 ] || { unrun; return; }
  jq -nc --argjson w "$(unrun)" --argjson r "$(required_specs)" \
    '$w + [$r[] | . as $s | (if ($s | test("drift")) then "drift" else "integration" end) as $k | select(($w | any(.[]; test($k; "i"))) | not)]'
}
review_check() {  # review.md's Result line against its findings and review.json: the extras as JSON, or the problem
  python3 - "$D/review.md" "$D/review.json" <<'PY'
import json, re, sys
md, js = open(sys.argv[1]).read().splitlines(), json.load(open(sys.argv[2]))
head = next(([int(x) for x in m.groups()] for m in (re.search(r"(\d+)\s+blockers?,\s*(\d+)\s+majors?,\s*(\d+)\s+minors?", l, re.I) for l in md[:40]) if m), None)
if head is None: print("review.md must open with 'Result: <b> blockers, <m> majors, <n> minors.'"); sys.exit(1)
sev, body = None, [0, 0, 0]
for l in md:
    h = re.match(r"^#{2,6}\s*(blocker|major|minor)", l, re.I)
    if h: sev = ["blocker", "major", "minor"].index(h.group(1).lower()); continue
    if re.match(r"^#{1,6}\s", l): sev = None
    elif sev is not None and re.match(r"^(?:[-*]\s+)?\*\*[A-Za-z]{1,3}\d+[.:)\s]", l): body[sev] += 1
if sum(head) and not sum(body): print("review.md lists no findings with IDs ('- **S1. title**') under ### Blockers, ### Major, ### Minor"); sys.exit(1)
if head != body: print("review.md says %d blockers, %d majors, %d minors but lists %d, %d, %d" % (*head, *body)); sys.exit(1)
for k, i in (("blockers", 0), ("majors", 1)):
    if isinstance(js.get(k), int) and js[k] != head[i]: print("review.json says %d %s, review.md says %d" % (js[k], k, head[i])); sys.exit(1)
print(json.dumps({"majors": head[1], "unmet_criteria": [u for u in js.get("unmet_criteria") or [] if isinstance(u, str)]}))
PY
}
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
  simplify)
    need simplify.json; own_fail simplify.json
    big=$(jq -c '[(.deferred // [])[] | select(type == "object" and ((.reason // "") | test("too (large|big)|(larger|bigger|large|big) refactor|separate (ticket|issue|pr|change)|out of scope"; "i")))]' "$D/simplify.json")
    att=$(st_get "$KEY" '.stages.simplify.attempts'); att=${att:-1}
    [ "$big" != '[]' ] && [ "$att" -lt 2 ] &&
      out 2 "simplify deferred work as too large: send it back once with worker.sh dispatch $KEY simplify --note \"<the deferred items>\"" "{\"deferred\": $big}"
    out 0 "$(field .summary simplify.json)" "$(jq -c '(.deferred // []) as $d | select($d | length > 0) | {deferred: $d}' "$D/simplify.json")" ;;
  review|security)
    need "$STAGE.json"
    fr=$(field .failure_reason "$STAGE.json"); [ -n "$fr" ] && out 1 "$fr"
    b=$(field .blockers "$STAGE.json")
    [[ "$b" =~ ^[0-9]+$ ]] || { [ "$(field .result "$STAGE.json")" = fail ] && out 1 "$(field .summary "$STAGE.json")"
                                out 2 "$STAGE.json has no integer blockers"; }
    fresh "$D/$STAGE.md" || out 2 "$STAGE.md missing or stale"
    [ "$STAGE" = security ] && ! jq -e '(.files_reviewed | type) == "array" and (.files_reviewed | length) > 0' "$D/security.json" >/dev/null 2>&1 &&
      out 2 "security.json lists no files_reviewed"
    if [ "$STAGE" = review ]; then
      for f in review-spec.md review-standards.md; do
        fresh "$D/$f" && [ -s "$D/$f" ] ||
          out 2 "$f missing, stale or empty: run the code-review skill's two axes as sub-agents, each writing its findings"
      done
      ex=$(review_check) || out 2 "$ex"
      out 0 "$b blocker(s)" "$(jq -c --argjson b "$b" '. + {blockers: $b}' <<<"$ex")"
    fi
    out 0 "$b blocker(s)" "{\"blockers\": $b}" ;;
  fix-blockers)
    need fix-blockers.json; own_fail fix-blockers.json; need review.json
    r=$(field .blockers_remaining fix-blockers.json); b=$(field .blockers review.json)
    [ "${r:-1}" = 0 ] && [ "${b:-1}" = 0 ] || out 1 "blockers remain (fix-blockers: ${r:-?}, review: ${b:-?})"
    u=$(jq '[(.unmet_criteria // [])[] | strings] | length' "$D/review.json")
    [ "$u" -eq 0 ] || out 1 "$u acceptance criteria are still unmet in review.json"
    m=$(field .majors review.json)
    dfr=$(jq -c '[(.deferred // [])[] | select(type == "object" and ((.reason // "") != ""))]' "$D/fix-blockers.json")
    [ "${m:-0}" -le "$(jq length <<<"$dfr")" ] || out 1 "${m} major(s) remain and fix-blockers.json defers only $(jq length <<<"$dfr") with a reason"
    out 0 "0 blockers" "$(jq -c '{deferred: .} | select(.deferred | length > 0)' <<<"$dfr")" ;;
  e2e)
    need e2e.json
    v=$(field .verdict e2e.json) rep=$(field .report e2e.json)
    [ "$v" = PASS ] || out 1 "verdict ${v:-missing}: $(field .reason e2e.json) (report: $rep)"
    [ -f "$rep" ] && head -15 "$rep" | grep -q 'PASS' && ! head -15 "$rep" | grep -qE 'FAIL|BLOCKED' ||
      out 2 "report $rep missing, or its headline isn't a clean PASS"
    api=$(st_get "$KEY" '.stack.api_port'); adm=$(st_get "$KEY" '.stack.admin_port'); por=$(st_get "$KEY" '.stack.portal_port')
    if [ -n "$api" ] && [ -n "$adm" ] && [ -n "$por" ]; then
      for want in "api=http://localhost:$api " "admin=http://localhost:$adm " "portal=http://localhost:$por "; do
        grep -qF -- "$want" "$rep" || out 2 "report $rep does not quote the preflight line naming '${want% }': the run may have used another stack"
      done
    fi
    while IFS= read -r pp; do
      [ -z "$pp" ] || grep -qF -- "$pp" "$rep" || out 2 "report $rep omits the partial entry: $pp"
    done < <(jq -r '(.partial // [])[].path' "$D/e2e.json")
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

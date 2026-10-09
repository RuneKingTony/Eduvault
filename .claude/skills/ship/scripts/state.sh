#!/bin/bash
# status.json in one place: atomic reads/writes, PR reconcile, the resume pointer, the open-PR guard
# and worktree adoption. Every subcommand prints at most one JSON line.
#
# usage:
#   state.sh next <KEY>      reconcile the PR and print {next, run, result, incomplete, stale, halt, pr_state, awaiting_merge,
#                            issue_pending, parent_spike, ticket_refetched, deps_unmet, descopes_accepted};
#                            `run` = the stages to start now: branch also carries propose only while propose
#                            isn't done, and review carries security while the fired gate's security isn't;
#                            before the plan (next = branch|propose) it refetches a ticket.json older than
#                            SHIP_TICKET_MAX_AGE s (default 300) and re-checks `deps`
#   state.sh stage <KEY> <stage> running|pass|skipped|fail [extra-json]
#                            running: records started_at/started_epoch/run_id, attempts+1 (exit 11 if > 3);
#                            already running under this run's live lock = same attempt, no bump; a stage that
#                            had finished (pass|fail) marks its dependents `stale` first (stale-after)
#                            pass/skipped/fail: records result + at, keeping started_* and attempts; pass also
#                            drops this stage's `note`
#   state.sh stale-after <KEY> <stage>   mark every finished dependent of <stage> `stale` (attempts reset to 0):
#                            implement -> security-gate simplify review security fix-blockers e2e;
#                            simplify -> review security fix-blockers e2e; review|security -> fix-blockers;
#                            fix-blockers -> review e2e. A `skipped` security or e2e only resets when the
#                            upstream is implement. Prints {stale: [...]}
#   state.sh halt <KEY> <stage> "<reason>"   record the halt: the stage `fail` with its reason, and
#                            status.json .halt = {stage, reason, at}; never leave a halted stage `running`
#   state.sh note <KEY> <stage> "<text>"     extra instructions for the stage's next dispatch (prompt.sh
#                            appends them; a pass removes them)
#   state.sh ran <KEY> <spec>...             record that the orchestrator ran these specs on the tree in
#                            tree.pass (verify.sh stops requiring them until the tree changes)
#   state.sh set <KEY> <jq filter> [jq args]   atomic update
#   state.sh get <KEY> <jq filter>             raw value, empty when unset
#   state.sh guard <KEY>     open PRs for the key on a branch other than this run's: prints them, exit 1;
#                            exit 2 when gh couldn't list PRs
#   state.sh fetch-main <KEY> <run_id>         git fetch origin main under the git-ops mutex
#   state.sh adopt <KEY>     an existing worktree whose branch matches the key -> {worktree_path, branch}; none: exit 1
#   state.sh fetch-ticket <KEY>  gh-issues.sh get-issue -> $D/ticket.json, records fetch pass; exit 1 gh failed, 2 bad key
#   state.sh deps <KEY>      soft_deps (text) and inward blocks links, each through dep-status ->
#                            {deps: [{key, kind, status, merged_pr, satisfied}], unmet}; exit 1 any unmet, 2 no ticket.json
#   state.sh dep-status <DEP>   satisfied = the issue is closed, or its PR merged -> {key, status, done, merged_pr}
#   state.sh accept-descope <KEY> "<item>"   record a descope the engineer accepted
#   state.sh followup <KEY> "<item>"         open a follow-up issue for a real gap (gh-issues.sh create-issue) and
#                            record the descope as accepted with its issue number; exit 1 when the issue wasn't created
#   state.sh descopes <KEY>  design.md's ## Descoped bullets -> {descoped: [{item, accepted, via?}], unaccepted, gaps};
#                            an item that restates the ticket's own exclusion text counts as accepted (via "ticket");
#                            `gaps` = the unaccepted ones; exit 1 when any isn't accepted
#   state.sh skip-e2e <KEY> "<reason>"   record e2e skipped; refused (exit 1) once e2e passed
#   state.sh goal <KEY>      the goal_line /propose pins, read from the propose skill
set -u
. "$(dirname "$0")/lib.sh"

CMD=${1:-} KEY=${2:-}
[ -n "$KEY" ] || { sed -n '2,46p' "$0"; exit 2; }
D=$(key_dir "$KEY")

goal_expected() {
  local g; g=$(sed -n 's/^ *"goal_line": "\(.*\)",\{0,1\}$/\1/p' "$PROPOSE_SKILL" 2>/dev/null | head -1)
  printf '%s' "${g//<D>/$D}"
}

dep_status() {  # <DEP> -> one JSON line; rc 0 when satisfied
  local k=$1 st="" pr="" done=false
  st=$(bash "$GHI" get-issue "$(issue_num "$k")" 2>/dev/null | jq -r '.state // empty' 2>/dev/null)
  [ "$st" = closed ] && done=true
  if ! $done; then
    [ "$(jq -r '.merged // empty' "$(key_dir "$k")/status.json" 2>/dev/null)" = true ] &&
      pr=$(jq -r '.pr_url // "merged"' "$(key_dir "$k")/status.json")
    [ -n "$pr" ] || pr=$(gh pr list --state merged --search "$k" --json url,title,headRefName --limit 20 2>/dev/null |
      jq -r --arg re "$(key_re "$k")" '[.[] | select((.title | test($re; "i")) or (.headRefName | test($re; "i")))][0].url // empty' 2>/dev/null)
  fi
  jq -nc --arg k "$k" --arg s "$st" --argjson d "$done" --arg p "$pr" \
    '{key: $k, status: ($s | select(. != "") // null), done: $d, merged_pr: ($p | select(. != "") // null)}'
  $done || [ -n "$pr" ]
}

dependents() {  # <stage> -> the stages that rest on its output
  case "$1" in
    implement) echo security-gate simplify review security fix-blockers e2e ;;
    simplify) echo review security fix-blockers e2e ;;
    review|security) echo fix-blockers ;;
    fix-blockers) echo review e2e ;;
  esac
}
stale_after() {  # <stage> -> {stale: [...]}; only stages that already have a result move
  local s=$1 d r out=()
  for d in $(dependents "$s"); do
    r=$(st_get "$KEY" ".stages[\"$d\"].result")
    [ -n "$r" ] && [ "$r" != stale ] || continue
    [ "$r" = skipped ] && [ "$s" != implement ] && case "$d" in security|e2e) continue ;; esac
    st_set "$KEY" ".stages[\"$d\"] = ((.stages[\"$d\"] // {}) + {result: \"stale\", stale_by: \$s, stale_at: \$t, attempts: 0})" \
      --arg s "$s" --arg t "$(now_iso)"
    out+=("$d")
  done
  jq -nc --argjson o "$(printf '%s\n' "${out[@]+"${out[@]}"}" | jq -R . | jq -sc 'map(select(. != ""))')" '{stale: $o}'
}

case "$CMD" in
get) st_get "$KEY" "$3" ;;
goal) goal_expected ;;
fetch-main)
  bash "$W/mutex.sh" acquire git-ops "$KEY" "$3" 900 5 || exit 30
  git -C "$ROOT" fetch -q origin main; rc=$?
  bash "$W/mutex.sh" release git-ops "$KEY" "$3"
  [ $rc -eq 0 ] && echo "origin/main at $(git -C "$ROOT" rev-parse --short origin/main)" || { echo "git fetch origin main failed"; exit 1; } ;;
set) shift 2; st_set "$KEY" "$@" ;;

stage)
  S=$3 R=$4 X=${5:-}; [ -n "$X" ] || X='{}'
  if [ "$R" = running ]; then
    read -r n same < <(stage_next_attempt "$KEY" "$S")
    if [ "$same" = true ]; then
      st_set "$KEY" ".stages[\"$S\"] += \$x" --argjson x "$X"
      echo "{\"attempts\": $n, \"same_run\": true}"; exit 0
    fi
    case "$S" in merge-gate|cleanup) ;; *) [ "$n" -gt 3 ] && { echo "$S failed to complete in 3 attempts"; exit 11; } ;; esac
    case "$(st_get "$KEY" ".stages[\"$S\"].result")" in pass|fail) stale_after "$S" >/dev/null ;; esac
    st_set "$KEY" ".stages[\"$S\"] = ({result: \"running\", started_at: \$t, started_epoch: \$e, attempts: \$n}
        + (if \$r == \"\" then {} else {run_id: \$r} end) + \$x)
        | if (.halt.stage // \"\") == \$s then del(.halt) else . end" \
      --arg t "$(now_iso)" --argjson e "$(date +%s)" --argjson n "$n" --argjson x "$X" --arg r "$(lock_run "$KEY")" --arg s "$S"
    echo "{\"attempts\": $n}"
  else
    st_set "$KEY" ".stages[\"$S\"] = ((.stages[\"$S\"] // {}) + {result: \$r, at: \$t} + \$x)
        | if \$r == \"pass\" and (.halt.stage // \"\") == \$s then del(.halt) else . end" \
      --arg r "$R" --arg t "$(now_iso)" --argjson x "$X" --arg s "$S"
    if [ "$R" = pass ]; then rm -f "$D/note.$S.txt"; fi
  fi ;;
stale-after) [ -n "${3:-}" ] || { sed -n '2,46p' "$0"; exit 2; }; stale_after "$3" ;;
halt)
  S=${3:-} WHY=${4:-}; [ -n "$S" ] && [ -n "$WHY" ] || { echo 'usage: state.sh halt <KEY> <stage> "<reason>"'; exit 2; }
  st_set "$KEY" ".stages[\"$S\"] = ((.stages[\"$S\"] // {}) + {result: \"fail\", at: \$t, reason: \$r})
      | .halt = {stage: \$s, reason: \$r, at: \$t}" --arg s "$S" --arg r "$WHY" --arg t "$(now_iso)"
  jq -nc --arg s "$S" --arg r "$WHY" '{halted: $s, reason: $r}' ;;
note)
  S=${3:-} T=${4:-}; [ -n "$S" ] && [ -n "$T" ] || { echo 'usage: state.sh note <KEY> <stage> "<text>"'; exit 2; }
  mkdir -p "$D"; printf '%s\n' "$T" > "$D/note.$S.txt"; echo "{\"note\": \"$S\"}" ;;
ran)
  shift 2; [ $# -gt 0 ] || { echo 'usage: state.sh ran <KEY> <spec>...'; exit 2; }
  read -r _ TREE _ < "$D/tree.pass" 2>/dev/null
  [ -n "${TREE:-}" ] || { echo "no tree.pass for $KEY: nothing to tie the run to"; exit 1; }
  OLD=$(cat "$D/ran.json" 2>/dev/null); jq -e 'type == "object"' >/dev/null 2>&1 <<<"$OLD" || OLD='{}'
  printf '%s\n' "$@" | jq -R . | jq -sc --argjson o "$OLD" --arg t "$TREE" 'reduce .[] as $s ($o; .[$s] = $t)' > "$D/ran.json.tmp.$$" &&
    mv "$D/ran.json.tmp.$$" "$D/ran.json"
  jq -c . "$D/ran.json" ;;

guard)
  own=$(st_get "$KEY" '.branch')
  all=$(gh pr list --state open --json number,url,headRefName,title,author --limit 100 2>/dev/null) ||
    { echo "gh pr list failed: can't check for open PRs on $KEY"; exit 2; }
  hits=$(printf '%s' "$all" |
    jq -c --arg re "$(key_re "$KEY")" --arg own "$own" \
      '[.[] | select((.headRefName | test($re; "i")) or (.title | test($re; "i"))) | select(.headRefName != $own)
        | {url, branch: .headRefName, author: .author.login}]')
  [ "${hits:-[]}" = "[]" ] && exit 0
  echo "$hits"; exit 1 ;;

adopt)
  git -C "$ROOT" worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{sub("refs/heads/","",$2); print w" "$2}' |
    while read -r w b; do
      echo "$b" | grep -qiE "$(key_re "$KEY")" && { jq -nc --arg w "$w" --arg b "$b" '{worktree_path: $w, branch: $b}'; exit 0; }
    done | head -1 | grep . || exit 1 ;;

next)
  st_set "$KEY" '.'
  G=$(goal_expected)
  [ -n "$G" ] && st_set "$KEY" 'if (.goal_line // "") != "" then .goal_line = $g else . end' --arg g "$G"

  HALT="" PRS=""
  br=$(st_get "$KEY" '.branch'); pr=$(st_get "$KEY" '.pr_url')
  if [ -z "$pr" ] && [ -n "$br" ]; then
    pr=$(gh pr list --head "$br" --state all --json url -q '.[0].url' 2>/dev/null)
    [ -n "$pr" ] && st_set "$KEY" '.pr_url = $u' --arg u "$pr"
  fi
  if [ -n "$pr" ]; then
    PRS=$(gh pr view "$pr" --json state -q .state 2>/dev/null)
    case "$PRS" in
      MERGED)
        st_set "$KEY" '.merged = true | .stages["pr"] = ((.stages["pr"] // {}) + {result: "pass"})'
        [ "$(st_get "$KEY" '.stages["merge-gate"].result')" = pass ] ||
          st_set "$KEY" '.stages["merge-gate"] = {result: "pass", via: "merged-externally", at: $t}' --arg t "$(now_iso)" ;;
      CLOSED) HALT="PR $pr was closed unmerged; worktree left in place" ;;
    esac
  fi

  NEXT=done RES="" INC=()
  for s in "${STAGES[@]}"; do
    r=$(st_get "$KEY" ".stages[\"$s\"].result")
    case "$r" in pass|skipped) ;; *) INC+=("$s"); [ "$NEXT" = done ] && { NEXT=$s; RES=$r; } ;; esac
  done
  if [ "$(st_get "$KEY" '.stages["merge-gate"].result')" = pass ]; then
    if [ "$(st_get "$KEY" '.stages.cleanup.result')" = pass ]; then NEXT=done RES=""
    else NEXT=cleanup RES=$(st_get "$KEY" '.stages.cleanup.result'); fi
  fi
  AWAIT=false
  [ "$NEXT" = cleanup ] && [ "$PRS" != MERGED ] && AWAIT=true

  finished() { case "$(st_get "$KEY" ".stages[\"$1\"].result")" in pass|skipped) return 0 ;; *) return 1 ;; esac; }
  RUN=("$NEXT")
  [ "$NEXT" = branch ] && ! finished propose && RUN+=(propose)
  [ "$NEXT" = review ] && ! finished security && [ "$(st_get "$KEY" '.stages["security-gate"].fires')" = true ] && RUN+=(security)
  STALE=()
  for s in "${STAGES[@]}"; do [ "$(st_get "$KEY" ".stages[\"$s\"].result")" = stale ] && STALE+=("$s"); done

  REF=null UNMET='[]'
  if [[ "$KEY" =~ ^EDU-[0-9]+$ ]] && { [ "$NEXT" = branch ] || [ "$NEXT" = propose ]; } && [ -f "$D/ticket.json" ]; then
    fa=$(jq -r '(.fetched_at // "") as $f | if $f == "" then 0 else ($f | fromdateiso8601? // 0) end' "$D/ticket.json" 2>/dev/null)
    if [ $(( $(date +%s) - ${fa:-0} )) -gt "${SHIP_TICKET_MAX_AGE:-300}" ]; then
      bash "$0" fetch-ticket "$KEY" >/dev/null 2>&1 && REF=true || REF=false
    else REF=false; fi
    UNMET=$(bash "$0" deps "$KEY" 2>/dev/null | jq -c '.unmet // []' 2>/dev/null); [ -n "$UNMET" ] || UNMET='[]'
  fi

  J=()
  [ "$(st_get "$KEY" '.stages.fetch.result')" = pass ] && [ -z "$(st_get "$KEY" '.issue.in_progress')" ] && J+=(assign+in_progress)
  [ "$(st_get "$KEY" '.stages.pr.result')" = pass ] && [ -z "$(st_get "$KEY" '.issue.in_review')" ] && J+=(in_review)
  jq -nc --arg n "$NEXT" --arg r "$RES" --arg h "$HALT" --arg p "$PRS" --argjson aw "$AWAIT" --argjson ps "$(parent_spike "$KEY")" \
    --argjson run "$(printf '%s\n' "${RUN[@]}" | jq -R . | jq -sc 'map(select(. != ""))')" \
    --argjson st "$(printf '%s\n' "${STALE[@]+"${STALE[@]}"}" | jq -R . | jq -sc 'map(select(. != ""))')" \
    --argjson i "$(printf '%s\n' "${INC[@]+"${INC[@]}"}" | jq -R . | jq -sc 'map(select(. != ""))')" \
    --argjson j "$(printf '%s\n' "${J[@]+"${J[@]}"}" | jq -R . | jq -sc 'map(select(. != ""))')" \
    --argjson rf "$REF" --argjson u "$UNMET" --argjson da "$(st_get "$KEY" '[.descopes_accepted[]?.item]' -c)" \
    '{next: $n, run: $run, result: ($r | select(. != "") // null), incomplete: $i, stale: $st, halt: ($h | select(. != "") // null),
      pr_state: ($p | select(. != "") // null), awaiting_merge: $aw, issue_pending: $j, parent_spike: $ps,
      ticket_refetched: $rf, deps_unmet: $u, descopes_accepted: $da}' ;;
dep-status) shift; dep_status "$@" ;;
deps)
  [ -f "$D/ticket.json" ] || { echo "no ticket.json for $KEY: state.sh fetch-ticket $KEY first"; exit 2; }
  ALL='[]'
  while read -r k kind; do
    [ -n "$k" ] || continue
    x=$(dep_status "$k") && ok=true || ok=false
    ALL=$(jq -c --argjson x "$x" --arg kind "$kind" --argjson ok "$ok" '. + [$x + {kind: $kind, satisfied: $ok} | del(.done)]' <<<"$ALL")
  done < <(jq -r '[(.soft_deps[]? | "\(.) text"), (.links[]? | select((.type | test("^block"; "i")) and .direction == "inward") | "\(.key) link")]
                  | unique_by(split(" ")[0]) | .[]' "$D/ticket.json")
  jq -c '{deps: ., unmet: [.[] | select(.satisfied | not) | .key]}' <<<"$ALL"
  [ "$(jq '[.[] | select(.satisfied | not)] | length' <<<"$ALL")" -eq 0 ] ;;
accept-descope)
  I=${3:-}; [ -n "$I" ] || { echo 'usage: state.sh accept-descope <KEY> "<item>"'; exit 2; }
  st_set "$KEY" '.descopes_accepted = ((.descopes_accepted // []) + [{item: $i, at: $t}] | unique_by(.item))' --arg i "$I" --arg t "$(now_iso)"
  jq -c '{descopes_accepted: (.descopes_accepted | length)}' "$D/status.json" ;;
descopes)
  python3 - "$D/design.md" "$(st_get "$KEY" '[.descopes_accepted[]?.item]' -c)" "$D/ticket.json" <<'PY'
import json, re, sys
path, acc = sys.argv[1], json.loads(sys.argv[2] or "[]")
norm = lambda s: " ".join(re.sub(r"[^a-z0-9]+", " ", s.lower()).split())
try: ticket = json.load(open(sys.argv[3]))
except (OSError, ValueError): ticket = {}
EXCL = re.compile(r"out of (this )?(slice|scope|issue)|deliberately out|not in (this|scope)|\bskipped\b|later slice|unblocking slice", re.I)
texts = [ticket.get("description") or ""] + [t for t in ticket.get("acceptance_criteria") or [] if isinstance(t, str)]
sents = [x for t in texts for x in re.split(r"(?<=[.!?])\s+|\n+", t)]
excl = [norm(x) for x in sents + [c for x in sents for c in re.split(r"[,;]|\band\b", x)] if EXCL.search(x)]
def stems(n): return {w[:5] for w in n.split() if len(w) >= 5}
def restated(item):
    ws = stems(norm(item))
    for e in excl:
        es = stems(e)
        if len(es) >= 3 and len(es & ws) / len(es) >= 0.6: return True
    return False
def accepted(item):
    n = norm(item)
    for a in map(norm, acc):
        words = [w for w in a.split() if len(w) >= 4]
        if len(a) >= 6 and (a in n or n in a): return True
        if words and all(re.search(r"\b" + re.escape(w), n) for w in words): return True
    return False
items, on = [], False
try: lines = open(path).read().splitlines()
except OSError: lines = []
for line in lines:
    if re.match(r"^#{1,6}\s", line):
        on = bool(re.match(r"^#{1,6}\s*descoped\b", line, re.I)); continue
    m = on and re.match(r"^\s*[-*]\s+(.*\S)", line)
    if m and not re.fullmatch(r"\**none\.?\**", m.group(1).strip(), re.I):
        items.append(m.group(1)[:200])
out = []
for i in items:
    if accepted(i): out.append({"item": i, "accepted": True})
    elif restated(i): out.append({"item": i, "accepted": True, "via": "ticket"})
    else: out.append({"item": i, "accepted": False})
gaps = [o["item"] for o in out if not o["accepted"]]
bad = len(gaps)
print(json.dumps({"descoped": out, "unaccepted": bad, "gaps": gaps}, ensure_ascii=False, separators=(",", ":")))
sys.exit(1 if bad else 0)
PY
  ;;
followup)
  I=${3:-}; [ -n "$I" ] || { echo 'usage: state.sh followup <KEY> "<item>"'; exit 2; }
  BF=$(mktemp); trap 'rm -f "$BF"' EXIT
  printf 'Descoped from %s (#%s) because it falls outside that issue:\n\n%s\n\nScope it before work starts. Opened by /ship so the gap is not lost.\n' "$KEY" "$(issue_num "$KEY")" "$I" > "$BF"
  OUT=$(bash "$GHI" create-issue --title "Follow-up from $KEY: ${I:0:80}" --body-file "$BF" --yes 2>&1) &&
    jq -e '.ok or .dry_run' >/dev/null 2>&1 <<<"$OUT" || { echo "follow-up issue not created: $(tail -c 300 <<<"$OUT" | tr '\n' ' ')"; exit 1; }
  F=$(jq -r 'if .dry_run then "dry-run" else (.issue | tostring) end' <<<"$OUT")
  st_set "$KEY" '.descopes_accepted = ((.descopes_accepted // []) + [{item: $i, at: $t, followup: $f}] | unique_by(.item))' \
    --arg i "$I" --arg t "$(now_iso)" --arg f "$F"
  jq -nc --arg f "$F" '{followup: $f}' ;;
skip-e2e)
  R=${3:-}; [ -n "$R" ] || { echo 'usage: state.sh skip-e2e <KEY> "<reason>"'; exit 2; }
  [ "$(st_get "$KEY" '.stages.e2e.result')" = pass ] && { echo "e2e already passed for $KEY: nothing to skip"; exit 1; }
  bash "$0" stage "$KEY" e2e skipped "$(jq -nc --arg r "$R" '{reason: $r, via: "skip-e2e"}')"
  jq -nc --arg r "$R" '{e2e: "skipped", reason: $r}' ;;
fetch-ticket)
  [[ "$KEY" =~ ^EDU-[0-9]+$ ]] || { echo "not a ticket key (EDU-<n>): $KEY"; exit 2; }
  RAW=$(bash "$GHI" get-issue "$(issue_num "$KEY")" 2>&1) &&
    jq -e '.number' >/dev/null 2>&1 <<<"$RAW" || { echo "get-issue $KEY failed: $(tail -c 300 <<<"$RAW" | tr '\n' ' ')"; exit 1; }
  mkdir -p "$D"; OLD=$(cat "$D/ticket.json" 2>/dev/null); jq -e 'type == "object"' >/dev/null 2>&1 <<<"$OLD" || OLD='{}'
  jq --argjson old "$OLD" --arg t "$(now_iso)" -f "$W/ticket.jq" <<<"$RAW" > "$D/ticket.json.tmp.$$" &&
    mv "$D/ticket.json.tmp.$$" "$D/ticket.json" || { rm -f "$D/ticket.json.tmp.$$"; echo "ticket.json build failed"; exit 1; }
  bash "$0" stage "$KEY" fetch pass
  jq -c '{key, summary, ac: (.acceptance_criteria | length), links: (.links | length), soft_deps, labels}' "$D/ticket.json" ;;
*) sed -n '2,46p' "$0"; exit 2 ;;
esac

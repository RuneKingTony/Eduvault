#!/usr/bin/env bash
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)/gh-issues.sh"
D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
export GH_ISSUES_FIXTURE_DIR="$D"
unset EDU_ORCHESTRATED
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
check() { # name, jq-filter, json
  if jq -e "$2" >/dev/null 2>&1 <<<"$3"; then ok "$1"; else bad "$1 :: $3"; fi
}

cat >"$D/issue-1.json" <<J
{"number":1,"title":"Epic","state":"open","labels":["epic"],"body":"b","parent":null,"blocked_by":[],"children":[2,3]}
J
cat >"$D/issue-2.json" <<J
{"number":2,"title":"Child two","state":"open","labels":["in-progress"],"body":"b2","parent":1,"blocked_by":[],"children":[]}
J
cat >"$D/issue-3.json" <<J
{"number":3,"title":"Child three","state":"closed","labels":[],"body":"b3","parent":1,"blocked_by":[2],"children":[]}
J
echo body >"$D/body.md"

out="$("$S" get-issue 2)"; rc=$?
[ $rc -eq 0 ] && ok "get-issue exit" || bad "get-issue exit"
check "get-issue shape" '.number==2 and .parent==1 and (.labels==["in-progress"]) and (.blocked_by==[])' "$out"
[ "$(wc -l <<<"$out" | tr -d ' ')" = 1 ] && ok "one line" || bad "one line"

out="$("$S" list-links 2)"
check "list-links blocks" '.blocks==[3] and .parent==1 and .children==[]' "$out"
out="$("$S" list-links 3)"
check "list-links blocked_by" '.blocked_by==[2]' "$out"
out="$("$S" list-children 1)"
check "list-children" '(.children|map(.number))==[2,3]' "$out"
out="$("$S" search "label:in-progress")"
check "search label" '(.results|map(.number))==[2]' "$out"
out="$("$S" search "child state:closed")"
check "search title+state" '(.results|map(.number))==[3]' "$out"

out="$("$S" get-issue 99)"; rc=$?
[ $rc -ne 0 ] && check "missing fixture errors" '.error' "$out" || bad "missing fixture should exit non-zero"

for v in "comment 2 --body-file $D/body.md" "transition 2 in-review" "create-link 3 blocked-by 2" \
         "edit-issue 2 --add-label x" "assign 2 @me" "create-issue --title T --body-file $D/body.md --parent 1" "close-issue 2"; do
  out="$("$S" $v)"; rc=$?
  [ $rc -eq 0 ] && check "dry-run: ${v%% *}" '.dry_run==true' "$out" || bad "dry-run: ${v%% *} rc=$rc"
  out="$("$S" $v --yes)"; rc=$?
  [ $rc -eq 0 ] && check "fixture --yes stays dry: ${v%% *}" '.dry_run==true' "$out" || bad "fixture --yes: ${v%% *} rc=$rc"
done

out="$("$S" transition 2 bogus)"; rc=$?
[ $rc -ne 0 ] && ok "transition rejects unknown state" || bad "transition rejects unknown state"

out="$(EDU_ORCHESTRATED=1 "$S" close-issue 2 --yes)"; rc=$?
[ $rc -ne 0 ] && check "close refused when orchestrated" '.error|test("human-only")' "$out" || bad "close must refuse when orchestrated"
out="$(EDU_ORCHESTRATED=1 "$S" close-issue 2)"; rc=$?
[ $rc -ne 0 ] && ok "close refused even without --yes" || bad "close refused even without --yes"

[ $fail -eq 0 ] && echo "ALL PASS" || { echo "FAILURES"; exit 1; }

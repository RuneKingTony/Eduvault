#!/bin/bash
# The migrations line of the final report: what the PR adds under apps/api/db/migrations/ (GitHub's
# file list when a PR exists, else a local diff against the origin/main merge-base). Migrations a
# ticket's e2e stage applied went to the one shared eduvault database on :5434, not a private copy.
#
# usage: report.sh <KEY>
# exit:  0 {added, applied, not_applied, line}     1 couldn't list the PR's files
set -u
. "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 1

KEY=${1:?usage: report.sh <KEY>}
PR=$(st_get "$KEY" '.pr_url') TREE=$(st_get "$KEY" '.worktree_path')
M=apps/api/db/migrations/
if [ -n "$PR" ]; then
  ADDED=$(gh api "repos/{owner}/{repo}/pulls/${PR##*/}/files" --paginate \
    --jq ".[] | select(.status == \"added\" and (.filename | startswith(\"$M\"))) | .filename" 2>/dev/null) ||
    { echo "couldn't list the files of $PR"; exit 1; }
elif [ -d "$TREE" ]; then
  B=$(git -C "$TREE" merge-base origin/main HEAD 2>/dev/null)
  ADDED=$( { git -C "$TREE" diff --name-only --diff-filter=A "$B" -- "$M"; git -C "$TREE" ls-files -o --exclude-standard -- "$M"; } 2>/dev/null)
else ADDED=""; fi

jq -nc --argjson a "$(printf '%s\n' $ADDED | sed 's#.*/##' | grep '\.sql$' | sort -u | jq -R . | jq -sc .)" \
  --argjson s "$(st_get "$KEY" '.stack.migrations_applied' -c | grep . || echo '[]')" '
  {added: $a, applied: [$a[] | select(. as $m | $s | index($m))], not_applied: ($a - $s)}
  | .line = (if (.added | length) == 0 then "migrations: none added"
      else "migrations: \(.added | length) added (\(.added | join(", "))); \(.applied | length) applied to the shared eduvault database on :5434"
        + (if (.not_applied | length) > 0 then "; not applied: \(.not_applied | join(", "))" else "" end) end)'

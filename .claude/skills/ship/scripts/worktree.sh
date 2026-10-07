#!/bin/bash
# Squash-merge-aware teardown of one ticket's worktree and local branch. `git branch -d` always
# refuses a squash-merged branch; this proves the merge through gh instead.
# Touches only the worktree under .claude/worktrees/ and the branch recorded for the key (or named).
# Every check runs before anything is removed, so a refusal leaves everything in place.
#
# usage: worktree.sh remove <KEY> [run_id]           worktree_path/branch/pr_url from status.json
#        worktree.sh remove-branch <BRANCH> [run_id] manual (/cleanup-worktrees): PR found by head branch
# exit:  0 {key, branch, worktree, pr, worktree_removed: removed|forced|absent, branch_deleted: deleted|absent}
#          — also when both were already gone (idempotent)
#        1 refused, nothing removed: PR not MERGED, tracked changes or non-artefact untracked files,
#          branch has commits the merged PR doesn't, stack still up, or a path outside .claude/worktrees
#        2 usage / nothing recorded for the key      3 gh or the fetch failed
set -u
. "$(dirname "$0")/lib.sh"

CMD=${1:-} ARG=${2:-}
[ -n "$ARG" ] || { sed -n '2,14p' "$0"; exit 2; }
# untracked paths `git worktree remove --force` may discard: generated settings and build output
ARTEFACTS='^(\.claude/settings(\.local)?\.json|(.*/)?(node_modules|dist|coverage|test-results|playwright-report|\.nx|\.vite|\.turbo|tmp|out-tsc)/.*|(.*/)?(node_modules|dist|coverage|test-results|playwright-report|\.nx|\.vite|\.turbo|tmp|out-tsc)/?|.*\.(log|tsbuildinfo))$'

case "$CMD" in
remove)
  KEY=$ARG BR=$(st_get "$ARG" '.branch') TREE=$(st_get "$ARG" '.worktree_path') PR=$(st_get "$ARG" '.pr_url')
  RUN=${3:-$(lock_run "$KEY")}
  [ -n "$BR" ] || { echo "no branch recorded for $KEY"; exit 2; }
  echo "$BR" | grep -qiE "$(key_re "$KEY")" || { echo "recorded branch $BR doesn't carry $KEY — not touching it"; exit 1; }
  [ "$(st_get "$KEY" '.stack.up')" = true ] && { echo "stack for $KEY still up — stack.sh down first"; exit 1; } ;;
remove-branch)
  KEY="" BR=$ARG TREE="" PR="" RUN=${3:-} ;;
*) sed -n '2,14p' "$0"; exit 2 ;;
esac
RUN=${RUN:-worktree-$$}

# the worktree git actually has checked out on this branch (the recorded path, if any, must agree)
REG=$(git -C "$ROOT" worktree list --porcelain | awk -v b="refs/heads/$BR" '/^worktree /{w=substr($0,10)} $0=="branch "b{print w}')
[ -n "$TREE" ] || TREE=$REG
if [ -n "$REG" ] && [ "$REG" != "$TREE" ]; then echo "$BR is checked out at $REG, not the recorded $TREE"; exit 1; fi
if [ -n "$TREE" ]; then
  case "$TREE" in "$ROOT/.claude/worktrees/"?*) ;; *) echo "$TREE is outside $ROOT/.claude/worktrees — not touching it"; exit 1 ;; esac
fi
HAS_BR=false; git -C "$ROOT" show-ref -q --verify "refs/heads/$BR" && HAS_BR=true
out() {  # <worktree_removed> <branch_deleted>
  jq -nc --arg k "$KEY" --arg b "$BR" --arg w "$TREE" --arg p "$PR" --arg wr "$1" --arg bd "$2" \
    '{key: ($k | select(. != "") // null), branch: $b, worktree: ($w | select(. != "") // null),
      pr: ($p | select(. != "") // null), worktree_removed: $wr, branch_deleted: $bd}'
}
[ -z "$REG" ] && ! $HAS_BR && { git -C "$ROOT" worktree prune; out absent absent; exit 0; }

# merged, per GitHub — the only proof that survives a squash
[ -n "$PR" ] || PR=$(gh pr list --head "$BR" --state merged --json url -q '.[0].url' 2>/dev/null)
[ -n "$PR" ] || { echo "no merged PR for $BR"; exit 1; }
V=$(gh pr view "$PR" --json state,headRefOid,number 2>/dev/null) || { echo "gh pr view $PR failed"; exit 3; }
read -r STATE OID NUM < <(jq -r '"\(.state) \(.headRefOid) \(.number)"' <<<"$V")
[ "$STATE" = MERGED ] || { echo "PR $PR is $STATE, not MERGED — keeping $BR"; exit 1; }

# fetch under the git-ops mutex
bash "$W/mutex.sh" acquire git-ops "${KEY:-$BR}" "$RUN" 900 5 >/dev/null || { echo "git-ops mutex busy"; exit 3; }
git -C "$ROOT" fetch -q origin main; rc=$?
git -C "$ROOT" cat-file -e "$OID^{commit}" 2>/dev/null || git -C "$ROOT" fetch -q origin "refs/pull/$NUM/head" || rc=1
bash "$W/mutex.sh" release git-ops "${KEY:-$BR}" "$RUN"
[ $rc -eq 0 ] || { echo "git fetch failed (origin main / pull/$NUM/head)"; exit 3; }

# -D is safe only when the branch holds nothing the merged PR didn't: tip == PR head, or behind it
if $HAS_BR; then
  TIP=$(git -C "$ROOT" rev-parse "refs/heads/$BR")
  if [ "$TIP" != "$OID" ] && ! git -C "$ROOT" merge-base --is-ancestor "$TIP" "$OID"; then
    echo "$BR has $(git -C "$ROOT" rev-list --count "$OID..$TIP") commit(s) not in merged PR $PR (git log $OID..$BR) — keeping both"; exit 1
  fi
fi

FORCE=""
if [ -n "$REG" ] && [ -d "$TREE" ]; then
  DIRTY=$(git -C "$TREE" status --porcelain 2>/dev/null)
  TRACKED=$(grep -v '^?? ' <<<"$DIRTY" | grep . | head -3 | tr '\n' ' ')
  [ -n "$TRACKED" ] && { echo "$TREE has uncommitted changes: ${TRACKED}— keeping it"; exit 1; }
  OTHER=$(grep '^?? ' <<<"$DIRTY" | cut -c4- | sed 's/^"//; s/"$//' | grep -vE "$ARTEFACTS" | head -3 | tr '\n' ' ')
  [ -n "$OTHER" ] && { echo "$TREE has untracked files that aren't build output: ${OTHER}— keeping it"; exit 1; }
  [ -n "$DIRTY" ] && FORCE=--force
fi

WR=absent BD=absent
if [ -n "$REG" ]; then
  git -C "$ROOT" worktree remove $FORCE "$TREE" 2>/dev/null || { echo "git worktree remove $TREE failed"; exit 1; }
  WR=$([ -n "$FORCE" ] && echo forced || echo removed)
fi
git -C "$ROOT" worktree prune
if $HAS_BR; then git -C "$ROOT" branch -q -D "$BR" && BD=deleted || { echo "git branch -D $BR failed"; exit 1; }; fi
out "$WR" "$BD"

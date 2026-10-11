#!/bin/bash
# Attach the e2e run's screenshots to the PR as a "Visual evidence" comment. The images are committed
# to the `e2e-evidence` branch with git plumbing (a temporary index: no checkout, no worktree) and
# embedded by commit SHA, so the URLs never change. The repo is PUBLIC, so the branch is world-readable
# and permanent: evidence.py leaves out any file whose name, caption or criterion may show a credential
# (its DENY list), and the e2e skill forbids photographing one. A comment, not the PR body: the squash
# merge copies the body into main's history, and the pr worker owns the body.
#
# usage:
#   evidence.sh select <KEY>              print the screenshots publish would attach (JSON); skips on stderr
#   evidence.sh upload <prefix> <file>... [--dry-run]
#                                         commit the files under <prefix>/ and print "<name>\t<url>" lines
#   evidence.sh publish <KEY> [--dry-run] upload the selection and post or update the PR comment
#                                         (between marker comments, so a re-run edits it); none -> exit 0
# env: EVIDENCE_SLUG (owner/repo, default: gh repo view), EVIDENCE_MAX_COUNT, EVIDENCE_MAX_FILE_BYTES,
#      EVIDENCE_MAX_TOTAL_BYTES
# exit:  0 ok or nothing to attach   1 failed (never a halt for the pr stage)   2 usage
set -u
. "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 1

BR=e2e-evidence
MARK='<!-- ship:evidence:start -->'
DRY=false; ARGS=()
for a in "$@"; do if [ "$a" = --dry-run ]; then DRY=true; else ARGS+=("$a"); fi; done
set -- ${ARGS[@]+"${ARGS[@]}"}

slug() { echo "${EVIDENCE_SLUG:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"; }

upload() {  # <prefix> <file>... -> name\turl lines
  local prefix=$1; shift
  local slug try parent tree commit f blob idx
  slug=$(slug) && [ -n "$slug" ] || return 1
  for try in 1 2 3; do       # parallel runs push to the same branch: rebuild on a rejected push
    git fetch -q origin "+refs/heads/$BR:refs/remotes/origin/$BR" 2>/dev/null
    parent=$(git rev-parse -q --verify "refs/remotes/origin/$BR")
    idx=$(mktemp); rm -f "$idx"
    if [ -n "$parent" ]; then GIT_INDEX_FILE=$idx git read-tree "$parent"
    else GIT_INDEX_FILE=$idx git read-tree --empty; fi
    for f in "$@"; do
      [ -f "$f" ] || { echo "missing $f" >&2; rm -f "$idx"; return 1; }
      blob=$(git hash-object -w "$f")
      GIT_INDEX_FILE=$idx git update-index --add --cacheinfo "100644,$blob,$prefix/$(basename "$f")"
    done
    tree=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"
    commit=$(git commit-tree "$tree" ${parent:+-p "$parent"} -m "evidence: $prefix")
    if $DRY || git push -q origin "$commit:refs/heads/$BR" 2>/dev/null; then
      for f in "$@"; do
        printf '%s\thttps://github.com/%s/blob/%s/%s/%s?raw=true\n' "$(basename "$f")" "$slug" "$commit" "$prefix" "$(basename "$f")"
      done
      return 0
    fi
    sleep 3
  done
  echo "push to $BR rejected 3 times" >&2; return 1
}

usage() { sed -n "/^# usage:/,/^# exit:/p" "$W/evidence.sh" | sed 's/^# \{0,1\}//'; exit 2; }

run_dir() {  # <KEY> -> the e2e run directory (e2e.run, else the report's directory)
  local D r; D=$(key_dir "$1"); r=$(cat "$D/e2e.run" 2>/dev/null)
  [ -n "$r" ] || r=$(dirname "$(jq -r '.report // empty' "$D/e2e.json" 2>/dev/null)")
  echo "$r"
}

selection() {  # <KEY> -> JSON list on stdout, skips on stderr
  python3 "$W/evidence.py" select "$(key_dir "$1")/e2e.json" "$(run_dir "$1")" "$(st_get "$1" '.stages.e2e.started_epoch')"
}

case "${1:-}" in
select)
  [ $# -eq 2 ] || usage
  selection "$2" ;;
upload)
  [ $# -ge 3 ] || usage
  p=$2; shift 2; upload "$p" "$@" ;;
publish)
  [ $# -eq 2 ] || usage
  KEY=$2 D=$(key_dir "$2")
  PR=$(st_get "$KEY" '.pr_url'); [ -n "$PR" ] || { echo "no pr_url" >&2; exit 1; }
  [ -f "$D/e2e.json" ] || { echo "no e2e.json: nothing to attach"; exit 0; }
  SKIPS=$(mktemp); SEL=$(selection "$KEY" 2> "$SKIPS") || { cat "$SKIPS" >&2; rm -f "$SKIPS"; exit 1; }
  cat "$SKIPS" >&2; OMIT=$(grep -c '^skipped ' "$SKIPS"); rm -f "$SKIPS"
  N=$(jq 'length' <<<"$SEL")
  [ "$N" -gt 0 ] || { echo "no screenshots to attach to $PR"; exit 0; }
  RUN=$(basename "$(run_dir "$KEY")")
  FILES=(); while IFS= read -r f; do FILES+=("$f"); done < <(jq -r '.[].path' <<<"$SEL")
  LINES=$(upload "$KEY/$RUN" "${FILES[@]}") || exit 1
  URLS=$(jq -Rn '[inputs | split("\t") | {(.[0]): .[1]}] | add' <<<"$LINES")
  BODY=$(jq --argjson u "$URLS" 'map(. + {url: $u[.name]})' <<<"$SEL" |
    python3 "$W/evidence.py" render "$RUN" "$(jq -r '.verdict // "PASS"' "$D/e2e.json")" "$OMIT") || exit 1
  if $DRY; then printf '%s\n' "$BODY"; exit 0; fi
  NUM=${PR##*/}; REPO=$(slug)
  CID=$(gh api "repos/$REPO/issues/$NUM/comments" --paginate -q ".[] | select(.body | contains(\"$MARK\")) | .id" 2>/dev/null | head -1)
  printf '%s\n' "$BODY" > "$D/evidence-comment.md"
  if [ -n "$CID" ]; then gh api -X PATCH "repos/$REPO/issues/comments/$CID" -F "body=@$D/evidence-comment.md" >/dev/null || exit 1
  else gh pr comment "$PR" --body-file "$D/evidence-comment.md" >/dev/null || exit 1; fi
  st_set "$KEY" '.evidence = {published_at: $t, count: ($n|tonumber), omitted: ($o|tonumber), run: $r}' --arg t "$(now_iso)" --arg n "$N" --arg o "$OMIT" --arg r "$RUN"
  echo "attached $N screenshot(s) to $PR ($OMIT left out)" ;;
*) usage ;;
esac

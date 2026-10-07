#!/usr/bin/env bash
# Step 7 of /skill-slim-fit — link and orphan check for one or more skill directories.
# Usage: check-links.sh <skill-dir> [<skill-dir>...]
# Prints BROKEN / ORPHAN lines; prints nothing and exits 0 when the set is clean.
set -uo pipefail

[ $# -gt 0 ] || { echo "usage: $0 <skill-dir> [<skill-dir>...]" >&2; exit 2; }

status=0

for D in "$@"; do
  D="${D%/}"
  [ -d "$D" ] || { echo "MISSING $D" >&2; status=2; continue; }

  # Every link resolves from the directory of the file that contains it. A backticked path is
  # usually workspace-root-relative, so either resolution is accepted.
  while IFS= read -r line; do
    [ -n "$line" ] && { echo "$line"; status=1; }
  done < <(
    for f in "$D/SKILL.md" "$D"/references/*.md; do
      [ -e "$f" ] || continue
      { grep -oE '\]\([^)]+\)' "$f" | sed 's/](//;s/)$//'
        grep -oE '`[^`[:space:]]*references/[^`[:space:]]+`' "$f" | tr -d '`'
      } | while read -r p; do
        # Skip anchors, URLs, and placeholders — `references/<topic>.md` in a naming rule is an
        # illustration, not a link.
        case "$p" in (''|'#'*|http*|*'<'*|*'>'*) continue;; esac
        t="${p%%#*}"
        # A citation resolves from its own file, from the skill root (`references/x.md` cited
        # inside references/), from the workspace root, or from the skills root
        # (`jira-operations/references/x.md` is how one skill cites another).
        [ -e "$(dirname "$f")/$t" ] || [ -e "$D/$t" ] || [ -e "$t" ] || [ -e "$(dirname "$D")/$t" ] \
          || echo "BROKEN  ${f#"$D"/} -> $p"
      done
    done
  )

  # A reference nothing links to is either a missing link or a file to delete. Report, never delete.
  # Scripts count: a references/*.sh no step invokes is as dead as an unlinked .md.
  for r in "$D"/references/*.md "$D"/references/*.sh; do
    [ -e "$r" ] || continue
    b=$(basename "$r")
    grep -rql --include='*.md' --include='*.sh' --exclude="$b" -- "$b" "$D" >/dev/null 2>&1 || {
      echo "ORPHAN  $D/references/$b"; status=1
    }
  done
done

exit $status

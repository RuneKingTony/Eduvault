#!/bin/bash
# Cross-skill lens. Deliberately ACROSS skills, because the two scripts beside it are
# already within one:
#   check-links.sh      BROKEN/ORPHAN inside one skill directory
#   find-duplicates.sh  repeated blocks inside one skill's own file set
#
# Neither can see the same paragraph maintained in several skills, where fixing it in
# one leaves the rest stale.
#
# Read-only, and a candidate list rather than a verdict. Usage: arsenal-audit.sh [skills-dir]

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SKILLS="${1:-$(cd "$HERE/../.." && pwd -P)}"
[ -d "$SKILLS" ] || { echo "no skills directory at $SKILLS" >&2; exit 2; }

# A long line repeated verbatim across separate skills is one rule with several owners.
echo "== identical long lines maintained in more than one skill =="
found=0
while IFS= read -r line; do
  text="$(printf '%s' "$line" | cut -f2-)"
  owners="$(grep -rlF -- "$text" "$SKILLS" --include='*.md' 2>/dev/null \
    | sed "s|^$SKILLS/||; s|/.*||" | sort -u)"
  c="$(printf '%s\n' "$owners" | grep -c .)"
  [ "${c:-0}" -ge 2 ] || continue
  found=$((found+1))
  echo "  in $c skills: $(printf '%s' "$text" | cut -c1-92)…"
  printf '%s\n' "$owners" | sed 's|^|      |'
  [ "$found" -ge 12 ] && break
done < <(
  grep -rhE '^[^|#>-].{110,}$' "$SKILLS" --include='*.md' 2>/dev/null \
    | sed 's/^[[:space:]]*//' \
    | sort | uniq -c | awk '$1 > 1' | sed 's/^ *\([0-9]*\) /\1\t/'
)

echo
if [ "$found" -gt 0 ]; then
  echo "arsenal audit: candidates above — read each before changing anything."
else
  echo "arsenal audit: clean"
fi
exit 0

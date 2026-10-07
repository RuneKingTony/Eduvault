#!/usr/bin/env bash
# Step 4 of /skill-slim-fit — surface candidate duplicates in one skill's file set.
# Usage: find-duplicates.sh <skill-dir> [<skill-dir>...]
# Output is a candidate list, not a verdict: read the bodies before cutting anything, and keep a
# MUST / NEVER / halt condition repeated at the point of danger.
set -uo pipefail

[ $# -gt 0 ] || { echo "usage: $0 <skill-dir> [<skill-dir>...]" >&2; exit 2; }

for D in "$@"; do
  D="${D%/}"
  [ -d "$D" ] || { echo "MISSING $D" >&2; continue; }
  set -- "$D/SKILL.md"
  for r in "$D"/references/*.md; do [ -e "$r" ] && set -- "$@" "$r"; done

  echo "=== $D"

  echo "--- headings (same topic under a different name?)"
  grep -nE '^#{1,4} ' "$@" 2>/dev/null

  echo "--- repeated lines, 40+ chars (catches identical command blocks and rules)"
  cat "$@" 2>/dev/null | grep -vE '^[[:space:]]*$|^```' \
    | sed 's/^[[:space:]]*[-*] //' | sort | uniq -d | grep -E '.{40,}'

  echo "--- repeated bold bullet stems (same rule, reworded body)"
  grep -hoE '^[[:space:]]*[-*] \*\*[^*]+\*\*' "$@" 2>/dev/null | sort | uniq -d

  echo
done

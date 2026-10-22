#!/usr/bin/env bash
# Validates the check blocks in references/*.md: header shape, unique ids, Do:/Expect: present.
set -euo pipefail
cd "$(dirname "$0")/.."
PERSONAS='owner|foreign|superadmin|admin|bursar|bursar2|principal|newhire|teacher|student|guardian|tobistudent|none'
status=0
fail() { echo "checks-lint: $*" >&2; status=1; }
files=(references/*.md)
count=0
declare -A seen
for f in "${files[@]}"; do
  id=""; do_=0; expect=0
  flush() {
    if [ -n "$id" ]; then
      [ "$do_" = 1 ] || fail "$f: $id has no Do: line"
      [ "$expect" = 1 ] || fail "$f: $id has no Expect: line"
    fi
  }
  while IFS= read -r line; do
    if [[ "$line" == "### "* ]]; then
      flush
      if [[ "$line" =~ ^###\ ([A-Z]+-[0-9]{2})\ ·\ (api|browser)\ ·\ ($PERSONAS)$ ]]; then
        id="${BASH_REMATCH[1]}"; do_=0; expect=0; count=$((count + 1))
        [ -z "${seen[$id]:-}" ] || fail "$f: duplicate id $id (also in ${seen[$id]})"
        seen[$id]="$f"
      else
        fail "$f: bad header: $line"; id=""
      fi
    elif [ -n "$id" ]; then
      [[ "$line" == "Do: "* ]] && do_=1
      [[ "$line" == "Expect: "* ]] && expect=1
    fi
  done < "$f"
  flush
done
[ "$count" -gt 0 ] || fail "no checks found"
[ "$status" = 0 ] && echo "checks-lint: ok ($count checks)"
exit "$status"

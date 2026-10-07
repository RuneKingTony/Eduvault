#!/usr/bin/env bash
# Validates an e2e report. Exit 0 valid, 1 invalid (reason on stderr).
#   line 1 is "VERDICT: PASS|FAIL|BLOCKED"
#   PASS    none of the words FAIL or BLOCKED in the first 15 lines
#   BLOCKED a "cause: environment|persona|product" line in the first 15 lines
#   FAIL    a "failed:" or "error:" line in the first 15 lines
set -u
F="${1:?usage: report-check.sh <report>}"
[ -f "$F" ] || { echo "no such report: $F" >&2; exit 1; }
HEAD15=$(head -n 15 "$F")
FIRST=$(head -n 1 "$F")

case "$FIRST" in
  "VERDICT: PASS")
    if tail -n +2 <<<"$HEAD15" | grep -qE '\b(FAIL|BLOCKED)\b'; then
      echo "a PASS report must not contain FAIL or BLOCKED in its first 15 lines" >&2; exit 1
    fi ;;
  "VERDICT: BLOCKED")
    grep -qE '^cause: (environment|persona|product)$' <<<"$HEAD15" \
      || { echo "a BLOCKED report needs 'cause: environment|persona|product' in its first 15 lines" >&2; exit 1; } ;;
  "VERDICT: FAIL")
    grep -qE '^(failed|error): ' <<<"$HEAD15" \
      || { echo "a FAIL report needs a 'failed:' or 'error:' line in its first 15 lines" >&2; exit 1; } ;;
  *) echo "line 1 must be 'VERDICT: PASS|FAIL|BLOCKED'" >&2; exit 1 ;;
esac
echo valid

#!/usr/bin/env bash
# Usage: summarize.sh checks.tsv   (ID<TAB>PASS|FAIL|BLOCKED<TAB>note<TAB>screenshot)
set -euo pipefail
tsv="${1:?usage: summarize.sh checks.tsv}"
[ -s "$tsv" ] || { echo "summarize: $tsv is empty or missing" >&2; exit 2; }
awk -F'\t' '
  $2 !~ /^(PASS|FAIL|BLOCKED)$/ { printf "summarize: line %d: bad status %s\n", NR, $2 > "/dev/stderr"; bad = 1; next }
  ($2 == "FAIL" || $2 == "BLOCKED") && $3 == "" { printf "summarize: line %d: %s needs a note\n", NR, $1 > "/dev/stderr"; bad = 1 }
  { n[$2]++; rows[NR] = $0 }
  END {
    if (bad) exit 2
    verdict = (n["FAIL"] > 0) ? "FAIL" : (n["BLOCKED"] > 0) ? "BLOCKED" : "PASS"
    print "Verdict: " verdict
    printf "PASS %d · FAIL %d · BLOCKED %d\n\n", n["PASS"], n["FAIL"], n["BLOCKED"]
    print "| Check | Status | Note | Screenshot |"
    print "| ----- | ------ | ---- | ---------- |"
    for (i = 1; i <= NR; i++) if (i in rows) { split(rows[i], c, "\t"); printf "| %s | %s | %s | %s |\n", c[1], c[2], c[3], c[4] }
  }' "$tsv"

#!/usr/bin/env bash
# Offline tests for checks-lint.sh and summarize.sh.
set -uo pipefail
cd "$(dirname "$0")/../.."
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }

bash scripts/checks-lint.sh >/dev/null 2>&1 && ok "lint passes on the real checklist" || bad "lint passes on the real checklist"

mkdir -p "$tmp/bad/references" "$tmp/bad/scripts"; cp scripts/checks-lint.sh "$tmp/bad/scripts/"
printf '### XX-01 · api · owner\nDo: a\n\n### XX-01 · api · owner\nDo: a\nExpect: b\n\n### XX-02 · cli · owner\nDo: a\nExpect: b\n' > "$tmp/bad/references/x.md"
out="$(bash "$tmp/bad/scripts/checks-lint.sh" 2>&1)"; rc=$?
{ [ "$rc" -ne 0 ] && grep -q 'no Expect' <<<"$out" && grep -q 'duplicate id' <<<"$out" && grep -q 'bad header' <<<"$out"; } && ok "lint catches missing Expect, duplicate id, bad header" || bad "lint catches problems"

printf 'A-01\tPASS\t\t\nA-02\tFAIL\tgot 409 expected 200\ts.png\n' > "$tmp/c.tsv"
out="$(bash scripts/summarize.sh "$tmp/c.tsv")"; grep -q '^Verdict: FAIL' <<<"$out" && ok "summarize: FAIL wins" || bad "summarize: FAIL wins"
printf 'A-01\tPASS\t\t\nA-02\tBLOCKED\tcause: environment\t\n' > "$tmp/c.tsv"
bash scripts/summarize.sh "$tmp/c.tsv" | grep -q '^Verdict: BLOCKED' && ok "summarize: BLOCKED beats PASS" || bad "summarize: BLOCKED beats PASS"
printf 'A-01\tPASS\t\t\n' > "$tmp/c.tsv"
bash scripts/summarize.sh "$tmp/c.tsv" | grep -q '^Verdict: PASS' && ok "summarize: PASS" || bad "summarize: PASS"
printf 'A-01\tFAIL\t\t\n' > "$tmp/c.tsv"
bash scripts/summarize.sh "$tmp/c.tsv" >/dev/null 2>&1 && bad "summarize: FAIL without note rejected" || ok "summarize: FAIL without note rejected"
exit "$fails"

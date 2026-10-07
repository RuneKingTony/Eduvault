#!/bin/bash
# Offline tests for the SOUL hooks and soul.sh. Run: bash .claude/hooks/soul/tests/run-tests.sh
# SOUL_ROOT and SOUL_SEED point every script at a temp dir, so the real log is never touched.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
S="$HERE/.."
REAL_SEED="$HERE/../../../soul/seed"
BEFORE=$(cat "$REAL_SEED"/*.md | shasum)
PASS=0; FAIL=0
check() { if [ "$2" = "0" ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }
is() { [ "$1" = "$2" ]; echo $?; }

TMP="$(mktemp -d)"
export SOUL_ROOT="$TMP/soul"
export SOUL_SEED="$TMP/seed"
export SOUL_TODAY=2026-10-07
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$SOUL_ROOT" "$SOUL_SEED"
cp "$REAL_SEED"/*.md "$SOUL_SEED/"
LOG="$SOUL_ROOT/decisions.jsonl"
rec() { sed -n "${1}p" "$LOG" | jq -r "$2"; }

cat > "$TMP/ask.json" <<'JSON'
{
  "session_id": "sess-1", "cwd": "/nonexistent", "tool_name": "AskUserQuestion",
  "tool_input": {
    "questions": [
      { "question": "Where should the school check live?", "header": "placement", "multiSelect": false,
        "options": [
          { "label": "API guard (Recommended)", "description": "Server is the only trustworthy gate [tenancy-001]." },
          { "label": "SPA route loader", "description": "Faster, bypassable." } ] },
      { "question": "Add a Playwright spec?", "header": "Test layer", "multiSelect": false,
        "options": [
          { "label": "Yes, e2e (Recommended)", "description": "Covers the flow." },
          { "label": "Unit only", "description": "Cheaper." } ] },
      { "question": "Why was it reverted?", "header": "Weird Header", "multiSelect": false,
        "options": [ { "label": "Broke runtime", "description": "a" }, { "label": "Timing", "description": "b" } ] },
      { "question": "Unanswered?", "header": "Scope",
        "options": [ { "label": "A", "description": "" }, { "label": "B", "description": "" } ] },
      { "question": "Judge this?", "header": "Soul review",
        "options": [ { "label": "Accept", "description": "" }, { "label": "Reject", "description": "" } ] }
    ],
    "annotations": { "Where should the school check live?": { "notes": "never trust the client" } }
  },
  "tool_response": { "answers": {
    "Where should the school check live?": "API guard",
    "Add a Playwright spec?": "Unit only",
    "Why was it reverted?": "it felt wrong",
    "Judge this?": "Accept" } }
}
JSON
cat > "$TMP/auto.json" <<'JSON'
{
  "session_id": "auto-session", "cwd": "/nonexistent", "source": "auto", "tool_name": "AskUserQuestion",
  "tool_input": { "questions": [ { "question": "Which datastore?", "header": "Approach", "multiSelect": false,
    "options": [ { "label": "Postgres (Recommended)", "description": "fits" }, { "label": "Mongo", "description": "alt" } ] } ] },
  "tool_response": { "answers": { "Which datastore?": "Postgres" } }
}
JSON

# --- capture ---
bash "$S/capture-decision.sh" < "$TMP/ask.json"; check "capture: exits 0" $?
check "capture: one record per question, Soul review skipped" "$(is "$(wc -l < "$LOG" | tr -d ' ')" 4)"
check "capture: source human" "$(is "$(rec 1 .source)" human)"
check "capture: recommended accepted" "$(is "$(rec 1 .answer_kind)" recommended)"
check "capture: (Recommended) stripped" "$(is "$(rec 1 '.options[0].label')" "API guard")"
check "capture: override is option" "$(is "$(rec 2 .answer_kind)" option)"
check "capture: free text" "$(is "$(rec 3 .answer_kind)" free_text)"
check "capture: unanswered is none" "$(is "$(rec 4 .answer_kind)" none)"
check "capture: alias maps to canonical header" "$(is "$(rec 1 .header)" "Target app")"
check "capture: unknown header flagged" "$(is "$(rec 3 .header_known)" false)"
check "capture: notes kept" "$(is "$(rec 1 .notes)" "never trust the client")"
check "capture: policy ids extracted" "$(is "$(rec 1 '.policy_ids|join(",")')" "tenancy-001")"
check "capture: records carry distinct ids" "$(is "$(jq -r .id "$LOG" | sort -u | grep -c .)" 4)"
bash "$S/capture-decision.sh" < "$TMP/auto.json"
check "capture: auto source recorded" "$(is "$(rec 5 .source)" auto)"
echo 'not json' | bash "$S/capture-decision.sh"; check "capture: bad input still exits 0" $?
check "capture: bad input appends nothing" "$(is "$(wc -l < "$LOG" | tr -d ' ')" 5)"

# --- watermark ---
bash "$S/soul.sh" advance 3 >/dev/null; check "advance: ok" $?
check "pending: after watermark" "$(is "$(bash "$S/soul.sh" pending | cut -f1 | tr '\n' ,)" "4,5,")"
bash "$S/soul.sh" check-watermark >/dev/null; check "check-watermark: intact" $?
bash "$S/soul.sh" advance 2 >/dev/null 2>&1; check "advance: refuses to go backwards" "$(is $? 2)"
bash "$S/soul.sh" advance 99 >/dev/null 2>&1; check "advance: refuses past end" "$(is $? 2)"
cp "$LOG" "$LOG.bak"; sed '1d' "$LOG.bak" > "$LOG"
bash "$S/soul.sh" check-watermark >/dev/null 2>&1; check "check-watermark: detects edited log" "$(is $? 1)"
mv "$LOG.bak" "$LOG"

# --- nudge ---
rm -f "$SOUL_ROOT/.last-distill"
OUT=$(echo '{}' | bash "$S/distill-nudge.sh"); check "nudge: silent under threshold" "$(is "$OUT" "")"
for _ in $(seq 1 16); do bash "$S/capture-decision.sh" < "$TMP/auto.json"; done
check "nudge: log now has 21 records" "$(is "$(wc -l < "$LOG" | tr -d ' ')" 21)"
OUT=$(echo '{}' | bash "$S/distill-nudge.sh"); check "nudge: blocks at >=20 undistilled" "$(is "$(echo "$OUT" | jq -r .decision)" block)"
check "nudge: names the skill" "$(is "$(echo "$OUT" | jq -r .reason | grep -c soul-distill)" 1)"
OUT=$(echo '{"stop_hook_active":true}' | bash "$S/distill-nudge.sh"); check "nudge: silent when stop_hook_active" "$(is "$OUT" "")"
bash "$S/soul.sh" advance 3 >/dev/null
OUT=$(echo '{}' | bash "$S/distill-nudge.sh"); check "nudge: silent again below threshold" "$(is "$OUT" "")"
echo '{"distill_nudge_threshold": 2}' > "$SOUL_ROOT/config.json"
OUT=$(echo '{}' | bash "$S/distill-nudge.sh"); check "nudge: honours config threshold" "$(is "$(echo "$OUT" | jq -r .decision)" block)"
bash "$S/soul.sh" advance 21 >/dev/null
OUT=$(echo '{}' | bash "$S/distill-nudge.sh"); check "nudge: advancing the watermark clears it" "$(is "$OUT" "")"
rm -f "$SOUL_ROOT/config.json"

# --- policies ---
bash "$S/soul.sh" validate >/dev/null; check "validate: shipped seed is valid" $?
check "policies: at least 6 seeded" "$([ "$(bash "$S/soul.sh" policies | wc -l)" -ge 6 ]; echo $?)"
bash "$S/soul.sh" policy tenancy-001 | grep -q '404'; check "policy: fetches body" $?
bash "$S/soul.sh" policy nope-001 >/dev/null 2>&1; check "policy: unknown id errors" "$(is $? 1)"
check "next-id: increments" "$(is "$(bash "$S/soul.sh" next-id tenancy)" tenancy-003)"
check "next-id: new section starts at 001" "$(is "$(bash "$S/soul.sh" next-id money)" money-001)"
cp "$SOUL_SEED/risk.md" "$TMP/risk.bak"
LONG=$(printf 'x%.0s' $(seq 1 301)); sed "s/^- \`\[risk-002\]\` .*/- \`[risk-002]\` $LONG/" "$TMP/risk.bak" > "$SOUL_SEED/risk.md"
bash "$S/soul.sh" validate 2>&1 | grep -q 'statement is 301 chars'; check "validate: statement budget" $?
sed 's/`\[risk-002\]`/`[risk-001]`/' "$TMP/risk.bak" > "$SOUL_SEED/risk.md"
bash "$S/soul.sh" validate 2>&1 | grep -q 'duplicate ID'; check "validate: duplicate id" $?
cp "$TMP/risk.bak" "$SOUL_SEED/risk.md"

# --- session context ---
OUT=$(bash "$S/session-context.sh")
check "session-context: valid hook JSON" "$(is "$(echo "$OUT" | jq -r .hookSpecificOutput.hookEventName)" SessionStart)"
echo "$OUT" | jq -r .hookSpecificOutput.additionalContext | grep -q '\[tenancy-001\]'; check "session-context: lists policies" $?
OUT=$(SOUL_SEED="$TMP/empty" bash "$S/session-context.sh"); check "session-context: silent without policies" "$(is "$OUT" "")"

# --- propose, review, accept, reject, confirm ---
P='{"op":"create","id":"money-001","section_title":"Money","statement":"Money movements are keyed by reference.","why":"A retry must not move money twice.","score":4,"records":["a","b"],"rationale":"two overrides"}'
echo "$P" | bash "$S/soul.sh" propose - >/dev/null; check "propose: create queued" $?
bash "$S/soul.sh" policy money-001 >/dev/null 2>&1; check "propose: pending is not policy" "$(is $? 1)"
bash "$S/soul.sh" review | grep -q 'create money-001'; check "review: lists it" $?
bash "$S/soul.sh" accept money-001 >/dev/null; check "accept: create applied" $?
bash "$S/soul.sh" policy money-001 | grep -q 'confidence: medium'; check "accept: confidence from score" $?
bash "$S/soul.sh" validate >/dev/null; check "accept: profile still valid" $?
echo "${P/money-001/money-002}" | jq -c 'del(.section_title)' | bash "$S/soul.sh" propose - >/dev/null; check "propose: existing section needs no title" $?
bash "$S/soul.sh" reject money-002 "too narrow" >/dev/null; check "reject: ok" $?
grep -q 'money-002' "$SOUL_ROOT/rejected.md"; check "reject: reason recorded" $?
echo "${P/money-001/money-002}" | bash "$S/soul.sh" propose - >/dev/null 2>&1; check "propose: rejected id cannot be reused" "$(is $? 1)"
echo "${P/money-001/money-009}" | jq -c 'del(.section_title)|.id="newsec-001"' | bash "$S/soul.sh" propose - >/dev/null 2>&1; check "propose: new section without title fails" "$(is $? 1)"
echo '{"op":"create","id":"money-003","statement":"'"$LONG"'","why":"w"}' | bash "$S/soul.sh" propose - >/dev/null 2>&1; check "propose: over-budget rejected" "$(is $? 1)"
echo '{"op":"revise","id":"money-001","statement":"Every money movement is keyed by a reference.","rationale":"clearer"}' | bash "$S/soul.sh" propose - >/dev/null
bash "$S/soul.sh" accept money-001 >/dev/null; bash "$S/soul.sh" policy money-001 | grep -q 'Every money movement'; check "accept: revise applied" $?
bash "$S/soul.sh" confirm money-001 2 r1,r2 "held again" | grep -q 'raise money-001 medium -> high'; check "confirm: queues a raise at 6" $?
bash "$S/soul.sh" policy money-001 | grep -q 'score 6 · 4 decisions'; check "confirm: evidence updated" $?
bash "$S/soul.sh" accept money-001 >/dev/null; bash "$S/soul.sh" policy money-001 | grep -q 'confidence: high'; check "accept: raise applied" $?
bash "$S/soul.sh" validate >/dev/null; check "final: profile valid" $?
check "final: real seed untouched" "$(is "$(cat "$REAL_SEED"/*.md | shasum)" "$BEFORE")"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

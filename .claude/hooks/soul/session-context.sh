#!/bin/bash
# SessionStart hook. Injects the decision-capture contract and the reviewed policy statements, so a
# session poses real decisions through AskUserQuestion in the shape capture and distill rely on.
# Silent when there are no policies.

source "$(dirname "$0")/lib.sh"

POLICIES=$(bash "$SOUL_HOOKS_DIR/soul.sh" policies 2>/dev/null)
[ -n "$POLICIES" ] || exit 0

PENDING=$(( $(soul_log_lines) - $(soul_watermark) ))
PROPOSALS=$(find "$SOUL_PROPOSALS" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
HEADERS=$(jq -r '[.headers[].name] | join(", ")' "$SOUL_HEADERS" 2>/dev/null)

CONTEXT="SOUL decision capture is on for this repo. Every answered AskUserQuestion is logged and distilled into a decision profile, so:
- A genuine decision (real alternatives, a meaningful trade-off) goes through AskUserQuestion, not resolved silently. Mechanical or already-specified choices do not.
- 2-4 options. Put your recommendation FIRST with the label suffix \" (Recommended)\", and the why plus the trade-off in each option's description; descriptions are logged as the reasoning.
- Cite the policy ids you relied on as [id] in the recommended option's description.
- Use a canonical header when one fits: $HEADERS.
Policies (reviewed; fetch a body with \`bash $SOUL_HOOKS_DIR/soul.sh policy <id>\`):
$POLICIES
Undistilled decisions: $PENDING. Proposals awaiting review: $PROPOSALS. A pending proposal is not policy; never decide from one. Mention /soul-review once at a natural pause if any are pending, never mid-task."

jq -cn --arg c "$CONTEXT" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
exit 0

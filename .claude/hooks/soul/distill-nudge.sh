#!/bin/bash
# Stop hook. Once undistilled decisions reach distill_nudge_threshold (config.json, default 20),
# blocks the stop once and asks for a soul-distill run. stop_hook_active prevents a loop; the
# watermark advancing clears the condition.

source "$(dirname "$0")/lib.sh"

INPUT=$(cat)
[ -f "$SOUL_LOG" ] || exit 0
printf '%s' "$INPUT" | jq -e '.stop_hook_active == true' >/dev/null 2>&1 && exit 0

THRESHOLD=$(soul_config distill_nudge_threshold 20)
PENDING=$(( $(soul_log_lines) - $(soul_watermark) ))

if [ "$PENDING" -gt 0 ] && [ "$PENDING" -ge "$THRESHOLD" ]; then
  SKILL="$SOUL_CHECKOUT/.claude/skills/soul-distill/SKILL.md"
  jq -cn --arg n "$PENDING" --arg skill "$SKILL" \
    '{decision: "block", reason: ("soul: \($n) undistilled decisions. Invoke the soul-distill skill now (\($skill)), then stop.")}'
fi
exit 0

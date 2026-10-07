---
description: Deep 9-dimension review of the current branch against origin/main, validated by the advisor and ranked by severity
model: opus
allowed-tools: Bash, Read, Grep, Agent
---

# /review-deep

Run the `review-deep` skill (`.claude/skills/review-deep/SKILL.md`) on the current branch. Arguments: `$ARGUMENTS`

With no argument, review `origin/main...HEAD`. If the argument is a PR number, take the diff from `gh pr diff <n>` instead.

Follow the skill's steps in order: capture the diff, fan out 9 agents in one message, synthesize, validate with `advisor()`, then present the ranked report.

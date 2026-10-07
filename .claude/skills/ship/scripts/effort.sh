#!/bin/bash
# The stage -> model/effort table, in one place. Everything else (worker dispatch, subagent
# models, README, stage table) reads it from here. Levels are only low|medium|high.
#
# usage: effort.sh <KEY> <stage>   prints "<model> <effort> <reason>"
#        effort.sh <stage>         the same
#        effort.sh --list          one TSV row per stage, in pipeline order:
#                                  stage, model, effort, runs-in, gated, reason
set -u

ROWS=$(cat <<'TABLE'
propose|opus|high|session, or subagent under --auto-decide|no|design and task plan; the decisions everything else rests on
branch|haiku|low|background subagent|no|mechanical worktree creation through /start-branch
implement|sonnet|high|worker pane|no|the code change itself
simplify|sonnet|medium|worker pane|no|cleanup that must not change behaviour
security|opus|medium|background subagent|yes|read-only review, only when security-gate.sh triggers
review|sonnet|high|worker pane|no|the last quality check before a human looks
fix-blockers|sonnet|high|worker pane|no|blocker fixes feed straight into the PR
e2e|sonnet|medium|subagent|no|opt-in browser or API check on the local stack
push|sonnet|low|worker pane|no|commit, local checks, git push
pr|haiku|low|worker pane|no|open the draft PR from the finished branch
merge-sync|sonnet|low|worker pane|no|conflict resolution onto origin/main, only when merge-gate reports a conflict
TABLE
)

if [ "${1:-}" = --list ]; then
  printf '%s\n' "$ROWS" | awk -F'|' -v OFS='\t' '{print $1,$2,$3,$4,$5,$6}'
  exit 0
fi

STAGE=${2:-${1:-}}
LINE=$(printf '%s\n' "$ROWS" | awk -F'|' -v s="$STAGE" '$1 == s {print $2, $3, $6}')
[ -n "$LINE" ] || { echo "usage: effort.sh [KEY] $(printf '%s\n' "$ROWS" | cut -d'|' -f1 | paste -sd'|' -) | --list" >&2; exit 2; }
echo "$LINE"

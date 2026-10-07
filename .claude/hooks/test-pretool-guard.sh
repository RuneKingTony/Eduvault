#!/bin/bash
# Feeds Bash commands to pretool-guard.sh and asserts deny or allow.
set -uo pipefail

GUARD="$(cd "$(dirname "$0")" && pwd)/pretool-guard.sh"
FAILS=0

run() {  # <command> → "deny" or "allow"
  local out
  out=$(jq -nc --arg c "$1" '{tool_name: "Bash", tool_input: {command: $c}}' | bash "$GUARD")
  if jq -e '.hookSpecificOutput.permissionDecision == "deny"' <<<"$out" >/dev/null 2>&1; then echo deny; else echo allow; fi
}

expect() {  # <deny|allow> <command>
  local got
  got=$(run "$2")
  if [ "$got" = "$1" ]; then echo "ok   $1: $2"; else echo "FAIL expected $1, got $got: $2"; FAILS=$((FAILS + 1)); fi
}

expect deny 'git commit --no-verify -m "x"'
expect deny 'git commit -n -m "x"'
expect deny 'git commit -an -m "x"'
expect deny 'git push --no-verify'
expect deny 'HUSKY=0 git commit -m "x"'
expect deny 'git -c core.hooksPath=/dev/null commit -m "x"'
expect deny 'git config core.hooksPath /tmp/hooks'
expect deny 'nohup pnpm dev'
expect deny 'pnpm dev & echo started'
expect deny 'pnpm dev &'
expect deny 'sleep 5 & wait'
expect deny 'disown %1'
expect deny 'FOO=1 nohup node app.js'

expect allow 'pnpm lint && pnpm test'
expect allow 'pnpm lint || echo failed'
expect allow 'git log --oneline | head -5'
expect allow 'cmd 2>&1 | tee out.log'
expect allow 'cmd > out.log 2>&1'
expect allow 'cmd &> out.log'
expect allow 'git commit -m "fix: a & b"'
expect allow "git commit -m 'fix: a & b'"
expect allow 'git commit -m "docs: mention --no-verify is banned"'
expect allow 'echo hi # run in background &'
expect allow 'git commit -m "$(cat <<'"'"'MSG'"'"'
feat: a & b
MSG
)"'
expect allow 'git commit -m "feat: x"'
expect allow 'git status'

[ "$FAILS" -eq 0 ] && echo "all passed" || { echo "$FAILS failed"; exit 1; }

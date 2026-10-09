#!/usr/bin/env bash
# Checks the local stack is reachable before an e2e run. Never launches a browser.
# Prints an "e2e: env=local ..." line, then exits 0 (ready) or 3 (BLOCKED, cause environment).
set -u
. "$(dirname "$0")/stack-env.sh"
API="${E2E_API_URL:-http://localhost:3000}"
ADMIN="${E2E_ADMIN_URL:-http://localhost:4200}"
PORTAL="${E2E_PORTAL_URL:-http://localhost:4201}"
NEED="${1:-browser}"

up() { curl -fsS -m 3 -o /dev/null "$1" 2>/dev/null; }
MISSING=()
up "$API/health" || MISSING+=("api $API/health")
if [ "$NEED" = "browser" ]; then
  up "$ADMIN" || MISSING+=("web-admin $ADMIN")
  up "$PORTAL" || MISSING+=("web-portal $PORTAL")
fi

echo "e2e: env=local api=$API admin=$ADMIN portal=$PORTAL need=$NEED" >&2
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "BLOCKED (environment): not answering: ${MISSING[*]}. Start the stack with .claude/skills/run-local/SKILL.md" >&2
  exit 3
fi
echo "ready"

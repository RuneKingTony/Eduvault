#!/usr/bin/env bash
# Reverses what a run's ledger can still reverse through the API: campuses with nothing in them.
# Usage: cleanup.sh <absolute path to ledger.json>
# Students and money are never deleted (the product keeps them), so a run's schools, students and users stay until
# `pnpm db:reset`. It then closes the run's browser sessions.
set -u
LEDGER="${1:?usage: cleanup.sh <absolute path to ledger.json>}"
. "$(dirname "$0")/stack-env.sh"
API="${E2E_API_URL:-http://localhost:3000}"
ORIGIN="${E2E_ADMIN_URL:-http://localhost:4200}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
req() { curl -sS -m 20 -X "$1" -H "origin: $ORIGIN" -H 'content-type: application/json' -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code}' ${3:+--data "$3"} "$API$2"; }
jq -c '.[]|select(.kind=="campus")' "$LEDGER" | while read -r e; do
  id=$(jq -r .id <<<"$e"); sid=$(jq -r .schoolId <<<"$e")
  : >"$JAR"
  code=$(req POST /api/auth/sign-in/email "$(jq -c .actor <<<"$e")")
  [ "$code" = 200 ] || { echo "skip campus $id: sign-in $code"; continue; }
  req POST /api/auth/organization/set-active "$(jq -nc --arg o "$sid" '{organizationId:$o}')" >/dev/null
  code=$(req DELETE "/campuses/$id")
  case "$code" in
    2*) echo "deleted campus $id" ;;
    409) echo "kept campus $id: it still has students or fee schedules" ;;
    *) echo "FAILED $code campus $id" ;;
  esac
done
jq -r '[.[]|select(.kind=="student")]|length as $n|"kept \($n) student(s) and every school: students and money are never deleted"' "$LEDGER"
bash "$(dirname "$0")/close-sessions.sh" --run="$(dirname "$LEDGER")"

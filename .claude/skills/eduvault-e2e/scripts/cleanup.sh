#!/usr/bin/env bash
# Reverses a run's ledger through the API: students first, then schools (a campus goes with its school).
# Usage: cleanup.sh <absolute path to ledger.json>
# User accounts cannot be removed through the API and stay until `pnpm db:reset`.
set -u
LEDGER="${1:?usage: cleanup.sh <absolute path to ledger.json>}"
. "$(dirname "$0")/stack-env.sh"
API="${E2E_API_URL:-http://localhost:3000}"
ORIGIN="${E2E_ADMIN_URL:-http://localhost:4200}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
req() { curl -sS -m 20 -X "$1" -H "origin: $ORIGIN" -H 'content-type: application/json' -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code}' ${3:+--data "$3"} "$API$2"; }
SCHOOLS=$(jq -r '[.[]|select(.kind=="school")|.id]|join(" ")' "$LEDGER")
FAILED=0
for kind in student school campus; do
  jq -c --arg k "$kind" '.[]|select(.kind==$k)' "$LEDGER" | while read -r e; do
    id=$(jq -r .id <<<"$e"); sid=$(jq -r .schoolId <<<"$e")
    if [ "$kind" = campus ] && [[ " $SCHOOLS " == *" $sid "* ]]; then echo "campus $id: removed with its school"; continue; fi
    : >"$JAR"
    code=$(req POST /api/auth/sign-in/email "$(jq -c .actor <<<"$e")")
    [ "$code" = 200 ] || { echo "skip $kind $id: sign-in $code"; continue; }
    req POST /api/auth/organization/set-active "$(jq -nc --arg o "$sid" '{organizationId:$o}')" >/dev/null
    case "$kind" in
      school) code=$(req POST /api/auth/organization/delete "$(jq -nc --arg o "$id" '{organizationId:$o}')") ;;
      student) code=$(req DELETE "/students/$id") ;;
      campus) code=$(req DELETE "/campuses/$id") ;;
    esac
    case "$code" in 2*) echo "deleted $kind $id" ;; *) echo "FAILED $code $kind $id" ;; esac
  done
done

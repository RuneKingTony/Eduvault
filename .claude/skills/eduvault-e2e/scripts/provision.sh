#!/usr/bin/env bash
# Creates the e2e personas through the real API and records every school, campus and student in a ledger.
# Usage: provision.sh   prints the run directory (tmp/e2e/<run>) on stdout; personas.json and ledger.json are inside.
# admin, teacher and student are tried through invite/accept and recorded as blocked when the API refuses (see references/personas.md).
set -eu
ROOT="$(git rev-parse --show-toplevel)"
. "$(dirname "$0")/stack-env.sh"
API="${E2E_API_URL:-http://localhost:3000}"
ORIGIN="${E2E_ADMIN_URL:-http://localhost:4200}"
RUN="$(date +%m%d%H%M%S)$RANDOM"
DIR="$ROOT/tmp/e2e/$RUN"
PASSWORD='e2e-password-123'
mkdir -p "$DIR"
LC_ALL=C tr -dc a-z0-9 </dev/urandom | head -c6 >"$DIR/sid"   # names this run's playwright-cli sessions
LEDGER="$DIR/ledger.json"; echo '[]' >"$LEDGER"
PERSONAS="$DIR/personas.json"; echo '{}' >"$PERSONAS"

email() { echo "e2e-$RUN-$1@eduvault.test"; }
# call <jar> <METHOD> <path> [json]  -> body on stdout, "HTTP <status>" on stderr; fails on non-2xx
call() {
  local jar="$1" method="$2" path="$3" body="${4:-{\}}" out code
  out=$(curl -sS -m 20 -X "$method" -H "origin: $ORIGIN" -H 'content-type: application/json' \
    -b "$jar" -c "$jar" -w '\n%{http_code}' --data "$body" "$API$path")
  code="${out##*$'\n'}"; out="${out%$'\n'*}"
  case "$code" in 2*) printf '%s' "$out" ;; *) echo "$method $path -> $code $out" >&2; return 1 ;; esac
}
record() { # kind id schoolId persona
  jq --arg k "$1" --arg i "$2" --arg s "$3" --arg e "$(email "$4")" --arg p "$PASSWORD" \
    '. + [{kind:$k,id:$i,schoolId:$s,actor:{email:$e,password:$p}}]' "$LEDGER" >"$LEDGER.tmp" && mv "$LEDGER.tmp" "$LEDGER"
}
sign_up() { call "$1" POST /api/auth/sign-up/email "$(jq -nc --arg n "E2E $2" --arg e "$(email "$2")" --arg p "$PASSWORD" '{name:$n,email:$e,password:$p}')" | jq -r .user.id; }

school_for() { # key schoolLabel -> prints "<jar> <schoolId> <mainId>" after building school, campus, student
  local key="$1" label="$2" slug jar="$DIR/$1.jar" uid school main
  slug="$(echo "$label" | tr '[:upper:]' '[:lower:]')-$RUN"
  uid=$(sign_up "$jar" "$key")
  school=$(call "$jar" POST /api/auth/organization/create "$(jq -nc --arg n "$label $RUN" --arg s "$slug" '{name:$n,slug:$s}')" | jq -r .id)
  record school "$school" "$school" "$key"
  main=$(call "$jar" POST /campuses "$(jq -nc --arg n "$label Main" '{name:$n}')" | jq -r .id)
  record campus "$main" "$school" "$key"
  echo "$uid $school $main"
}
student_in() { # jar campusId school key label
  local id
  id=$(call "$1" POST /students "$(jq -nc --arg c "$2" --arg n "E2E $5 $RUN" --arg a "E2E-$5-$RUN" '{campusId:$c,fullName:$n,admissionNumber:$a}')" | jq -r .id)
  record student "$id" "$3" "$4"; echo "$id"
}

read -r OWNER_UID SCHOOL MAIN < <(school_for owner Greenfield)
OJAR="$DIR/owner.jar"
ANNEX=$(call "$OJAR" POST /campuses '{"name":"Annex"}' | jq -r .id); record campus "$ANNEX" "$SCHOOL" owner
OSTUDENT=$(student_in "$OJAR" "$MAIN" "$SCHOOL" owner owner-student)
read -r FOREIGN_UID FSCHOOL FMAIN < <(school_for foreign Riverside)
FSTUDENT=$(student_in "$DIR/foreign.jar" "$FMAIN" "$FSCHOOL" foreign foreign-student)

BLOCKED=''
for key in admin teacher student; do
  uid=''
  if [ -z "$BLOCKED" ]; then
    jar="$DIR/$key.jar"
    uid=$(sign_up "$jar" "$key")
    inv=$(call "$OJAR" POST /api/auth/organization/invite-member "$(jq -nc --arg e "$(email "$key")" --arg r "$key" --arg o "$SCHOOL" --arg t "$MAIN" '{email:$e,role:$r,organizationId:$o,teamId:$t}')" | jq -r .id)
    if ! err=$(call "$jar" POST /api/auth/organization/accept-invitation "$(jq -nc --arg i "$inv" '{invitationId:$i}')" 2>&1); then
      case "$err" in *EMAIL_VERIFICATION_REQUIRED*) BLOCKED='accepting an invitation needs a verified email and no HTTP endpoint adds a member' ;; *) echo "$err" >&2; exit 1 ;; esac
    fi
  else
    uid=''
  fi
  jq --arg k "$key" --arg e "$(email "$key")" --arg p "$PASSWORD" --arg u "$uid" --arg s "$SCHOOL" --arg c "$MAIN" --arg b "$BLOCKED" \
    '. + {($k):{email:$e,password:$p,userId:$u,schoolId:$s,campusId:$c,blocked:(if $b=="" then null else $b end)}}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
done

jq --arg o "$(email owner)" --arg f "$(email foreign)" --arg p "$PASSWORD" --arg os "$SCHOOL" --arg fs "$FSCHOOL" \
  --arg oc "$MAIN" --arg ou "$OWNER_UID" --arg fu "$FOREIGN_UID" --arg fc "$FMAIN" \
  '. + {owner:{email:$o,password:$p,userId:$ou,schoolId:$os,campusId:$oc,blocked:null},foreign:{email:$f,password:$p,userId:$fu,schoolId:$fs,campusId:$fc,blocked:null},
        ownerStudentId:"'"$OSTUDENT"'",foreignStudentId:"'"$FSTUDENT"'",annexCampusId:"'"$ANNEX"'",runId:"'"$RUN"'"}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
echo "$DIR"

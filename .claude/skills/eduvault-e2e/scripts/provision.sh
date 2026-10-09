#!/usr/bin/env bash
# Creates the e2e personas through the real API and records every school, campus and student in a ledger.
# Usage: provision.sh   prints the run directory (tmp/e2e/<run>) on stdout; personas.json and ledger.json are inside.
# Only owner and foreign can be created over HTTP today; every other persona is recorded blocked with the slice that
# unblocks it (see references/personas.md).
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
campus_in() { # jar schoolId key name -> campus id
  local id
  id=$(call "$1" POST /campuses "$(jq -nc --arg n "$4" '{name:$n}')" | jq -r .id)
  record campus "$id" "$2" "$3"; echo "$id"
}
student_in() { # jar campusId school key label -> student id
  local id
  id=$(call "$1" POST /students "$(jq -nc --arg c "$2" --arg n "E2E $5 $RUN" --arg a "E2E-$5-$RUN" '{campusId:$c,fullName:$n,admissionNumber:$a}')" | jq -r .id)
  record student "$id" "$3" "$4"; echo "$id"
}
school_for() { # key label -> prints "<userId> <schoolId>" after sign-up and school creation
  local key="$1" label="$2" slug uid school
  slug="$(echo "$label" | tr '[:upper:]' '[:lower:]')-$RUN"
  uid=$(sign_up "$DIR/$key.jar" "$key")
  school=$(call "$DIR/$key.jar" POST /api/auth/organization/create "$(jq -nc --arg n "$label $RUN" --arg s "$slug" '{name:$n,slug:$s}')" | jq -r .id)
  record school "$school" "$school" "$key"
  echo "$uid $school"
}
add_persona() { # key userId schoolId campusId
  jq --arg k "$1" --arg e "$(email "$1")" --arg p "$PASSWORD" --arg u "$2" --arg s "$3" --arg c "$4" \
    '. + {($k):{email:$e,password:$p,userId:$u,schoolId:$s,campusId:$c,blocked:null,unblocked_by:null}}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
}
block_persona() { # key slice
  jq --arg k "$1" --arg e "$(email "$1")" --arg p "$PASSWORD" --arg b "$2" \
    '. + {($k):{email:$e,password:$p,userId:"",schoolId:"",campusId:"",blocked:"no HTTP endpoint provisions this persona yet",unblocked_by:$b}}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
}

read -r OWNER_UID SCHOOL < <(school_for owner Greenfield)
OJAR="$DIR/owner.jar"
LEKKI=$(campus_in "$OJAR" "$SCHOOL" owner Lekki)
IKEJA=$(campus_in "$OJAR" "$SCHOOL" owner Ikeja)
OSTUDENT=$(student_in "$OJAR" "$LEKKI" "$SCHOOL" owner owner-student)

read -r FOREIGN_UID FSCHOOL < <(school_for foreign Hilltop)
FMAIN=$(campus_in "$DIR/foreign.jar" "$FSCHOOL" foreign Main)
FSTUDENT=$(student_in "$DIR/foreign.jar" "$FMAIN" "$FSCHOOL" foreign foreign-student)

add_persona owner "$OWNER_UID" "$SCHOOL" "$LEKKI"
add_persona foreign "$FOREIGN_UID" "$FSCHOOL" "$FMAIN"
block_persona superadmin 'M1.2'
block_persona admin 'M1.3 + M1.2'
block_persona bursar 'M1.3 + M1.2'
block_persona bursar2 'M1.3 + M1.2'
block_persona principal 'M1.3'
block_persona newhire 'M1.3'
block_persona teacher 'M1.3 (role), M2.3 (class scope)'
block_persona student 'M2.4 + M2.8'
block_persona guardian 'M2.4 + M2.8'

jq --arg os "$OSTUDENT" --arg fs "$FSTUDENT" --arg ik "$IKEJA" --arg r "$RUN" \
  '. + {ownerStudentId:$os,foreignStudentId:$fs,ikejaCampusId:$ik,runId:$r}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
echo "$DIR"

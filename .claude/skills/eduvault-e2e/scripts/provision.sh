#!/usr/bin/env bash
# Creates the e2e personas through the real API and records every school, campus and student in a ledger.
# The super admin creates each school and its owner (POST /platform/schools).
# Usage: provision.sh   prints the run directory (tmp/e2e/<run>) on stdout; personas.json and ledger.json are inside.
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
sign_in() { # jar email password
  call "$1" POST /api/auth/sign-in/email "$(jq -nc --arg e "$2" --arg p "$3" '{email:$e,password:$p}')" >/dev/null
}
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
# school_for <key> <label> -> prints "<userId> <schoolId>". The owner signs in with the temporary
# password and chooses e2e-password-123 (POST /me/password).
school_for() {
  local key="$1" label="$2" slug res school uid temp prefix
  slug="$(echo "$label" | tr '[:upper:]' '[:lower:]')-$RUN"
  prefix="$(echo "$label" | tr -dc 'A-Za-z' | cut -c1-2 | tr '[:lower:]' '[:upper:]')"
  res=$(call "$DIR/superadmin.jar" POST /platform/schools "$(jq -nc --arg n "$label $RUN" --arg s "$slug" --arg p "$prefix" --arg on "E2E $key" --arg oe "$(email "$key")" \
    '{name:$n,slug:$s,admissionPrefix:$p,city:"Lagos",ownerName:$on,ownerEmail:$oe}')") || return 1
  school=$(jq -r .school.id <<<"$res"); uid=$(jq -r .owner.id <<<"$res"); temp=$(jq -r .temporaryPassword <<<"$res")
  record school "$school" "$school" "$key"
  sign_in "$DIR/$key.jar" "$(email "$key")" "$temp" || return 1
  call "$DIR/$key.jar" POST /me/password "$(jq -nc --arg p "$PASSWORD" '{newPassword:$p}')" >/dev/null || return 1
  : >"$DIR/$key.jar"; sign_in "$DIR/$key.jar" "$(email "$key")" "$PASSWORD" || return 1
  echo "$uid $school"
}
add_persona() { # key userId schoolId campusId
  jq --arg k "$1" --arg e "$(email "$1")" --arg p "$PASSWORD" --arg u "$2" --arg s "$3" --arg c "$4" \
    '. + {($k):{email:$e,password:$p,userId:$u,schoolId:$s,campusId:$c,blocked:null,unblocked_by:null}}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
}
block_persona() { # key slice [reason]
  jq --arg k "$1" --arg e "$(email "$1")" --arg p "$PASSWORD" --arg b "$2" --arg r "${3:-no HTTP endpoint provisions this persona yet}" \
    '. + {($k):{email:$e,password:$p,userId:"",schoolId:"",campusId:"",blocked:$r,unblocked_by:$b}}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
}
add_superadmin() {
  jq --arg e "$E2E_SUPERADMIN_EMAIL" --arg p "$E2E_SUPERADMIN_PASSWORD" \
    '. + {superadmin:{email:$e,password:$p,userId:"",schoolId:"",campusId:"",blocked:null,unblocked_by:null}}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
}

# The worktree stack bootstraps its super admin; the shared stack must already have one.
sign_in "$DIR/superadmin.jar" "$E2E_SUPERADMIN_EMAIL" "$E2E_SUPERADMIN_PASSWORD" || {
  echo "provision.sh: cannot sign in as the super admin $E2E_SUPERADMIN_EMAIL. A worktree stack creates it; on the shared stack run nx run api:bootstrap-admin with these credentials, or set E2E_SUPERADMIN_EMAIL and E2E_SUPERADMIN_PASSWORD (the seed's is admin@eduvault.test / password123)." >&2
  exit 1
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
add_superadmin
for staff in admin bursar bursar2 principal newhire teacher; do
  block_persona "$staff" 'M1.3' 'no HTTP route creates staff until M1.3 (POST /members); sign-up is off'
done
block_persona student 'M2.4 + M2.8'
block_persona guardian 'M2.4 + M2.8'

jq --arg os "$OSTUDENT" --arg fs "$FSTUDENT" --arg ik "$IKEJA" --arg r "$RUN" \
  '. + {ownerStudentId:$os,foreignStudentId:$fs,ikejaCampusId:$ik,runId:$r}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
echo "$DIR"

#!/usr/bin/env bash
# Creates the e2e personas through the real API and records every school, campus and student in a ledger.
# The super admin creates each school and its owner (POST /platform/schools); the owner creates the staff (POST /members)
# and admits the students, whose admission creates the student and guardian portal logins.
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
# year_in <jar>: a school year around today; the first one makes its first term current, which admission needs.
year_in() {
  local y m
  y=$(date +%Y); m=$(date +%m)
  [ "$((10#$m))" -ge 9 ] || y=$((y - 1))
  call "$1" POST /school-years "$(jq -nc --arg n "$y/$((y + 1))" --arg s "$y-09-07" --arg e "$((y + 1))-07-23" '{name:$n,startsOn:$s,endsOn:$e}')" >/dev/null
}
class_in() { # jar campusId -> class id (a JSS1 class on the campus)
  local level
  level=$(call "$1" GET /class-levels | jq -r '[.[]|select(.code=="JSS1")][0].id')
  call "$1" POST /classes "$(jq -nc --arg l "$level" --arg c "$2" --arg n "A $RUN" '{levelId:$l,campusId:$c,name:$n}')" | jq -r .id
}
new_guardian() {
  jq -nc --arg n "Guardian $1 $RUN" \
    '[{new:{fullName:$n,phone:"08012345678",address:"1 Test Street",relationship:"mother",paysFees:true,login:{kind:"username"}}}]'
}
admit_in() {
  local res id
  res=$(call "$1" POST /students "$(jq -nc --arg c "$2" --arg f "E2E$5" --arg l "$RUN" --argjson g "$6" \
    '{firstName:$f,lastName:$l,gender:"F",dateOfBirth:"2014-03-03",classArmId:$c,guardians:$g}')") || return 1
  id=$(jq -r .student.id <<<"$res")
  record student "$id" "$3" "$4"; echo "$res"
}
student_in() { # jar classId school key label -> student id (admitted with one new username guardian)
  admit_in "$1" "$2" "$3" "$4" "$5" "$(new_guardian "$5")" | jq -r .student.id
}
login_of() { jq -r --arg w "$2" --arg f "$3" '[.logins[]|select(.who==$w)][0][$f] // empty' <<<"$1"; }
portal_in() {
  call "$DIR/$1.jar" POST /api/auth/sign-in/username "$(jq -nc --arg u "$2" --arg p "$3" '{username:$u,password:$p}')" >/dev/null || return 1
  call "$DIR/$1.jar" POST /me/password "$(jq -nc --arg p "$PASSWORD" '{newPassword:$p}')" >/dev/null || return 1
  : >"$DIR/$1.jar"
  call "$DIR/$1.jar" POST /api/auth/sign-in/username "$(jq -nc --arg u "$2" --arg p "$PASSWORD" '{username:$u,password:$p}')" >/dev/null
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
record_member() { # key memberId schoolId (the owner is the actor that can act on it)
  jq --arg k "$1" --arg i "$2" --arg s "$3" --arg e "$(email owner)" --arg p "$PASSWORD" \
    '. + [{kind:"member",persona:$k,id:$i,schoolId:$s,actor:{email:$e,password:$p}}]' "$LEDGER" >"$LEDGER.tmp" && mv "$LEDGER.tmp" "$LEDGER"
}
# staff_in <key> <display name> <schoolId> <roles json> <campus ids json> -> prints the new user id.
staff_in() {
  local key="$1" name="$2" school="$3" roles="$4" campuses="$5" res member uid temp
  res=$(call "$OJAR" POST /members "$(jq -nc --arg n "$name" --arg e "$(email "$key")" --argjson c "$campuses" \
    '{name:$n,email:$e,campusIds:$c}')") || return 1
  member=$(jq -r .member.id <<<"$res"); uid=$(jq -r .member.userId <<<"$res"); temp=$(jq -r .temporaryPassword <<<"$res")
  record_member "$key" "$member" "$school"
  if [ "$roles" != '[]' ]; then
    call "$OJAR" PUT "/members/$member/roles" "$(jq -nc --argjson r "$roles" --argjson c "$campuses" '{roles:$r,campusIds:$c}')" >/dev/null || return 1
  fi
  sign_in "$DIR/$key.jar" "$(email "$key")" "$temp" || return 1
  call "$DIR/$key.jar" POST /me/password "$(jq -nc --arg p "$PASSWORD" '{newPassword:$p}')" >/dev/null || return 1
  : >"$DIR/$key.jar"; sign_in "$DIR/$key.jar" "$(email "$key")" "$PASSWORD" || return 1
  echo "$uid"
}
add_persona() { # key userId schoolId campusId
  jq --arg k "$1" --arg e "$(email "$1")" --arg p "$PASSWORD" --arg u "$2" --arg s "$3" --arg c "$4" \
    '. + {($k):{email:$e,password:$p,userId:$u,schoolId:$s,campusId:$c,blocked:null,unblocked_by:null}}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
}
add_portal_persona() {
  jq --arg k "$1" --arg u "$2" --arg p "$PASSWORD" --arg s "$3" --arg c "$4" \
    '. + {($k):{email:"",username:$u,password:$p,userId:"",schoolId:$s,campusId:$c,blocked:null,unblocked_by:null}}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
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
year_in "$OJAR"
LEKKI_CLASS=$(class_in "$OJAR" "$LEKKI")
OSTUDENT=$(student_in "$OJAR" "$LEKKI_CLASS" "$SCHOOL" owner owner-student)
IKEJA_CLASS=$(class_in "$OJAR" "$IKEJA")
ADA_RES=$(admit_in "$OJAR" "$LEKKI_CLASS" "$SCHOOL" owner Ada "$(new_guardian Ada)")
ADA=$(jq -r .student.id <<<"$ADA_RES")
GUARDIAN_ID=$(login_of "$ADA_RES" guardian guardianId)
TOBI_RES=$(admit_in "$OJAR" "$IKEJA_CLASS" "$SCHOOL" owner Tobi \
  "$(jq -nc --arg g "$GUARDIAN_ID" '[{existingGuardianId:$g,relationship:"mother",paysFees:true}]')")
TOBI=$(jq -r .student.id <<<"$TOBI_RES")
portal_in student "$(login_of "$ADA_RES" student username)" "$(login_of "$ADA_RES" student temporaryPassword)"
portal_in guardian "$(login_of "$ADA_RES" guardian username)" "$(login_of "$ADA_RES" guardian temporaryPassword)"
portal_in tobistudent "$(login_of "$TOBI_RES" student username)" "$(login_of "$TOBI_RES" student temporaryPassword)"

read -r FOREIGN_UID FSCHOOL < <(school_for foreign Hilltop)
FMAIN=$(campus_in "$DIR/foreign.jar" "$FSCHOOL" foreign Main)
year_in "$DIR/foreign.jar"
FCLASS=$(class_in "$DIR/foreign.jar" "$FMAIN")
FSTUDENT=$(student_in "$DIR/foreign.jar" "$FCLASS" "$FSCHOOL" foreign foreign-student)

BOTH=$(jq -nc --arg a "$LEKKI" --arg b "$IKEJA" '[$a,$b]'); LEKKI_ONLY=$(jq -nc --arg a "$LEKKI" '[$a]'); IKEJA_ONLY=$(jq -nc --arg a "$IKEJA" '[$a]')
ADMIN_UID=$(staff_in admin 'E2E Tunde' "$SCHOOL" '["administrator"]' "$BOTH")
BURSAR_UID=$(staff_in bursar 'E2E Chika' "$SCHOOL" '["bursar"]' "$LEKKI_ONLY")
BURSAR2_UID=$(staff_in bursar2 'E2E Yemi' "$SCHOOL" '["bursar"]' "$IKEJA_ONLY")
PRINCIPAL_UID=$(staff_in principal 'E2E Grace' "$SCHOOL" '["teacher","principal"]' "$BOTH")
TEACHER_UID=$(staff_in teacher 'E2E Mr Obi' "$SCHOOL" '["teacher"]' "$LEKKI_ONLY")
NEWHIRE_UID=$(staff_in newhire 'E2E Kemi' "$SCHOOL" '[]' "$LEKKI_ONLY")

add_persona owner "$OWNER_UID" "$SCHOOL" "$LEKKI"
add_persona admin "$ADMIN_UID" "$SCHOOL" "$LEKKI"
add_persona bursar "$BURSAR_UID" "$SCHOOL" "$LEKKI"
add_persona bursar2 "$BURSAR2_UID" "$SCHOOL" "$IKEJA"
add_persona principal "$PRINCIPAL_UID" "$SCHOOL" "$LEKKI"
add_persona teacher "$TEACHER_UID" "$SCHOOL" "$LEKKI"
add_persona newhire "$NEWHIRE_UID" "$SCHOOL" "$LEKKI"
add_persona foreign "$FOREIGN_UID" "$FSCHOOL" "$FMAIN"
add_superadmin
add_portal_persona student "$(login_of "$ADA_RES" student username)" "$SCHOOL" "$LEKKI"
add_portal_persona guardian "$(login_of "$ADA_RES" guardian username)" "$SCHOOL" "$LEKKI"
add_portal_persona tobistudent "$(login_of "$TOBI_RES" student username)" "$SCHOOL" "$IKEJA"

jq --arg os "$OSTUDENT" --arg fs "$FSTUDENT" --arg ik "$IKEJA" --arg r "$RUN" --arg ada "$ADA" --arg tobi "$TOBI" \
  '. + {ownerStudentId:$os,foreignStudentId:$fs,ikejaCampusId:$ik,runId:$r,adaStudentId:$ada,tobiStudentId:$tobi}' "$PERSONAS" >"$PERSONAS.tmp" && mv "$PERSONAS.tmp" "$PERSONAS"
echo "$DIR"

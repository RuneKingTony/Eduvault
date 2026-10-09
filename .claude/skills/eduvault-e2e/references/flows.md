# Writing and extending flows

A flow is a list of steps you run by hand-driving two tools. There is no spec project.

| Kind         | Tool                               | Use                                                        |
| ------------ | ---------------------------------- | ---------------------------------------------------------- |
| API check    | `curl` with a persona's cookie jar | ACL, isolation, contract checks; assert exact status       |
| Browser step | the `playwright-cli` skill         | Sign-in, switching, pages; run once per SPA (:4200, :4201) |

## API check

```sh
J="$RUN_DIR/owner.jar"   # the jars written by provision.sh; sign in again for a fresh one
curl -sS -o /dev/null -w '%{http_code}\n' -b "$J" -H "origin: $E2E_ADMIN_URL" "$E2E_API_URL/students/$FOREIGN_STUDENT_ID"   # expect 404
```

Prefer status and body over text. Isolation checks assert the exact status: another school's row is **404, not 403**; a missing permission on a visible row is 403; no session is 401. Sign in as another persona with `POST /api/auth/sign-in/email` into its own jar.

## Browser step

Open a named session, go to the SPA, sign in through the real form (`Email`, `Password`, button `Sign in`) with the persona's email and password, then `snapshot` to find refs. Screenshot after every state worth looking at, named for the state: `sign-in-form`, `signed-in`, `campus-switched`. Scope the campus switcher to the header: the Students page has its own "Campus" field.

## Creating records

Create through the API as a persona, and append to the ledger straight away so cleanup reverses it:

```sh
ID=$(curl -sS -b "$J" -H "origin: $E2E_ADMIN_URL" -H 'content-type: application/json' \
  --data '{"campusId":"'"$CAMPUS"'","fullName":"E2E x '"$RUN"'","admissionNumber":"E2E-x-'"$RUN"'"}' "$E2E_API_URL/students" | jq -r .id)
jq --arg i "$ID" --arg s "$SCHOOL" --arg e "$OWNER_EMAIL" '. + [{kind:"student",id:$i,schoolId:$s,actor:{email:$e,password:"e2e-password-123"}}]' "$RUN_DIR/ledger.json" > "$RUN_DIR/l.tmp" && mv "$RUN_DIR/l.tmp" "$RUN_DIR/ledger.json"
```

Ledger kinds are `student`, `campus` and `school`. A campus is removed together with its school (deleting one alone answered 403 in testing), so a new kind of record needs a reversal in `cleanup.sh` first. Use unique admission numbers and names (`E2E-<label>-<runId>`); admission numbers are unique across schools.

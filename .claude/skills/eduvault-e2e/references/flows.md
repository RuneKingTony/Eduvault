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

Ledger kinds are `student`, `campus` and `school`. Cleanup reverses only campuses with nothing in them: students and money are never deleted, so a run's records stay in its own run-named schools until `pnpm db:reset`. Use unique names and admission numbers (`E2E-<label>-<runId>`); admission numbers are unique within a school, not across schools.

## Per-slice flow template

Each slice adds one flow here, named for the slice. Run it as the persona who does the work and keep the three checks:

1. **Happy path** in the browser as the persona who does it, with a screenshot after each state.
2. **403** for one persona without the permission, by API (`curl` with that persona's jar).
3. **404** for `foreign`, and, where the route is campus aware, for `bursar2` on a Lekki record.

A step that needs a blocked persona is listed as blocked, not skipped silently ([personas](personas.md)).

## M1.1 flows: permissions, guard and gating

Run as the staff persona in `personas.json`, or as the seeded persona of the same role when it is blocked (read-only steps only; never write to seed data).

1. **Teacher types a gated URL.** Sign in as `teacher` (seeded: `emeka.obi@greenfield.test`), open `/fees` directly. Expect the Dashboard with no message, and a nav of Dashboard, Approvals and Students only.
2. **No-roles member.** Sign in as `newhire` (seeded: `kemi.balogun@greenfield.test`). Expect only Dashboard and Approvals in the nav, "No access yet" on the Dashboard, "Member, no roles" in the user menu. "See my access" and the user menu's "My access" open the sheet that reads "Nothing yet. Ask the owner to give you a role."
3. **Owner and bursar nav.** `owner` sees Students, Fees and a Settings entry that opens Campuses. `bursar` sees Students but no Fees and no Settings.
4. **Role change on focus.** Change a persona's role row through the owner's session, switch the browser tab away and back: the open app picks up the new access on window focus. A 403 on any call also refetches it.
5. **403 names the permission.** `curl` as `newhire`: `GET /students` answers 403 `Missing permission student:read`. `GET /me/permissions` without an active school answers 403 `NoSchool`.
6. **Foreign and campus 404.** `foreign` on an `owner` student answers 404; `bursar2` (Ikeja) on a Lekki student answers 404, and `GET /students?campusId=<Lekki>` answers 404 `Campus not found`.
7. **No student delete.** `DELETE /students/<id>` as `owner` answers 404.

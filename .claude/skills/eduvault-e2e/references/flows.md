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

Create through the API as a persona (schools as the super admin through `POST /platform/schools`), and append to the ledger straight away so cleanup reverses it:

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

## M1.2 flow: sign-in, set-up and create school

The provisioned `owner` has already changed its temporary password, so this flow makes its own school and signs in as that school's new owner. Sign-up is off; accounts come from the server.

1. **Super admin lands in the console.** Sign in on web-admin as `superadmin`. Expect `/platform/schools` with the head "Eduvault platform", "Super admin console" and the nav group Platform with Schools. Screenshot it.
2. **Create a school.** Open "Create school", type a name: the slug and the admission prefix are suggested. Submit with the slug of an existing school (for example the run's `greenfield-<run>`): expect the toast "That slug is taken." with the sheet still open. Then submit a fresh slug, the owner's name and a new email: the sheet closes, the dialog "{name} created" shows the temporary password once, "Copy" works, "Done" closes it, and the list shows the school. Record the owner's email and the password, and append the school to `$RUN_DIR/ledger.json` (kind `school`, the owner as actor once they have chosen a password).
3. **The new owner chooses a password.** Sign out, sign in as that owner with the temporary password. Expect "Choose your own password" and nothing else. Nine characters shows "Use at least 10 characters."; two different passwords show "The passwords don’t match."; a valid pair reaches the Dashboard.
4. **Sign-in screen.** Signed out, the staff screen has no sign-up or forgot link and shows "Forgot your password? Ask your school owner to reset it." A wrong password and an unknown email both show "That email and password don’t match."
5. **Owner and the console.** As the new owner type `/platform/schools`: the app lands on `/`.
6. **Portal.** Sign in on web-portal as `superadmin` (no school there): "You’re not linked to a school yet" with "Sign out". The web-admin "You’re not in a school yet" screen needs a user with no membership, which no HTTP route makes before M1.3; its copy is proved by the `NoSchoolScreen` and `app.spec.tsx` unit specs.
7. **curl.** `POST /api/auth/sign-up/email` answers 400; as `superadmin` `GET /students` answers 403 `NoSchool`; as the new owner before the change `GET /students` answers 403 `MustChangePassword`; `GET /platform/schools` answers 401 without a session, 403 as `owner` and 200 as `superadmin`.

## M1.5 flow: platform console, acting and suspension

Needs the super admin, an owner with a school they can sign in to, and a second, run-named school made through `POST /platform/schools` (record it in the ledger as kind `school`). The browser steps use the run's schools; never suspend or act in seed data.

1. **Create and find the school.** As `superadmin` on `/platform/schools`: three stat cards (Schools, Students, Acting requests), a status badge per row and the students and created columns, A–Z. Create a run school through the sheet; it lists as Active with 0 students. Screenshot.
2. **Act read-only.** Open the school (the school name in its row is a button), check the Owner card, the "Acting in a school" card and "No acting requests yet", then "Act in this school". Expect the warning toast "Acting in {name}, read-only. Add a reason in the banner to allow writes.", the Dashboard with the banner "Acting in {name} / Read-only. Every request is audited." and the badge "Acting · read-only". Open Students: the list shows and **"Add student" is hidden**. The user menu has no "My access".
3. **Add a reason.** Type `E2E-<runId>` in "Reason for writes" and press "Allow writes": toast "Writes allowed. Each one is audited with your reason.", banner "Writes allowed. Reason E2E-<runId>", badge "Acting · writes on".
4. **Add a student.** On Students choose a campus (required while acting), fill the name and an `E2E-<label>-<runId>` admission number, press "Add student": the row appears. Create a campus first through Settings if the school has none.
5. **A write by curl.** Sign in as `superadmin` into a jar, then `PATCH /students/<id>` with `-H "x-eduvault-acting-org: $SCHOOL"` and `{"fullName":"E2E edited"}`: 403 `ActingReadOnly`. Repeat with `-H "x-eduvault-acting-reason: E2E-curl-$RUN"`: 200. An unknown `x-eduvault-acting-org` answers 404 `School not found`. As the school's owner the same headers are ignored: `GET /students` runs in the owner's own school.
6. **Leave.** "Back to read-only" returns the badge to read-only and hides "Add student". "Leave school" opens `/platform/schools/{id}`. While acting, `/platform/schools` and Audit log still open in the platform console. A new tab is not acting (it lands on the console); signing out ends acting; as the super admin without acting, `/students` lands on `/platform/schools`.
7. **Audit log.** Open Audit log: the acting requests newest first with time, actor, school, method and path, status and the reason, and the school page lists them under "Recent acting requests". The school select and "Writes only" narrow the list. Screenshot.
8. **Suspend.** On the school page, "More actions" then "Suspend school…" and confirm: toast "{name} suspended." and the Suspended badge. As the school's owner on web-admin and on web-portal: "{name} is paused on Eduvault" with "Check again" and "Sign out". `GET /students` as the owner answers 403 `SchoolSuspended`; a second `POST /platform/schools/{id}/suspend` answers 409. Acting still works in the suspended school.
9. **Reactivate.** "Reactivate…" and confirm: toast "{name} reactivated."; the owner's next load works.
10. **Replace owner.** "Replace owner…" with "A new person": toast "{name} is now the owner of {school}." and the temporary password dialog, shown once with "Copy" and "Done"; the school page lists the new owner and the old one is a member with no roles. Sign in as the new owner with the password: "Choose your own password".

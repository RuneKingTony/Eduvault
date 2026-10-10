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

Ledger kinds are `student`, `campus`, `member` and `school`. Cleanup reverses only campuses with nothing in them: students and money are never deleted, so a run's records stay in its own run-named schools until `pnpm db:reset`. Use unique names and admission numbers (`E2E-<label>-<runId>`); admission numbers are unique within a school, not across schools.

## Per-slice flow template

Each slice adds one flow here, named for the slice. Run it as the persona who does the work and keep the three checks:

1. **Happy path** in the browser as the persona who does it, with a screenshot after each state.
2. **403** for one persona without the permission, by API (`curl` with that persona's jar).
3. **404** for `foreign`, and, where the route is campus aware, for `bursar2` on a Lekki record.

A step that needs a blocked persona is listed as blocked, not skipped silently ([personas](personas.md)).

## M1.1 flows: permissions, guard and gating

Run as the staff persona in `personas.json`.

1. **Teacher types a gated URL.** Sign in as `teacher` , open `/fees` directly. Expect the Dashboard with no message, and a nav of Dashboard, Approvals and Students only.
2. **No-roles member.** Sign in as `newhire` . Expect only Dashboard and Approvals in the nav, "No access yet" on the Dashboard, "Member, no roles" in the user menu. "See my access" and the user menu's "My access" open the sheet that reads "Nothing yet. Ask the owner to give you a role."
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
6. **Portal.** Sign in on web-portal as `superadmin` (no school there): "You’re not linked to a school yet" with "Sign out". The web-admin "You’re not in a school yet" screen needs a user with no membership, which no HTTP route makes (a removed member keeps the account but loses the school, see the M1.3 flow); its copy is proved by the `NoSchoolScreen` and `app.spec.tsx` unit specs.
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

## M1.3 flow: staff and members

Provisioning has already created every staff persona over HTTP (`POST /members`, `PUT /members/:id/roles`). Better Auth's member and invitation routes are off.

1. **Custom role for the locked check.** Every starter role is a subset of Administrator in M1, so make one that is not. As `owner`: `POST /api/auth/organization/create-role` with `{"organizationId": "<school>", "role": "cashier", "permission": {"schoolAccount": ["update"]}, "additionalFields": {"label": "Cashier", "source": "custom"}}`, answers 200 (D-068: owner only until M1.4). Give it to `newhire` in the browser in step 2.
2. **Owner opens Staff and members.** Sign in on web-admin as `owner`, open Staff and members: the head reads "{n} people in Greenfield <run>", `newhire` shows the outline "No roles" badge, `teacher` a Teacher badge. Search "e2e chika" finds the bursar; the Role filter "Bursar" leaves `bursar` and `bursar2`. Open `newhire`, tick Cashier, Next through campuses (switch off nothing), review and "Review and save": toast "Saved. E2E Kemi now has N permissions." Screenshot each step.
3. **Add a member.** "Add member": leave Full name empty and submit, the three inline messages show. Fill a name and a fresh email, tick Lekki, "Create account": the member page opens with the callout "Account created. Temporary password …". Copy the password. Reload: the callout is gone. Append the member to the ledger (kind `member`).
4. **Give Teacher on one campus.** On the new member's page choose Teacher, Next: the campus step asks "Where will … work?", switch Ikeja off, Next, review lists "Students: can see" under "Will be able to" and "Campuses: Lekki", "Review and save": the toast confirms. The access card shows "Students: can see".
5. **Administrator sees the custom role locked.** Sign in as `admin`, open `newhire`: Cashier is checked and disabled. Open another member: "1 roles you can’t assign" lists Cashier disabled. `PUT /members/<id>/roles` with `["cashier"]` as `admin` answers 403 "You can’t give out Cashier: …" and the roles do not change.
6. **Bursar has no Staff and members.** Sign in as `bursar`: no Staff and members link and `/members` redirects to the Dashboard. By API every members route answers 403.
7. **New member's first sign-in.** Sign in as the member from step 3 with the temporary password: "Choose your own password", then the nav shows Students only.
8. **Remove.** As `owner` open the step 3 member, "Remove from school…", "Remove member": the toast reads "{name} removed." and the list drops them. That member's next request answers 403 `NoSchool`. The owner's own page has no menu (last owner).
9. **curl.** `GET /api/auth/organization/update-member-role` (and `add-member`, `invite-member`, `accept-invitation`, `remove-member`, `add-team-member`, `remove-team-member`, `leave`, `list-members`, `get-full-organization`, `get-active-member-role`, `list-user-teams`) answer 404; `foreign` on any of the school's `/members/<id>` routes answers 404; `bursar2` (Ikeja) on any `/members` route answers 403 (no `member:read`).
10. **Super admin acting.** Sign in as `superadmin`, open the run's school on `/platform/schools`, "Act in this school", then Staff and members. Read-only: the list shows with no "Add member"; a member page has no stepper, no footer, disabled switches and checkboxes and no "More actions". Type `E2E-<runId>` and "Allow writes": "Add member", the stepper and "More actions" appear, and Teacher saved through the wizard toasts "Saved. …". By curl with `x-eduvault-acting-org`: `PUT /members/<id>/roles` without a reason answers 403 `ActingReadOnly`, with `x-eduvault-acting-reason` 200; `GET /members/<foreign member>` answers 404. Screenshot the member page read-only and with writes on.
11. **Reset a password.** As `owner` open `newhire`, "More actions", "Reset password…", confirm: the dialog "New password for E2E Kemi" shows a temporary password once, "Done" closes it. By curl `newhire`'s old cookie answers 401 on `GET /me`; signing in with the new password lands on "Choose your own password" (`mustChangePassword` true). As `admin`, `POST /members/<owner member id>/reset-password` answers 403, as `owner` on the owner's own member 409 `SELF_RESET`, as `bursar` 403, as `foreign` 404. Do not reset the password of a persona a later step still needs; use `newhire` last.
12. **Edit a job title.** As `owner` open `newhire`, press the pencil "Edit job title", type `Registrar` and Save: the toast "E2E Kemi’s job title saved." shows and the header reads "Registrar · …"; Staff and members lists it under the name and the search "registrar" finds it. Clear the field and Save: the title reads "New member". By curl `PUT /members/<id>/title` answers 200 as `admin`, 403 as `bursar`, 404 as `foreign`, 400 for 81 characters.

# PRD: Sign-in and set-up

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M1.2` (staff sign-in, no sign-up, temporary passwords, change password, no-school screen, bootstrap super admin, and create school from [12](12-platform-console.md)); the `username()` plugin and portal username sign-in land in `M2.4` with the portal logins; the portal pages behind sign-in land in `M2.8` (see [roadmap](README.md))
- Related: [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (Decisions taken, Better Auth settings, Starting from an empty database, phase 2), [ADR 0002](../adr/0002-better-auth-in-nestjs.md), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-011](../technical-reference.md#decision-log), [D-015](../technical-reference.md#decision-log); shell in [10](10-app-shell-and-navigation.md); school creation in [12](12-platform-console.md)

## Summary

Nobody signs themselves up. A super admin is created once from the command line, creates each school and its owner, and the owner adds staff, students and guardians. Everyone added gets a temporary password and must choose their own at first sign-in. Staff sign in to `web-admin` with their email; students and guardians sign in to `web-portal` with a username or email. A signed-in person who belongs to no school sees a clear dead end instead of a form to create one.

## Who uses it

| Persona                       | Permission(s)                | What they can do here                                                          |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| Staff member                  | none needed                  | Sign in to `web-admin` with email and password; change a temporary password    |
| Student                       | none needed                  | Sign in to `web-portal` with `<school-slug>-<admission number>` and a password |
| Guardian                      | none needed                  | Sign in to `web-portal` with email or username; change a temporary password    |
| Signed-in user with no school | none                         | See "You’re not in a school yet" and sign out                                  |
| Super admin                   | platform role `superadmin`   | Sign in to `web-admin`; land in the platform console                           |
| Operator (developer)          | shell access to the API host | Run `nx run api:bootstrap-admin` once to create the first super admin          |

No school scope applies before sign-in. After sign-in the shell's rules apply ([10](10-app-shell-and-navigation.md)).

## Screens

### What happens after sign-in

Both apps run the same checks, in order, before the router renders:

1. No session → the app's sign-in screen.
2. `mustChangePassword` is set → "Choose your own password". Nothing else is reachable.
3. `web-admin`, platform role `superadmin` → the platform console (`/platform/schools`), unless the person is acting in a school.
4. No school membership → `web-admin`: "You’re not in a school yet"; `web-portal`: the same screen with portal wording (below).
5. Otherwise → the app's default page (Dashboard in `web-admin`; My children or Home in the portal).

Today's `web-admin` `app.tsx` shows `CreateSchoolForm` at step 4; it is removed, as is the "No account? Sign up" toggle in `SignInForm`.

### Staff sign-in

- Route: `web-admin` `/` when signed out. Phase P2. No gate.
- A centred card. Header: the Eduvault mark, "Eduvault", "Staff sign-in".
- Heading "Welcome back"; text "Sign in with the email your school added."
- Form:

  | Field    | Type     | Required | Default | Validation and message                                              |
  | -------- | -------- | -------- | ------- | ------------------------------------------------------------------- |
  | Email    | email    | yes      | empty   | Browser email check; empty → "Enter your email." (not in prototype) |
  | Password | password | yes      | empty   | Empty → "Enter your password." (not in prototype)                   |

- Button "Sign in" (primary, large). While submitting it is disabled.
- On success: the checks above.
- On wrong email or password: an `ErrorMessage` (`role="alert"`) under the fields: "That email and password don’t match." (not in prototype; one message for both cases so it doesn't confirm an email exists).
- On a banned user: "This account is switched off. Ask your school owner." (not in prototype).
- On too many attempts (Better Auth rate limit, 429): "Too many attempts. Wait a minute and try again." (not in prototype).
- There is **no sign-up link** and no "Forgot password?" link. Under the form, as plain text: "Forgot your password? Ask your school owner to reset it." (not in prototype). The owner sets a new temporary password from the member page (M1.3); the super admin does it for an owner.
- Super admins use this same screen.

### Portal sign-in

- Route: `web-portal` `/` when signed out. Phase P4a (slice M2.4, with the student and guardian logins created at admission, [D-015](../technical-reference.md#decision-log); until then the portal keeps email sign-in).
- Card header: the Eduvault mark, "Eduvault", "Students and guardians". One portal serves every school and it can't know the school before sign-in, so it uses Eduvault branding; a per-school sign-in URL is a later project.
- Heading "Sign in".
- Form:

  | Field             | Type     | Required | Default | Hint / validation                                                                                                                                |
  | ----------------- | -------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Username or email | text     | yes      | empty   | Hint: "Students: school slug + admission number. Guardians: email, or a username." Input containing `@` signs in by email, otherwise by username |
  | Password          | password | yes      | empty   | –                                                                                                                                                |

- Button "Sign in" (primary, large).
- Errors: "That username or email and password don’t match." (not in prototype); rate limit as for staff.
- No sign-up link, no forgot-password link; the same "Forgot your password? Ask your school owner to reset it." line as staff sign-in.

### Change temporary password

- Route: both apps, shown after sign-in while `mustChangePassword` is set. Phase P2. No gate beyond a session.
- Card header: in `web-admin` the Eduvault staff header; in `web-portal` the portal header (the prototype shows the portal header for both; see Prototype gaps).
- Heading "Choose your own password"; text "You signed in with a temporary password".
- Form:

  | Field                | Type     | Required | Hint                      | Validation and message                                                                                                                                                      |
  | -------------------- | -------- | -------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | New password         | password | yes      | "At least 10 characters." | Fewer than 10 → "Use at least 10 characters." (not in prototype). Same as the temporary password → "Choose a password different from the temporary one." (not in prototype) |
  | Confirm new password | password | yes      | –                         | Different → "The passwords don’t match." (not in prototype)                                                                                                                 |

- Button "Save and continue". On success the flag clears, other sessions of this user are revoked, and the post-sign-in checks continue (school or platform).
- A "Sign out" link under the form lets someone leave without changing it (not in prototype; needed so a shared device isn't stuck).

### No school assigned

- Route: `web-admin`, after sign-in, when the user has no membership and is not a super admin. Phase P2.
- Card with the staff header. Empty state (school icon, warning tone): title "You’re not in a school yet"; text "Your account exists but no school has added you. Ask the school owner to add you as a member."; button "Sign out" (`log-out`).
- Footer line: "Users can’t create schools themselves" (keep as plain text, without the prototype's config tooltip).
- `web-portal` today says "You have not been added to a school yet. Ask your school to invite you, then sign in again."; it is replaced by the same screen with the portal header and portal wording: title "You’re not linked to a school yet"; text "Ask the school to add you as a student or guardian."; button "Sign out".

### First super admin

- No UI. A one-off command on the API host:

  ```
  BOOTSTRAP_ADMIN_EMAIL=jude@eduvault.ng \
  BOOTSTRAP_ADMIN_PASSWORD=•••••••• \
  nx run api:bootstrap-admin
  ✓ superadmin created (role: superadmin)
  # running it again does nothing
  ```

- The four onboarding steps it starts: "Bootstrap super admin" → "Create school and owner" → "Owner adds staff" → "Students and guardians".
- `seed.ts` runs exactly this sequence, so seeding exercises the real onboarding flow.
- A second super admin is created the same way, by running the command again with another email.

## Business rules

1. `emailAndPassword.disableSignUp` is true. `POST /api/auth/sign-up/email` is refused for browsers and server calls alike; no screen links to it.
2. `organization.allowUserToCreateOrganization` is false. Only `POST /platform/schools` creates schools ([12](12-platform-console.md)).
3. Accounts are created only on the server with `auth.api.createUser` (system call, no headers): by `POST /platform/schools` (owner), `POST /members` (staff, M1.3), admission and guardian linking (students and guardians, M2.4), and `bootstrap-admin`. The `role` passed to `createUser` is the platform role and is never set from a school request.
4. Every account created with a temporary password has `user.mustChangePassword = true`. The flag clears only when the person sets their own password.
5. While `mustChangePassword` is true, every API route except `GET /me`, `POST /me/password` and Better Auth's sign-out answers 403 `MustChangePassword`. The SPA check is a convenience; the server rule is the guarantee.
6. A new password has at least 10 characters (`emailAndPassword.minPasswordLength: 10`) and differs from the temporary one.
7. Setting the new password revokes the user's other sessions.
8. A temporary password is generated on the server (12 random characters, letters and digits, without the look-alikes `0`/`O` and `1`/`l`, because it is read aloud or written down), returned once in the creating response, and never stored or logged in clear.
9. Staff sign in by email. Students sign in by username `<school-slug>-<admission number digits>` (`greenfield-0123`); guardians by email if they have one, otherwise by a username chosen when they are added. Username-only accounts get a placeholder email that is never shown (permissions doc, Better Auth settings).
10. Sign-in failures use one message for an unknown account and a wrong password.
11. `/api/auth/sign-in/*` has a stricter rate limit than Better Auth's default: 5 attempts per minute per IP and per account (student usernames are guessable from admission numbers). Beyond it the API answers 429.
12. A banned user (`user.banned`) cannot sign in and counts as signed out on every route (existing `AuthContextService` behaviour).
13. A signed-in user with no membership and no platform role sees "You’re not in a school yet"; every school route answers 403 `NoSchool`.
14. `bootstrap-admin` reads `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`, creates the user with platform role `superadmin` and `mustChangePassword` false, and exits successfully without changes if a super admin with that email exists. If the email belongs to a user who is not a super admin it fails with a non-zero exit and changes nothing. The bootstrap super admin is not asked to change their password, because the operator chose it.
15. A new session picks the user's first school and first campus there (existing session hook). A super admin has no membership, so their session has no active school.

## Data

- `user.mustChangePassword` (boolean, default false): a Better Auth additional field, added through `api:auth-generate` (permissions doc, phase 2). Not new to the docs.
- `user.username`: the Better Auth `username()` plugin, M2.4, with the logins created at admission ([D-015](../technical-reference.md#decision-log); permissions doc, phase 4a).
- `user.role`: the admin plugin's platform role, `superadmin` only.
- No domain tables. Migrations: the Better Auth schema change for `mustChangePassword` (then `pnpm drift:fix`).
- Config: `disableSignUp: true`, `minPasswordLength: 10`, `allowUserToCreateOrganization: false`, admin plugin `adminRoles: ['superadmin']` with its own `ac`/`roles`. New env vars `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` for the script only (added to `.env.example`, read through `loadEnv()` or the script's own schema).

## API

| Method | Path                         | Permission                                        | Request                  | Response                                                                                        | Errors                                                                                                        |
| ------ | ---------------------------- | ------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/sign-in/email`    | public (Better Auth)                              | `{ email, password }`    | session cookie                                                                                  | 401 wrong credentials; 403 banned; 429 rate limit                                                             |
| POST   | `/api/auth/sign-in/username` | public (Better Auth `username()`, M2.4)           | `{ username, password }` | session cookie                                                                                  | 401; 403; 429                                                                                                 |
| POST   | `/api/auth/sign-up/email`    | refused                                           | –                        | –                                                                                               | 400 (Better Auth "sign up is not enabled")                                                                    |
| POST   | `/api/auth/sign-out`         | signed in (Better Auth)                           | –                        | –                                                                                               | –                                                                                                             |
| GET    | `/me`                        | signed in (exists; allowed while the flag is set) | –                        | `{ user, activeOrganizationId, activeCampusId, mustChangePassword, platformRole, schoolCount }` | 401                                                                                                           |
| POST   | `/me/password`               | signed in, `mustChangePassword` true              | `{ newPassword }`        | 204                                                                                             | 400 too short or same as the temporary one (`issues`); 401; 409 `PasswordAlreadySet` when the flag is not set |
| –      | `nx run api:bootstrap-admin` | operator                                          | env vars                 | exit 0, one line                                                                                | non-zero exit if the email belongs to a non-super-admin user, or env vars are missing                         |

- `POST /me/password` exists because Better Auth's `changePassword` needs the current password and the form doesn't ask for it. Its use of Better Auth's server password-hash API is checked against 1.7.7 during the build. It sets the hash through Better Auth's server API, clears the flag, and revokes other sessions.
- Contract types (`MeResponse` additions, `ChangeTemporaryPasswordBody`) live in `@eduvault/api-contract`.

## Acceptance criteria

- Given the staff sign-in screen, when it renders, then there is no sign-up link and no "Forgot password?" link.
- Given any client, when it calls `POST /api/auth/sign-up/email`, then it is refused and no user is created.
- Given a user with a temporary password, when they sign in, then they see "Choose your own password" and nothing else.
- Given a user with `mustChangePassword`, when they call `GET /students`, then the API answers 403 `MustChangePassword`.
- Given the change form, when the new password has 9 characters, then the form shows "Use at least 10 characters." and the API would answer 400.
- Given the change form, when the two fields differ, then it shows "The passwords don’t match.".
- Given a valid new password, when they press "Save and continue", then the flag clears, other sessions are revoked, and they reach their default page.
- Given a user without the flag, when they call `POST /me/password`, then the API answers 409.
- Given a signed-in user with no membership, when `web-admin` loads, then they see "You’re not in a school yet" and "Sign out", and no create-school form.
- Given a super admin, when they sign in on the staff screen, then they land on `/platform/schools`.
- Given wrong credentials, when they submit, then the message is the same for an unknown email and a wrong password.
- Given six sign-in attempts for one account within a minute, when the sixth is sent, then the API answers 429 and the form shows "Too many attempts. Wait a minute and try again."
- Given an empty database, when the operator runs `bootstrap-admin` twice with the same email, then one super admin exists and the second run changes nothing.
- Given an existing ordinary user with the bootstrap email, when the operator runs `bootstrap-admin`, then it exits non-zero and the user's role is unchanged.
- Given a student account `greenfield-0123`, when they sign in to the portal with that username, then they are signed in (M2.4) and reach Home (from M2.8).

## Tests

- Unit:
  - `libs/auth-client`: `SignInForm` without sign-up, its error messages; `ChangePasswordForm` validation (length, match).
  - `web-admin`, `web-portal`: the post-sign-in state machine (no session, flag set, super admin, no school, ready) with a fake auth client.
  - `apps/api`: the temporary password generator (length, alphabet without look-alikes); `env.spec.ts` for the bootstrap variables.
- Integration (`api:test-integration`):
  - Sign-up refused through HTTP and through `auth.api.signUpEmail`.
  - `mustChangePassword` blocks a school route with 403 `MustChangePassword`, allows `GET /me` and `POST /me/password`; `POST /me/password` clears the flag and revokes another session; 409 when the flag is not set; 400 below 10 characters.
  - No-membership user: `/me/permissions` and a school route answer 403 `NoSchool`.
  - `bootstrap-admin` is idempotent and refuses to promote an existing ordinary user.
  - `base-test.ts` gains a server-side user helper and a super admin helper; existing specs stop using HTTP sign-up.
- E2E (required, `eduvault-e2e`): super admin bootstrap → create school → owner signs in with the temporary password → changes it → lands on Dashboard. The personas script switches from sign-up to this path.

## Open decisions

| #   | Question                                                                                                      | Options                                                                                                                                                                                                          | Recommendation                                                                                       | Confidence                                                                     | Decided |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- |
| A-1 | How does someone who forgot their password get back in before email (Resend, permissions doc phase 5) exists? | (a) "Forgot password?" link that does nothing useful yet; (b) no link; the owner sets a new temporary password from the member page (M1.3), the super admin does it for an owner                                 | (b), and add "Forgot your password? Ask your school owner to reset it." as plain text under the form | Medium: owners themselves depend on the super admin                            | Adopted |
| A-2 | How is the temporary password replaced, given Better Auth's `changePassword` needs the current one?           | (a) the SPA keeps the temporary password from sign-in in memory and passes it (fails after a reload); (b) a "Temporary password" field on the form; (c) `POST /me/password`, honoured only while the flag is set | (c)                                                                                                  | Medium: needs Better Auth's server password-hash API checked against 1.7.7     | Adopted |
| A-3 | The portal shows the school's crest and name before sign-in, but one portal serves every school               | (a) generic Eduvault branding until sign-in; (b) a per-school URL (`/s/greenfield` or a subdomain) that brands the sign-in; (c) brand after the username is typed                                                | (a) for M2.8, (b) later if schools ask                                                               | Medium: branding matters to parents, but per-school hosting is its own project | Adopted |
| A-4 | Does the bootstrap super admin have to change their password at first sign-in?                                | (a) yes; (b) no, the operator chose it                                                                                                                                                                           | (b)                                                                                                  | Medium                                                                         | Adopted |
| A-5 | How is a second super admin created?                                                                          | (a) run `bootstrap-admin` again with another email; (b) a platform screen                                                                                                                                        | (a) for now; it is idempotent per email                                                              | Medium                                                                         | Adopted |
| A-6 | What does `web-portal` show a signed-in user with no school?                                                  | (a) today's copy; (b) "You’re not linked to a school yet" / "Ask the school to add you as a student or guardian." with "Sign out"                                                                                | (b)                                                                                                  | Medium                                                                         | Adopted |
| A-7 | Rate limiting on sign-in                                                                                      | (a) Better Auth defaults; (b) a stricter rule on `/sign-in/*` (for example 5 per minute per IP and account)                                                                                                      | (b)                                                                                                  | Medium: student usernames are guessable from admission numbers                 | Adopted |
| A-8 | Temporary password format                                                                                     | (a) word plus four digits ("Lagoon-2290", as in the prototype); (b) 12+ random characters avoiding look-alikes                                                                                                   | (b); it is read aloud or written down, so drop `0/O`, `1/l`                                          | Medium                                                                         | Adopted |

## Prototype gaps noticed

- The sign-in, change-password and no-school frames are static: no error states, loading state or validation messages. Every message in this spec marked "not in prototype" is Eduvault's own copy.
- The change-password frame uses the portal's header ("Greenfield College", "Students and guardians") even though staff see it too.
- The portal sign-in shows a school's name and crest before the portal can know the school.
- "No sign-up link" and "Users can’t create schools themselves" carry config-name tooltips (`disableSignUp: true`, `allowUserToCreateOrganization: false`); the product behaviour is kept, the tooltips are not.
- The prototype doesn't show what a staff member sees on `web-portal`, or a guardian on `web-admin`; see [10](10-app-shell-and-navigation.md) S-13.
- There is no path for a forgotten password.
- "Sign out" on the no-school screen is a no-op.

## Dependencies

- M1.1 guard and `/me/permissions` (the `MustChangePassword` and `NoSchool` codes live in the same guard).
- `POST /platform/schools` ([12](12-platform-console.md)) creates the school and its first owner and ships in this slice, because turning sign-up off breaks `seed.ts`, `base-test.ts` and the e2e personas until server-side creation exists ([D-011](../technical-reference.md#decision-log); permissions doc, Starting from an empty database). Until `POST /members` (M1.3) exists, the seed and tests add staff through the server-side user helper.
- `.claude/skills/run-local` and `eduvault-e2e` updated to run `bootstrap-admin`.
- M2.4 for the `username()` plugin and portal username sign-in; M2.8 for the portal pages behind it.

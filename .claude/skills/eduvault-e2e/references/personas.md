# Personas

Created fresh each run by `scripts/provision.sh` and written to `tmp/e2e/<run>/personas.json`. Password for all: `e2e-password-123`. Email: `e2e-<run>-<key>@eduvault.test`.

| Key          | Prototype persona | School, campus                      | Roles                 | Created through                                                                         | Status                         |
| ------------ | ----------------- | ----------------------------------- | --------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| `owner`      | Funmi             | Greenfield `<run>`, Lekki and Ikeja | owner                 | `sign-up/email`, `organization/create`, `POST /campuses` twice, `POST /students`        | works                          |
| `foreign`    | Kola Ajayi        | Hilltop `<run>`, Main               | owner                 | the same calls in a second school                                                       | works                          |
| `superadmin` | Jude              | platform                            | `superadmin`          | the bootstrap admin from `run-local`                                                    | **blocked**, needs M1.2        |
| `admin`      | Tunde             | Greenfield, both                    | administrator         | `sign-up/email`, owner `invite-member` (role slug, both `teamId`s), `accept-invitation` | invite-and-accept, see below   |
| `bursar`     | Chika             | Greenfield, Lekki                   | bursar                | as `admin`                                                                              | invite-and-accept, see below   |
| `bursar2`    | Yemi              | Greenfield, Ikeja                   | bursar                | as `admin`                                                                              | invite-and-accept, see below   |
| `principal`  | Grace             | Greenfield, both                    | teacher, principal    | as `admin`                                                                              | invite-and-accept, see below   |
| `newhire`    | Kemi              | Greenfield, Lekki                   | member only, no roles | as `admin` with role `member`                                                           | invite-and-accept, see below   |
| `teacher`    | Mr Obi            | Greenfield, Lekki                   | teacher               | as `admin`; class scope comes with M2.3                                                 | invite-and-accept, see below   |
| `student`    | Ada               | Greenfield, Lekki                   | student               | the owner admits a student; the portal login comes from admission                       | **blocked**, needs M2.4 + M2.8 |
| `guardian`   | Ngozi             | Greenfield                          | guardian              | added as the paying guardian at admission, with email                                   | **blocked**, needs M2.4 + M2.8 |

The fixture also holds `ownerStudentId` (a student in Lekki), `foreignStudentId` and `ikejaCampusId`. A blocked persona has an empty `userId`, a `blocked` reason and an `unblocked_by` slice in `personas.json`.

## Staff personas: invite and accept

`provision.sh` creates each staff persona the way a school would until M1.3 ships the members screen: the persona signs up, the owner calls `POST /api/auth/organization/invite-member` with the starter role slugs and `teamId`s, and the persona calls `accept-invitation`. Roles are slugs in `member.role`; the six starter roles exist in every school from `syncStarterRoles`. Sign-up stays open until M1.2.

`accept-invitation` answers `403 EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION` unless the person's email is verified, and Eduvault has no mail transport. The API therefore reads `E2E_TRUST_INVITEES` (default `false`, refused when `NODE_ENV=production`): when `true` it sets Better Auth's `requireEmailVerificationOnInvitation` to `false`, so an invitee can accept. `stack-worktree.sh` sets it for a worktree stack; on the shared stack add `E2E_TRUST_INVITEES=true` to `apps/api/.env.local` and restart. It is the only sanctioned switch (D-066).

When the flag is off, `provision.sh` records each refused persona as blocked with the API's answer in its `blocked` field and `unblocked_by: M1.3`. A persona with an empty `userId` ran nothing.

Consequences, stated honestly in every report:

- Steps that need a blocked persona are not run and are listed as blocked in the report. The verdict is BLOCKED, cause environment. Check `personas.json` before planning a flow.
- The role matrix (teacher read-only, no-roles member sees nothing, administrator sees all campuses) is also covered by `api:test-integration` in `permissions.integration.spec.ts`.
- Do not "fix" a blocked persona by writing SQL, by calling the server API from a script that bypasses HTTP, or by editing the app's verification setting outside `E2E_TRUST_INVITEES`. Any of those changes what is under test.

## Seeded personas (read-only)

A read-only tour may sign in as a seeded Greenfield persona (password `password123`, see `.claude/skills/run-local/SKILL.md`): Funmi (owner) sees 28 students, Tunde (administrator) 28, Grace (teacher and principal) 28, Chika (bursar, Lekki) 23, Yemi (bursar, Ikeja) 5, Emeka Obi (teacher, Lekki) 23 and Kemi Balogun (member only, Lekki) none. This is how the browser checks run when the staff personas are blocked. Never write to seed data; every flow that writes uses the run's own school.

## Using a persona

`personas.json` holds each persona's email, password, ids and `blocked` reason. `provision.sh` leaves a cookie jar per persona in the run directory for `curl -b`. In the browser, sign in through the form (`Email`, `Password`, button `Sign in`); cookies are host-scoped, so a sign-in on `:4200` also signs in `:4201` within the same browser session.

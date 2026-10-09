# Personas

Created fresh each run by `scripts/provision.sh` and written to `tmp/e2e/<run>/personas.json`. Password for all: `e2e-password-123`. Email: `e2e-<run>-<key>@eduvault.test`.

| Key          | Prototype persona | School, campus                      | Roles                      | Created through                                                                  | Status                                                |
| ------------ | ----------------- | ----------------------------------- | -------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `owner`      | Funmi             | Greenfield `<run>`, Lekki and Ikeja | owner                      | `sign-up/email`, `organization/create`, `POST /campuses` twice, `POST /students` | works                                                 |
| `foreign`    | Kola Ajayi        | Hilltop `<run>`, Main               | owner                      | the same calls in a second school                                                | works                                                 |
| `superadmin` | Jude              | platform                            | `superadmin`               | the bootstrap admin from `run-local`                                             | **blocked**, needs M1.2                               |
| `admin`      | Tunde             | Greenfield, both                    | member, administrator      | `POST /members` as owner, then sign in with the temporary password               | **blocked**, needs M1.3 + M1.2                        |
| `bursar`     | Chika             | Greenfield, Lekki                   | member, bursar             | as `admin`                                                                       | **blocked**, needs M1.3 + M1.2                        |
| `bursar2`    | Yemi              | Greenfield, Ikeja                   | member, bursar             | as `admin`                                                                       | **blocked**, needs M1.3 + M1.2                        |
| `principal`  | Grace             | Greenfield, both                    | member, teacher, principal | as `admin`                                                                       | **blocked**, needs M1.3                               |
| `newhire`    | Kemi              | Greenfield, Lekki                   | member, no roles           | as `admin` with no role                                                          | **blocked**, needs M1.3                               |
| `teacher`    | Mr Obi            | Greenfield, Lekki                   | member, teacher            | as `admin`, then `class:assignTeacher` as owner                                  | **blocked**, needs M1.3 (role) and M2.3 (class scope) |
| `student`    | Ada               | Greenfield, Lekki                   | member, student            | the owner admits a student; the portal login comes from admission                | **blocked**, needs M2.4 + M2.8                        |
| `guardian`   | Ngozi             | Greenfield                          | member, guardian           | added as the paying guardian at admission, with email                            | **blocked**, needs M2.4 + M2.8                        |

The fixture also holds `ownerStudentId` (a student in Lekki), `foreignStudentId` and `ikejaCampusId`. A blocked persona has an empty `userId`, a `blocked` reason and an `unblocked_by` slice in `personas.json`.

## Blocked personas

No HTTP endpoint adds a member, creates a platform admin or admits a student with a login yet, and `accept-invitation` answers `403 EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION` because Eduvault sets `advanced.database.generateId: false` and has no mail transport. `provision.sh` no longer tries to invite and accept; it records the persona as blocked with the slice that unblocks it.

Consequences, stated honestly in every report:

- Steps that need a blocked persona are not run and are listed as blocked in the report. The verdict is BLOCKED, cause environment.
- The role matrix (teacher read-only, student no access to the roll, admin sees all campuses) is covered by `api:test-integration`, not by this skill, until an HTTP path to membership exists.
- Do not "fix" it by writing SQL, by calling the server API from a script that bypasses HTTP, or by turning on `requireEmailVerificationOnInvitation: false` in the app to make e2e pass. Any of those changes what is under test.

When a slice unblocks a persona, only `provision.sh` changes: replace its `block_persona` line with the real calls.

## Seeded personas (read-only)

A read-only tour may sign in as a seeded Greenfield persona (password `password123`, see `.claude/skills/run-local/SKILL.md`): Funmi sees 28 students, Chika 23 (Lekki only) and Yemi 5 (Ikeja only). Never write to seed data; every flow that writes uses the run's own school.

## Using a persona

`personas.json` holds each persona's email, password, ids and `blocked` reason. `provision.sh` leaves a cookie jar per persona in the run directory for `curl -b`. In the browser, sign in through the form (`Email`, `Password`, button `Sign in`); cookies are host-scoped, so a sign-in on `:4200` also signs in `:4201` within the same browser session.

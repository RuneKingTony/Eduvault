# Personas

Created fresh each run by `scripts/provision.sh` and written to `tmp/e2e/<run>/personas.json`. Password for all: `e2e-password-123`. Email: `e2e-<run>-<key>@eduvault.test`.

| Key       | School             | Role in it | Campuses                        | Created through                                                                  | Status                  |
| --------- | ------------------ | ---------- | ------------------------------- | -------------------------------------------------------------------------------- | ----------------------- |
| `owner`   | Greenfield `<run>` | owner      | Main Campus and Annex (creator) | `sign-up/email`, `organization/create`, `POST /campuses` twice, `POST /students` | works                   |
| `foreign` | Riverside `<run>`  | owner      | Riverside Campus                | the same four calls in a second school                                           | works                   |
| `admin`   | Greenfield         | admin      | Main Campus                     | `invite-member` then `accept-invitation`                                         | **BLOCKED** (see below) |
| `teacher` | Greenfield         | teacher    | Main Campus only                | `invite-member` then `accept-invitation`                                         | **BLOCKED**             |
| `student` | Greenfield         | student    | Main Campus                     | `invite-member` then `accept-invitation`                                         | **BLOCKED**             |

The fixture also holds `ownerStudentId` (a student in Main Campus), `foreignStudentId` and `annexCampusId`.

## Why admin, teacher and student are blocked

`accept-invitation` answers `403 EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION`. Better Auth requires a verified email for invitation actions when ids are not its own opaque ids, and Eduvault sets `advanced.database.generateId: false`. The app has no mail transport, so the email cannot be verified, and `addMember` exists only as a server call, not an HTTP route. The integration tests use the server call; the seed script does too.

Consequences, stated honestly in every report:

- Steps that need those three personas are not run and are listed as blocked in the report. The verdict is BLOCKED, cause environment.
- The role matrix (teacher read-only, student no access to the roll, admin sees all campuses) is covered by `api:test-integration`, not by this skill, until an HTTP path to membership exists.
- Do not "fix" it by writing SQL, by calling the server API from a script that bypasses HTTP, or by turning on `requireEmailVerificationOnInvitation: false` in the app to make e2e pass. Any of those changes what is under test. If the product should allow it, that is an ADR-level decision for the team.

When membership becomes possible over HTTP, only the invite/accept loop in `provision.sh` changes; the `blocked` field already handles both cases.

## Using a persona

`personas.json` holds each persona's email, password, ids and `blocked` reason. `provision.sh` leaves a cookie jar per persona in the run directory for `curl -b`. In the browser, sign in through the form (`Email`, `Password`, button `Sign in`); cookies are host-scoped, so a sign-in on `:4200` also signs in `:4201` within the same browser session.

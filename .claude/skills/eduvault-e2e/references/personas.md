# Personas

Created fresh each run by `scripts/provision.sh` and written to `tmp/e2e/<run>/personas.json`. Password for all: `e2e-password-123`. Email: `e2e-<run>-<key>@eduvault.test`.

| Key          | Prototype persona | School, campus                      | Roles                 | Created through                                                                                                                    | Status                         |
| ------------ | ----------------- | ----------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `owner`      | Funmi             | Greenfield `<run>`, Lekki and Ikeja | owner                 | `POST /platform/schools` as the super admin, then sign-in with the temporary password and `POST /me/password`; `POST /campuses` x2 | works                          |
| `foreign`    | Kola Ajayi        | Hilltop `<run>`, Main               | owner                 | the same calls in a second school                                                                                                  | works                          |
| `superadmin` | Jude              | platform                            | `superadmin`          | `bootstrap-admin` (a worktree stack runs it on `up`; the shared stack needs it done once)                                          | works                          |
| `admin`      | Tunde             | Greenfield, both                    | administrator         | `POST /members` as the owner, then `PUT /members/:id/roles`; sign-in with the temporary password and `POST /me/password`           | works                          |
| `bursar`     | Chika             | Greenfield, Lekki                   | bursar                | as `admin`                                                                                                                         | works                          |
| `bursar2`    | Yemi              | Greenfield, Ikeja                   | bursar                | as `admin`                                                                                                                         | works                          |
| `principal`  | Grace             | Greenfield, both                    | teacher, principal    | as `admin`                                                                                                                         | works                          |
| `newhire`    | Kemi              | Greenfield, Lekki                   | member only, no roles | `POST /members` as the owner, no roles added                                                                                       | works                          |
| `teacher`    | Mr Obi            | Greenfield, Lekki                   | teacher               | as `admin`; class scope comes with M2.3                                                                                            | works                          |
| `student`    | Ada               | Greenfield, Lekki                   | student               | the owner admits a student; the portal login comes from admission                                                                  | **blocked**, needs M2.4 + M2.8 |
| `guardian`   | Ngozi             | Greenfield                          | guardian              | added as the paying guardian at admission, with email                                                                              | **blocked**, needs M2.4 + M2.8 |

The fixture also holds `ownerStudentId` (a student in Lekki), `foreignStudentId` and `ikejaCampusId`. A blocked persona has an empty `userId`, a `blocked` reason and an `unblocked_by` slice in `personas.json`.

## The super admin and the owners

Sign-up is off and no HTTP route makes an account except `POST /platform/schools`, so `provision.sh` starts from the stack's super admin. `stack-env.sh` exports `E2E_SUPERADMIN_EMAIL` (default `e2e-superadmin@eduvault.test`) and `E2E_SUPERADMIN_PASSWORD` (default `e2e-password-123`). `stack-worktree.sh up` creates that account with `bootstrap-admin` after migrating, so a worktree stack always has it. On the shared stack run `nx run api:bootstrap-admin` once with the same credentials, or export the seed's (`E2E_SUPERADMIN_EMAIL=admin@eduvault.test E2E_SUPERADMIN_PASSWORD=password123`); without a working super admin `provision.sh` stops and says so.

For each school the super admin posts `POST /platform/schools` with the school, the admission prefix and an owner name and email. The response carries the owner's temporary password once. `provision.sh` signs the owner in with it and calls `POST /me/password` with `e2e-password-123`, so **`owner` and `foreign` have already changed their password** and a flow that needs the "Choose your own password" screen must create its own school and sign in as that school's new owner (see the M1.2 flow in [flows](flows.md)).

## Staff personas

The owner creates `admin`, `bursar`, `bursar2`, `principal`, `teacher` and `newhire` over HTTP: `POST /members` (name, email, job title, campuses) answers the temporary password once, `PUT /members/:id/roles` gives the roles (`newhire` gets none), and each persona signs in with the temporary password and chooses `e2e-password-123` through `POST /me/password`. `provision.sh` records every member in the ledger (kind `member`, the owner as actor). Better Auth's own member and invitation routes are switched off (D-094), so nothing else creates them.

Only `student` and `guardian` stay blocked, with `unblocked_by: M2.4 + M2.8`:

- Steps that need a blocked persona are not run and are listed as blocked in the report. The verdict is BLOCKED, cause persona. Check `personas.json` before planning a flow.
- Do not "fix" a blocked persona by writing SQL, by calling the server API from a script that bypasses HTTP, or by turning sign-up back on. Any of those changes what is under test.

## Seeded personas (read-only)

A read-only tour may sign in as a seeded Greenfield persona (password `password123`, see `.claude/skills/run-local/SKILL.md`): Funmi (owner) sees 28 students, Tunde (administrator) 28, Grace (teacher and principal) 28, Chika (bursar, Lekki) 23, Yemi (bursar, Ikeja) 5 and Emeka Obi (teacher, Lekki) 23. A seeded persona is still the way to read a school with 28 students and many members. The seed's super admin `admin@eduvault.test` (password `password123`) has no school and lands in the platform console; Kemi Balogun arrives on a temporary password and sees the "Choose your own password" screen, so she cannot be used for the role checks until she has changed it. Never write to seed data; every flow that writes uses the run's own school.

## Using a persona

`personas.json` holds each persona's email, password, ids and `blocked` reason. `provision.sh` leaves a cookie jar per persona in the run directory for `curl -b`. In the browser, sign in through the form (`Email`, `Password`, button `Sign in`); cookies are host-scoped, so a sign-in on `:4200` also signs in `:4201` within the same browser session.

# PRD: Platform console and acting in a school

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M1.2` (Create a school, with the owner, starter roles, admission prefix and default levels), because sign-up is switched off in the same change ([D-011](../technical-reference.md#decision-log)); `M1.5` (stat cards, school detail, suspend and reactivate, replace owner, acting in a school, audit log) (see [roadmap](README.md))
- Related: [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (Decisions taken, Super admin, Endpoints, New tables and fields, phases 2–3), [data-model-overview.md](../brainstorming/data-model-overview.md) (Foundation model: school profile fields), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-006](../technical-reference.md#decision-log), [D-010](../technical-reference.md#decision-log), [D-011](../technical-reference.md#decision-log), [D-019](../technical-reference.md#decision-log), [D-034](../technical-reference.md#decision-log), [D-037](../technical-reference.md#decision-log); shell in [10](10-app-shell-and-navigation.md); sign-in in [11](11-sign-in-and-setup.md)

## Summary

The platform console is where Eduvault's own staff (super admins) create schools with their first owner, see every school, suspend or reactivate one, and replace an owner. When a school needs support, a super admin acts inside it: read-only until they give a reason, and every request they make is written to an audit log they can review.

## Who uses it

| Persona                         | Permission(s)                                               | What they can do here                                                                              |
| ------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Super admin (Jude)              | platform role `superadmin`                                  | Everything on `/platform/*`; act in any school                                                     |
| Super admin acting, no reason   | every `read` and `readAll` action; all campuses and classes | Read the school's screens; every request audited                                                   |
| Super admin acting, with reason | every permission (owner-level)                              | Read and write; every request audited with the reason                                              |
| Anyone else                     | –                                                           | Nothing: `/platform/*` redirects in the SPA and answers 403 on the API; acting headers are ignored |

Platform routes are not school-scoped. Inside a school, an acting super admin's queries filter by the acted school and `campusScope: 'all'`; rows of other schools still answer 404.

## Screens

The console uses the `web-admin` shell with the platform head ("Eduvault platform", "Super admin console") and one nav group, "Platform" ([10](10-app-shell-and-navigation.md)).

### Schools

- Route `/platform/schools`, nav group Platform, first item, phase P2, gate `superadmin`. The console's default page.
- Header: title "Schools"; description "{n} schools on Eduvault"; info tip "Only a super admin creates schools."; action "Create school" (primary, `plus`).
- Stat cards, in order:

  | Label           | Value                             | Sub-line              | Click     |
  | --------------- | --------------------------------- | --------------------- | --------- |
  | Schools         | number of schools                 | "{n} active"          | –         |
  | Students        | students on the roll, all schools | "Across every school" | –         |
  | Acting requests | number of audit rows              | "All audited"         | Audit log |

- Table (10 per page, sorted by school name A–Z; a search box on name and slug appears once there are more than 10 schools):

  | Column   | Content                                                  |
  | -------- | -------------------------------------------------------- |
  | School   | crest (logo or initials), name, slug in mono             |
  | Owner    | avatar, owner name, owner email (first owner if several) |
  | City     | city                                                     |
  | Students | students on the roll (right-aligned)                     |
  | Status   | "Active" or "Suspended" status badge                     |
  | Created  | date ("12 Aug 2026")                                     |

  Choosing a school's name (a button, so the keyboard reaches it) opens the school. The prototype has no filters or search.

- Empty (no schools yet): "Nothing here yet" (the table default; see Prototype gaps).

#### Create a school (sheet)

- Opened by "Create school". Title "Create a school"; description "The school, its owner and six starter roles are created in one step." (the prototype says five; Principal is a ready-made role, [D-010](../technical-reference.md#decision-log))
- Fields (the prototype pre-fills demo values; the product starts empty):

  | Field            | Type       | Required | Hint / validation                                                                                                                                                                                                                                     |
  | ---------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | School name      | text       | yes      | 2–120 characters                                                                                                                                                                                                                                      |
  | Slug             | text, mono | yes      | Hint: "Fixed in practice: student usernames are slug + admission number." Lowercase letters, digits and hyphens, 3–40 characters; message "Use lowercase letters, numbers and hyphens." (not in prototype). Suggested from the name as it is typed    |
  | City             | text       | no       | –                                                                                                                                                                                                                                                     |
  | Admission prefix | text, mono | yes      | Hint: "Starts every admission number, for example GF-0123." 2–6 uppercase letters; message "Use 2 to 6 capital letters." (not in prototype). Suggested from the initials of the name as it is typed ([D-019](../technical-reference.md#decision-log)) |
  | (separator)      |            |          |                                                                                                                                                                                                                                                       |
  | Owner name       | text       | yes      | –                                                                                                                                                                                                                                                     |
  | Owner email      | email      | yes      | Valid email                                                                                                                                                                                                                                           |

- Buttons: "Cancel" (ghost), "Create school" (primary, `plus`).
- Slug already used: toast "That slug is taken." (danger); the sheet stays open.
- On success the sheet closes, the list refreshes, and the owner's temporary password is shown **once** in a dialog with a copy button (the prototype shows it in a toast: "**{name}** created. Owner temporary password `{password}`."; see Prototype gaps). Dialog title "{name} created", text "Give the owner this temporary password. They choose their own at first sign-in. It won’t be shown again." (not in prototype), the email and password, "Copy", "Done".

### School

- Route `/platform/schools/$schoolId`, detail of Schools (marks Schools active), phase P2 (acting P3), gate `superadmin`.
- Breadcrumb "Schools › {name}". Header: title the school name, a status badge ("Active" / "Suspended"), description "{city} · created {date}".
- Primary action "Act in this school" (`eye`), tooltip "Opens web-admin read-only; every request is audited".
- Overflow menu ("More actions"): "Replace owner…" (`user-cog`); separator; "Suspend school…" (`ban`, destructive) when active, or "Reactivate…" (`refresh-cw`) when suspended.
- Cards, two columns on desktop:
  - **Owner** (`key-round`): avatar, owner name, owner email. One block per owner if there are several.
  - **Acting in a school** (`shield`), three lines:
    - "Read-only by default" / "Every read and read-all permission, all campuses."
    - "Writes need a reason" / "Give a reason, such as a ticket number, to make changes." (the prototype's "Sent as X-Eduvault-Acting-Reason; then owner-level." is developer wording)
    - "Everything is audited" / "Actor, school, method, path, status, reason, time."
- **Recent acting requests** card (`history`, full width): the audit table (below) for this school, newest 8 rows, empty "No acting requests yet".
- Not found: "School not found" / "We couldn’t find that school" / "It may have been moved, or it may belong to a campus or class you don’t look after." / "Go back" (opens Schools). The not-found text is the shared one; see Prototype gaps.

#### Suspend dialog

- Title "Suspend {name}?"; description "Staff, students and guardians can’t sign in while the school is suspended. No data changes."
- Warning callout: "Use this for unpaid subscriptions or a security incident. The audit log records who suspended it."
- Buttons "Cancel" (ghost), "Suspend school" (destructive).
- Toast "{name} suspended." (warning).

#### Reactivate dialog

- Title "Reactivate {name}?"; description "Everyone can sign in again."
- Info callout: "Reactivating is immediate."
- Buttons "Cancel", "Reactivate" (primary).
- Toast "{name} reactivated." (success; the prototype prints "{name} active.").

#### Replace owner dialog

- The prototype only shows a toast: "Replacing an owner adds the new owner first, then removes the old one, so the school never has zero owners." The product uses a dialog (not in prototype):
  - Title "Replace the owner of {name}"; description "The new owner is added first, then the old owner loses the owner role. The school is never without an owner."
  - Fields: "New owner" as a choice between "Someone already in this school" (a member picker) and "A new person" (Name, Email); "What happens to {old owner}" radio: "Stays as a member with no roles" (default) or "Is removed from the school".
  - Buttons "Cancel", "Replace owner" (primary).
  - Success toast: "{new owner} is now the owner of {name}." For a new person, the temporary-password dialog from Create a school.

### Audit log

- Route `/platform/audit`, nav group Platform, second item, phase P3, gate `superadmin`.
- Header: title "Audit log"; description "Every request a super admin makes while acting inside a school, and every platform action."; info tip "Reads are logged too. Rows are kept until a retention period is agreed."
- Table (newest first, cursor-paged, 10 per page):

  | Column  | Content                                                                         |
  | ------- | ------------------------------------------------------------------------------- |
  | Time    | `YYYY-MM-DD HH:mm`, mono                                                        |
  | Actor   | avatar and name, for example "Jude (super admin)"                               |
  | School  | school name                                                                     |
  | Request | method badge (GET, HEAD and OPTIONS neutral, others highlighted) and path, mono |
  | Status  | the HTTP status as a badge: green below 300, red otherwise                      |
  | Reason  | the reason in code style, or "—"                                                |

- Empty: "No acting requests yet".
- Filters (not in the prototype): a school select ("All schools" by default) and a "Writes only" switch, because every read is logged and the table grows fast.

### Acting in a school

- Starts from "Act in this school". The SPA stores the acted school, opens the school's `web-admin` shell on Dashboard, and shows the toast "Acting in **{name}**, read-only. Add a reason in the banner to allow writes." (warning).
- The acting banner and badge, the reason form, "Allow writes" (toast "Writes allowed. Each one is audited with your reason."), "Back to read-only" and "Leave school" are specified in [10](10-app-shell-and-navigation.md), State 5.
- "Leave school" ends acting and opens `/platform/schools/{that school}`.
- While acting, the school's nav, settings, bell and command menu follow the acting permissions. The user menu has no "My access".

## Business rules

1. Only users with platform role `superadmin` (admin plugin, `adminRoles: ['superadmin']`) reach `/platform/*`. The SPA's `/platform` route checks it in `beforeLoad` and redirects others to `/`; the API's `PlatformAuthGuard` answers 403 to others.
2. A super admin is never also a member of a school. They reach school data only by acting.
3. Creating a school runs these steps in order: `auth.api.createUser` for the owner (temporary password, `mustChangePassword: true`), `createOrganization({ userId })` as a system action, a `school_account` row (name, city, `admission_prefix`, currency `NGN`, editable later in School profile), and, in `afterCreateOrganization` with a direct Kysely write, the starter roles and the default level ladder (Primary 1–6, JSS 1–3, SS 1–3, with next levels and SS 3 final; see [31](31-classes.md)) ([D-011](../technical-reference.md#decision-log)). Better Auth's calls are not inside a Kysely transaction, so a failure after them is compensated: the organization and the owner just created (only if this request created the owner) are deleted, and the request answers 500. Whether Better Auth 1.7.7's adapter can join a caller's transaction instead is checked during the build.
4. The starter roles are `administrator`, `teacher`, `bursar`, `principal`, `student`, `guardian` (six; Principal is ready-made, [D-010](../technical-reference.md#decision-log)). Each holds the permissions that have landed in the permission list when the school is created; each later slice's migration backfills starter roles the school hasn't edited ([21](21-roles-and-permissions.md), RP-11). `student` and `guardian` gain the portal permissions from M2.8.
5. The slug is Better Auth's `organization.slug`: unique across Eduvault, lowercase letters, digits and hyphens, 3–40 characters. It can't be changed from the console (student usernames are built from it).
6. If the owner email already belongs to a user (an owner of another school, or a guardian), that user becomes the owner and no temporary password is created: one account works across schools.
7. Suspending sets `school_account.suspended_at` and `suspended_by` ([D-037](../technical-reference.md#decision-log)). While suspended, every school route for that school answers 403 `SchoolSuspended` for its members, and both apps show a screen: "{school} is paused on Eduvault. Contact the school for details." with "Check again" (refetches who the person is), "Sign out", and a school switcher when the person belongs to other schools. Sign-in itself still works, because a user may belong to other schools.
8. Reactivating clears `suspended_at` and takes effect on the next request.
9. Replacing an owner adds the new owner first, then removes the `owner` role from the old one, in one transaction. The school always has at least one owner. The new owner loses `administrator` and `principal` if they held them (one-senior-role rule, D-006).
10. Acting is requested with the header `X-Eduvault-Acting-Org: {organizationId}`. It is honoured only for `superadmin` and silently ignored for anyone else. An unknown school answers 404.
11. Acting without a reason grants every `read` and `readAll` action in the permission list, `campusScope: 'all'` and `classScope: 'all'`. `readOwn` actions are not granted.
12. A write (`POST`, `PUT`, `PATCH`, `DELETE`) while acting needs `X-Eduvault-Acting-Reason` (1–200 characters, sent percent-encoded because header values are Latin-1 only; the length counts the decoded text, and malformed encoding answers 400). Without it the API answers 403 `ActingReadOnly`. With it, the request runs with every permission.
13. Self-approval still applies while acting: the acting super admin is the `approved_by` and must differ from `created_by`.
14. **Every** acting request, reads and refused writes included, writes one `audit_log` row after the response: actor, school, method, path without its query string, response status, reason (null when absent), time. The row is written even when the handler throws.
15. Platform actions also write `audit_log` rows with kind `platform` and an `action` ([D-037](../technical-reference.md#decision-log)): create school, suspend, reactivate, replace owner. This is how "The audit log records who suspended it" holds.
16. Audit rows are never updated or deleted by the application. They are kept indefinitely until a retention period is agreed with the first school contract.
17. A suspended school can still be acted in (support during an incident).
18. Starting to act needs no reason; read-only acting is always allowed. The reason is entered once and kept for the acting session until "Back to read-only" or "Leave school".
19. The acting state lives in the SPA (`sessionStorage`, per tab) and is attached as headers by the API client; it ends on "Leave school", sign-out or closing the tab. A super admin who opens a school route without acting is sent to `/platform/schools`.
20. Platform statistics count across schools under `PlatformAuthGuard` only; no school route exposes cross-school numbers.

## Data

- Existing: Better Auth `organization` (name, slug), `member`, `user.role`; domain `school_account`.
- Profile fields: the overview puts `slug` and `city` on `school_account`. `organization.slug` already exists and is unique, so the slug lives there only, and `slug` is dropped from the overview's `school_account` list; `city` is added to `school_account`.
- **New columns (not in the data-model docs):** `school_account.city TEXT` (listed in the overview, not yet migrated), `school_account.admission_prefix TEXT NOT NULL` (2–6 uppercase letters, [D-019](../technical-reference.md#decision-log); read by admission, [41](41-admission.md)), `school_account.suspended_at TIMESTAMPTZ`, `school_account.suspended_by TEXT REFERENCES "user"(id)` ([D-037](../technical-reference.md#decision-log)).
- **`audit_log`** (permissions doc, phase 3) with two additions, `kind` and `action` ([D-037](../technical-reference.md#decision-log)):

  | Column            | Type                                 | Notes                                                                                                      |
  | ----------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
  | `id`              | UUID                                 |                                                                                                            |
  | `kind`            | TEXT CHECK in (`acting`, `platform`) | **new**: platform actions are logged too                                                                   |
  | `actor_user_id`   | TEXT NOT NULL → `user`               |                                                                                                            |
  | `organization_id` | TEXT → `organization`, nullable      | **nullable is new**: a failed create-school has no school; FK `ON DELETE RESTRICT`                         |
  | `method`          | TEXT, nullable                       | HTTP method for `acting` rows; null for `platform` rows                                                    |
  | `action`          | TEXT, nullable                       | **new**: `school.create`, `school.suspend`, `school.reactivate`, `school.replaceOwner`; platform rows only |
  | `path`            | TEXT                                 | the path only, never the query string                                                                      |
  | `status`          | SMALLINT                             |                                                                                                            |
  | `reason`          | TEXT, nullable                       |                                                                                                            |
  | `created_at`      | TIMESTAMPTZ                          | index `(organization_id, created_at DESC)` and `(created_at DESC)`                                         |

- `audit_log` is platform data, not school data: no school route reads it, so it gets a cross-school isolation test of a different kind (a school member can't reach it at all).
- Migrations: in M1.2, one dbmate migration for `school_account.city` and `admission_prefix`; in M1.5, one for `suspended_at`, `suspended_by` and `audit_log`. The Better Auth admin-plugin role config needs no schema change. Then `pnpm drift:fix`.

## API

| Method | Path                                          | Permission                         | Request                                                                              | Response                                                                                                                                                                                                                         | Errors                                                                    |
| ------ | --------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/platform/schools`                           | `superadmin`                       | `?q&cursor`                                                                          | `{ items: PlatformSchool[], totals: { schools, active, students, actingRequests }, nextCursor }`; `PlatformSchool = { id, name, slug, admissionPrefix, city, owners: {id,name,email}[], students, campuses, status, createdAt }` | 401; 403                                                                  |
| POST   | `/platform/schools`                           | `superadmin`                       | `{ name, slug, admissionPrefix, city?, ownerName, ownerEmail }`                      | `{ school: PlatformSchool, owner: { id, email }, temporaryPassword: string \| null }`                                                                                                                                            | 400 validation (`issues`); 401; 403; 409 slug taken                       |
| GET    | `/platform/schools/options`                   | `superadmin`                       | –                                                                                    | `{ items: { id, name }[] }`, every school A–Z, no paging (the audit log's school select)                                                                                                                                         | 401; 403                                                                  |
| GET    | `/platform/schools/:id/members`               | `superadmin`                       | –                                                                                    | `{ items: { memberId, userId, name, email, roles }[] }` (the replace-owner picker)                                                                                                                                               | 401; 403; 404                                                             |
| GET    | `/platform/schools/:id`                       | `superadmin`                       | –                                                                                    | `PlatformSchool`                                                                                                                                                                                                                 | 401; 403; 404                                                             |
| POST   | `/platform/schools/:id/suspend`               | `superadmin`                       | –                                                                                    | `PlatformSchool`                                                                                                                                                                                                                 | 401; 403; 404; 409 already suspended                                      |
| POST   | `/platform/schools/:id/reactivate`            | `superadmin`                       | –                                                                                    | `PlatformSchool`                                                                                                                                                                                                                 | 401; 403; 404; 409 not suspended                                          |
| PUT    | `/platform/schools/:id/owner`                 | `superadmin`                       | `{ newOwner: { memberId } \| { name, email }, previousOwner: 'member' \| 'remove' }` | `{ school: PlatformSchool, temporaryPassword: string \| null }`                                                                                                                                                                  | 400; 401; 403; 404 school or member; 409 new owner already the only owner |
| GET    | `/platform/audit`                             | `superadmin`                       | `?schoolId&writesOnly&cursor`                                                        | `{ items: AuditRow[], nextCursor }`                                                                                                                                                                                              | 401; 403; 404 unknown `schoolId`                                          |
| any    | any school route with `X-Eduvault-Acting-Org` | `superadmin` (else header ignored) | optional `X-Eduvault-Acting-Reason`                                                  | the route's own response                                                                                                                                                                                                         | 404 unknown school; 403 `ActingReadOnly` on a write without a reason      |

- `PlatformAuthGuard` checks the admin plugin's `user.role`. The acting headers are resolved in `AuthContextService` before `OrganizationAuthGuard`'s permission check, so the same `@OrganizationAuth(resource, action)` decorators work; an audit interceptor writes the row after the response.
- `/me/permissions` honours the acting headers and returns the acting state ([10](10-app-shell-and-navigation.md), [D-034](../technical-reference.md#decision-log)).
- Contract types (`PlatformSchool`, `AuditRow`, the request bodies) live in `@eduvault/api-contract`.

## Acceptance criteria

- Given a super admin, when they open `/platform/schools`, then they see every school with owner, city, students, status and created date, and the three stat cards.
- Given a school owner, when they open `/platform/schools`, then the SPA redirects to `/` and `GET /platform/schools` answers 403.
- Given the create sheet, when the slug is taken, then the API answers 409, the toast reads "That slug is taken." and the sheet stays open.
- Given valid input, when the super admin creates a school, then the organization, its owner (with `mustChangePassword`), the `school_account` row with its admission prefix, the six starter roles (including `principal`) and the default levels exist, the temporary password is shown once, and an `audit_log` row of kind `platform` is written.
- Given a failure while inserting the starter roles, when create-school runs, then the organization and the newly created owner are deleted again and the API answers 500.
- Given an active school, when the super admin suspends it, then its members' school routes answer 403 `SchoolSuspended`, sign-in still works, they see the "paused on Eduvault" screen, and the audit log has the suspension.
- Given the audit log with acting reads and writes, when the super admin switches on "Writes only" and picks a school, then only that school's non-GET requests show.
- Given a suspended school, when it is reactivated, then the next request from its members succeeds.
- Given a school with one owner, when the owner is replaced, then the new owner holds `owner` before the old one loses it, and the school never has zero owners.
- Given a super admin acting without a reason, when they `GET /students`, then they see every campus's students, and one audit row with status 200 and reason null is written.
- Given a super admin acting without a reason, when they `PATCH /students/:id`, then the API answers 403 `ActingReadOnly` and the audit row records status 403.
- Given a super admin acting with reason "SUP-2207 fix misspelt surname", when they `PATCH /students/:id`, then it succeeds and the audit row carries the reason.
- Given an owner of school A, when they send `X-Eduvault-Acting-Org: {school B}`, then the header is ignored and they see only school A (no audit row).
- Given a super admin, when they send `X-Eduvault-Acting-Org` with an unknown id, then the API answers 404.
- Given acting in school A, when the super admin requests a row of school B by id, then the API answers 404.
- Given the audit log, when it renders, then rows are newest first with time, actor, school, method and path, status badge and reason or "—".
- Given acting, when the super admin presses "Leave school", then acting headers stop and the school's platform page opens.

## Tests

- Unit:
  - `apps/api`: acting resolution (header honoured or ignored, read-only permission set from the permission list, write detection by method); slug validation; audit row mapping.
  - `web-admin`: platform pages with a fake API (list, create sheet errors, suspend dialog copy); acting state store (start, reason, back to read-only, leave, cleared on sign-out).
- Integration (`api:test-integration`):
  - `PlatformAuthGuard`: 401 signed out, 403 owner, 200 super admin, on every `/platform/*` route.
  - Create school end to end (six starter roles, default levels, admission prefix), slug 409, compensation when the starter-role insert fails, existing-user owner.
  - Suspend and reactivate: member routes 403 `SchoolSuspended`; acting still works.
  - Replace owner keeps at least one owner; one-senior-role rule.
  - Acting: header ignored for non-super-admins; 404 unknown school; read-only grants reads across campuses; write without reason 403; with reason 200; other school's row 404 while acting; an audit row for each of these, including the 403 and a handler that throws.
  - `audit_log` isolation: no school route returns audit rows; a school member gets 403 on `/platform/audit`.
- E2E (opt-in, `eduvault-e2e`): super admin creates a school, copies the temporary password, the owner signs in; super admin acts in the school, sees writes hidden, adds a reason, edits a student, leaves; the audit log shows the three requests.

## Open decisions

| #    | Question                                                                           | Options                                                                                                                                                                                                  | Recommendation                                                 | Confidence                                           | Decided                                                                                               |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P-1  | Where does the school slug live?                                                   | (a) `school_account.slug` as the overview says; (b) Better Auth's `organization.slug` (already unique)                                                                                                   | (b), and drop `slug` from the overview's `school_account` list | High: one source avoids drift                        | Adopted                                                                                               |
| P-2  | The owner email already has an account (an owner of another school, or a guardian) | (a) refuse with 409; (b) make that user the owner, no new password                                                                                                                                       | (b): one account works across schools (permissions doc)        | Medium                                               | Adopted                                                                                               |
| P-3  | How is suspension stored?                                                          | (a) a Better Auth `organization` additional field via `api:auth-generate`; (b) `school_account.suspended_at`/`suspended_by`                                                                              | (b): domain state stays in domain tables                       | Medium                                               | [D-037](../technical-reference.md#decision-log): `school_account.suspended_at`; 403 `SchoolSuspended` |
| P-4  | What does a member of a suspended school see?                                      | (a) generic 403 errors; (b) a "{school} is suspended" screen in both apps: "{school} is paused on Eduvault. Contact the school for details." with "Sign out" (and a school switcher if they have others) | (b)                                                            | Medium: copy needs a product owner's eye             | Adopted                                                                                               |
| P-5  | Can a super admin act in a suspended school?                                       | (a) no; (b) yes                                                                                                                                                                                          | (b): incidents are when support is needed                      | Medium                                               | Adopted                                                                                               |
| P-6  | Audit log filters and paging                                                       | (a) none, as in the prototype; (b) school filter, "Writes only", cursor paging                                                                                                                           | (b): every read is logged, so the table grows fast             | High                                                 | Adopted                                                                                               |
| P-7  | Audit log retention                                                                | (a) forever; (b) 12 months then archive; (c) decide with the first contract                                                                                                                              | (c); store forever until then                                  | Low: depends on contracts and data-protection advice | Adopted                                                                                               |
| P-8  | Schools list order and search                                                      | (a) creation order as seeded; (b) name A–Z with a search box                                                                                                                                             | (b) once there are more than a page of schools                 | Medium                                               | Adopted                                                                                               |
| P-9  | Does starting to act need a reason too?                                            | (a) no, read-only needs none (doc); (b) a reason for any access                                                                                                                                          | (a), as decided in the permissions doc                         | High                                                 | Adopted                                                                                               |
| P-10 | Is the reason per request or per acting session?                                   | (a) typed per write; (b) kept for the session until "Back to read-only"                                                                                                                                  | (b), as the prototype shows                                    | High                                                 | Adopted                                                                                               |
| P-11 | Replace-owner design (the prototype is a stub)                                     | (a) new person only; (b) existing member or new person, old owner kept as member or removed                                                                                                              | (b)                                                            | Medium                                               | Adopted                                                                                               |
| P-12 | Default currency at creation                                                       | (a) ask in the sheet; (b) `NGN`, editable later in School profile                                                                                                                                        | (b): every pilot school is Nigerian                            | Medium                                               | Adopted                                                                                               |
| P-13 | How is a half-finished create-school undone?                                       | (a) compensating deletes after Better Auth's calls; (b) a nightly sweep for organizations with no `school_account`; (c) check whether Better Auth 1.7.7's adapter can join a caller's transaction        | (a), and check (c) during the build                            | Low: depends on Better Auth internals                | Adopted                                                                                               |

## Prototype gaps noticed

- The owner's temporary password appears only in a toast that disappears after 4.5 seconds.
- "Replace owner…" is a toast stub.
- The audit log records route changes and a made-up `HEAD /api/acting/reason` when a reason is entered; the real log records API requests only.
- The suspend dialog says the audit log records who suspended a school, but the prototype's log only holds acting requests.
- The audit table has no filters or paging beyond 10-row pages; actor is a fixed string.
- Students per school is hardcoded for the two demo schools; the create form pre-fills demo values.
- "Act in this school" is disabled for every school but Greenfield (demo data only).
- The "Acting in a school" card and the create sheet's "What happens on the server" disclosure use developer wording (header names, Better Auth calls); the disclosure is excluded, the card copy is flagged for rewording.
- "Leave school" always returns to Greenfield's page in the prototype.
- The not-found text for a school mentions campuses and classes.
- The schools table has no empty-state copy of its own.
- The reactivate toast prints the raw status ("{name} active.").

## Dependencies

- M1.1 guard and `/me/permissions` (acting resolves into the same `OrgContext`).
- M1.2 (sign-up off, `mustChangePassword`, `bootstrap-admin`, [11](11-sign-in-and-setup.md)): create school is part of the same slice, because seeding and tests can't create schools otherwise ([D-011](../technical-reference.md#decision-log)).
- M1.1 starter roles, including Principal, in `organizationRole`, inserted at create time ([D-010](../technical-reference.md#decision-log)).
- [31](31-classes.md) for the default level ladder inserted at create time; [41](41-admission.md) reads `admission_prefix`.
- M0.1 shell with the platform head; `libs/ui` dialog, sheet, dropdown-menu, table, badge.

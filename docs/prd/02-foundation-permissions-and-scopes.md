# PRD: Foundation, permissions and scopes

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53` (script lines 11–210: `PILLARS`, `SENSITIVE`, `PERM_HELP`, `CAP_AREAS`, `effectivePerms`, scopes; 1489–1520: grant checks; 4533–4656: access lab request trace and `/me/permissions` preview)
- Milestone and slice: `M1.1`, including the six ready-made starter roles (see [roadmap](README.md)); resources then join the list slice by slice (table under Business rules)
- Related: [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (Model, Guard, Super admin), [data-model-overview.md](../brainstorming/data-model-overview.md#permission-list) (Permission list, Class scope, Rules every table follows), [ADR 0005](../adr/0005-tenancy.md), [technical reference](../technical-reference.md) decisions [D-001, D-006, D-007, D-010, D-012, D-013, D-014, D-025, D-034, D-035, D-045, D-048](../technical-reference.md#decision-log)

## Summary

Eduvault replaces its four fixed roles with one permission list in code (70 `resource:action` pairs in three pillars) that each school bundles into its own roles. A member's permissions are the union of their roles; the guard checks one permission per handler; every query is then narrowed by three scopes carried on `OrgContext` (campus, class, student). This spec fixes the final list, its plain-language model for the role editor, where each piece lives in code, the 404-versus-403 contract, how rows with no campus are seen, and what an acting super admin may do.

## Who uses it

| Persona                    | Permission(s)                                          | What they can do here                                                                                                  |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Owner Funmi Adeyemi        | `owner` (every permission, including ones added later) | Everything; the only default holder of `member:create`, `ac:*`, `organization:*`                                       |
| Administrator Tunde Bakare | starter role `administrator`                           | Runs the school day to day; sees every campus (`campus:readAll`) and every class (`class:readAll`)                     |
| Bursar Chika Eze (Lekki)   | starter role `bursar`                                  | Finance on Lekki only; no class scope (holds no class permission), so sees every Lekki student                         |
| Teacher Mr Obi (Emeka)     | starter role `teacher`                                 | `class:read` without `class:readAll`: sees only students in JSS 2 Gold and JSS 3 Gold (subject teacher of Maths there) |
| Principal Grace Nwosu      | `teacher` + starter role `principal`                   | Approves money corrections and staff leave across the school                                                           |
| New hire Kemi Lawson       | `member` only                                          | Nothing: every gated route is hidden and every gated endpoint answers 403                                              |
| Student Ada Okeke          | starter role `student`                                 | `*:readOwn` on her own records, in `web-portal` only                                                                   |
| Guardian Ngozi Okeke       | starter role `guardian`                                | `*:readOwn` on her three linked children, in `web-portal` only                                                         |
| Super admin (Jude)         | platform role `superadmin`                             | Acting in a school: every `read`/`readAll` permission; with a reason, every permission                                 |

Scopes applied: campus (every school-scoped query), class (student and class reads for members holding `class:read` without `class:readAll`), student (`readOwn` endpoints). Out-of-scope rows answer 404; in scope without the permission answers 403 [tenancy-001].

## Screens

This is a foundation spec; its "screens" are the pieces of the permission machinery that people see.

### Nav and route gating (both apps)

- Each route declares one gate: a single permission, or a list of which any one suffices ([D-012](../technical-reference.md#decision-log)). Settings pages live under `/settings/*`; `/roles`, `/campuses` and `/calendar` sit under the Settings entry with their own paths ([D-035](../technical-reference.md#decision-log)). The nav link and the route's `beforeLoad` read the same declaration. A failing gate hides the link and redirects to the first nav route the person may open; the prototype's "You don’t have access to this page" card is tooling, not product.
- Gates, 1:1 with the prototype:

| Route                                                                 | App              | Gate                                                                       |
| --------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `/` Dashboard                                                         | admin            | signed in (shows "No access yet" when the person holds nothing; see below) |
| `/approvals`                                                          | admin            | signed in                                                                  |
| `/announcements`                                                      | admin            | `announcement:read`                                                        |
| `/students`, `/students/$studentId`                                   | admin            | `student:read`                                                             |
| `/members`, `/members/$memberId`                                      | admin            | `member:read`                                                              |
| `/roles`                                                              | admin (Settings) | `ac:read`                                                                  |
| `/roles/$roleSlug`                                                    | admin (Settings) | `ac:read` or `ac:create`                                                   |
| `/calendar`                                                           | admin (Settings) | `session:read`                                                             |
| `/classes`, `/classes/$classId`                                       | admin            | `class:read`                                                               |
| `/campuses`                                                           | admin (Settings) | `team:read`                                                                |
| `/settings/profile`, `/settings/admissions`, `/settings/approvals`    | admin (Settings) | `schoolAccount:read`                                                       |
| `/settings/danger`                                                    | admin (Settings) | `organization:delete`                                                      |
| `/settings/payment-rules`                                             | admin (Settings) | `schoolAccount:read`                                                       |
| `/finance/school-fees`, `/finance/other-fees`                         | admin            | `feeLine:read`                                                             |
| `/finance/billing`                                                    | admin            | `invoice:bill` or `invoice:read`                                           |
| `/finance/invoices`, `/finance/invoices/$invoiceId`                   | admin            | `invoice:read`                                                             |
| `/finance/payments`                                                   | admin            | `payment:read`                                                             |
| `/finance/accounts` (Who owes)                                        | admin            | `invoice:read` or `payment:read`                                           |
| `/finance/adjustments`                                                | admin            | `adjustment:read`                                                          |
| `/finance/money-accounts`                                             | admin            | `moneyAccount:read`                                                        |
| `/finance/ledger`                                                     | admin            | `ledger:read`                                                              |
| `/finance/store`                                                      | admin            | `store:read`                                                               |
| `/subjects`                                                           | admin            | `subject:read`                                                             |
| `/platform/schools`, `/platform/schools/$schoolId`, `/platform/audit` | admin (platform) | platform role `superadmin`                                                 |
| `/children`                                                           | portal           | `student:readOwn`, guardians only                                          |
| `/` Home                                                              | portal           | `student:readOwn`                                                          |
| `/fees`, `/purchases`                                                 | portal           | `invoice:readOwn`                                                          |

- The Settings sidebar entry shows when the person passes at least one settings item's gate, and opens the first one they pass.
- Buttons and menu items gated by a permission are not rendered without it (`<Can>` / `useCan`). The prototype's "Reveal hidden controls" switch is tooling.
- A member holding nothing sees the Dashboard with: title "Welcome, <first name>", description "<school> · <term> <school year>", and an empty state "No access yet" / "You’re on the staff list, but you can’t see anything until the owner gives you a role. This page fills in once they do." with a small button "See my access" (opens My access).

### My access sheet (admin user menu)

Specified with the shell in [10](10-app-shell-and-navigation.md#my-access-sheet). Its "What you can do" list is `capSummary` over the person's permissions (Business rules 9–10).

### Access-rule popover (page header)

The prototype's shield popover listing a page's gate is tooling and is not ported.

## Business rules

### The permission list

1. The list lives in `libs/policy/src/statements.ts` as one `as const` object; `Resource` and `ActionOf<R>` derive from it. A school combines these into roles and can never invent one. Final list (prototype wins over the earlier docs, D-001):

| Pillar            | Resource        | Label (role editor)        | Actions                                          |
| ----------------- | --------------- | -------------------------- | ------------------------------------------------ |
| People and access | `organization`  | School                     | update, delete                                   |
|                   | `member`        | Staff members              | create, read, update, delete                     |
|                   | `ac`            | Roles                      | create, read, update, delete                     |
|                   | `team`          | Campuses                   | read, create, update, delete                     |
|                   | `campus`        | Campus reach               | readAll                                          |
|                   | `schoolAccount` | School settings            | read, update                                     |
| Foundation        | `session`       | School years and terms     | create, read, update, setCurrent                 |
|                   | `class`         | Classes                    | create, read, readAll, update, assignTeacher     |
|                   | `student`       | Students                   | create, read, readOwn, update, markAway, archive |
|                   | `enrollment`    | Enrolment                  | create, read, place                              |
|                   | `guardian`      | Guardians                  | create, read, update, link                       |
|                   | `subject`       | Subjects                   | create, read, update                             |
|                   | `announcement`  | Announcements              | create, read, update                             |
|                   | `leave`         | Staff leave                | approve                                          |
| Finance           | `ledger`        | Ledger                     | read, manageAccounts                             |
|                   | `moneyAccount`  | Money accounts             | create, read, update                             |
|                   | `feeLine`       | School and other fees      | create, read, readOwn, update, retire            |
|                   | `invoice`       | Invoices                   | bill, read, readOwn                              |
|                   | `payment`       | Payments                   | record, read, readOwn, void                      |
|                   | `adjustment`    | Adjustments                | create, read, approve                            |
|                   | `store`         | Store (books and uniforms) | read, receive, issue, count                      |

2. Compared with the permissions doc's phase 1: `invitation` is dropped (its routes are disabled and the prototype never grants it), `student:delete` and `feeSchedule:*` are gone (students are archived; `feeLine` replaces `feeSchedule`), and `team:read`, `leave:approve` and the foundation and finance resources are added. This amends that doc's tables.
3. A resource joins `statements.ts` in the same change that adds its endpoints, and the starter roles gain its permissions in that change: for new schools through the school-created hook, and for existing schools through the slice's migration, which backfills every starter role the school has not edited (`source = 'starter'` and `editedAt` null; see [21](21-roles-and-permissions.md#data)). A starter role a school has edited is left alone. Planned order:

| Slice | Resources and actions added                                                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1.1  | `team` (read, create, update, delete), `campus:readAll`, `schoolAccount` (read, update), `student` (create, read, update), `feeSchedule` (legacy, until M3.2), and the machinery; `organizationRole` and the six starter roles (rule 8), each holding only the permissions that exist |
| M1.3  | `member` (create, read, update, delete)                                                                                                                                                                                                                                               |
| M1.4  | `ac` (create, read, update, delete)                                                                                                                                                                                                                                                   |
| M2.1  | `session`                                                                                                                                                                                                                                                                             |
| M2.2  | `organization` (update for handover, delete for the danger zone)                                                                                                                                                                                                                      |
| M2.3  | `class`                                                                                                                                                                                                                                                                               |
| M2.4  | `enrollment` (create, read, place), `guardian`                                                                                                                                                                                                                                        |
| M2.5  | `student` (markAway, archive)                                                                                                                                                                                                                                                         |
| M2.7  | `announcement`                                                                                                                                                                                                                                                                        |
| M2.8  | `student:readOwn`                                                                                                                                                                                                                                                                     |
| M3.1  | `ledger`, `moneyAccount`                                                                                                                                                                                                                                                              |
| M3.2  | `feeLine` (create, read, update, retire); `feeSchedule` removed                                                                                                                                                                                                                       |
| M3.3  | `invoice` (bill, read)                                                                                                                                                                                                                                                                |
| M3.4  | `payment` (record, read)                                                                                                                                                                                                                                                              |
| M3.5  | `adjustment`, `payment:void`                                                                                                                                                                                                                                                          |
| M3.6  | `leave:approve`                                                                                                                                                                                                                                                                       |
| M3.7  | `feeLine:readOwn`, `invoice:readOwn`, `payment:readOwn`                                                                                                                                                                                                                               |
| M4.1  | `subject`                                                                                                                                                                                                                                                                             |
| M4.3  | `store` (read, receive)                                                                                                                                                                                                                                                               |
| M4.4  | `store:issue`                                                                                                                                                                                                                                                                         |
| M4.5  | `store:count`                                                                                                                                                                                                                                                                         |

M1.2 (sign-in and set-up) and M1.5 (platform console) add no school permission; the platform role `superadmin` is not part of this list.

4. `SENSITIVE` (shown with an amber dot in the role editor and listed under "Sensitive held" for a member) is: `organization:update`, `organization:delete`, `member:create`, `member:delete`, `ac:create`, `ac:update`, `ac:delete`, `campus:readAll`, `class:readAll`, `leave:approve`, `payment:void`, `adjustment:approve`, `ledger:manageAccounts`. It is the prototype's set plus `leave:approve` and `organization:update`, and it is the one list: the permission chips use it, and an area or extra in `CAP_AREAS` is marked important (⚑) when it holds any of it ([21](21-roles-and-permissions.md) RP-6). This is wider than the overview's ⚑ set (`class:readAll`, `ledger:manageAccounts`, `payment:void`, `adjustment:approve`); the prototype's set wins (D-001) and the overview's markers should be amended.
5. `PERM_HELP`, the one-line explanation per permission, verbatim:

| Permission            | Help                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `campus:readAll`      | Sees every campus. Without it a member sees only the campuses they belong to.                    |
| `class:readAll`       | Sees every class. Without it a teacher sees only the classes they teach or are class teacher of. |
| `member:create`       | Adds people to the school. Owner-only by default.                                                |
| `member:update`       | Assigns roles, but only roles whose permissions the assigner holds too.                          |
| `ac:create`           | Creates custom roles, limited to permissions the creator holds.                                  |
| `payment:void`        | Drafts a void. A second person with adjustment:approve approves it.                              |
| `adjustment:approve`  | Approves credit notes, discounts, write-offs, refunds and payment voids. Never your own.         |
| `leave:approve`       | Approves or declines staff leave requests. Never your own.                                       |
| `invoice:bill`        | Runs billing: draft, review, issue.                                                              |
| `student:markAway`    | Marks a student “not seen since” a date. After 5 weeks with no word they become Inactive.        |
| `student:archive`     | Records a student leaving or graduating. Nothing is deleted.                                     |
| `store:issue`         | Sells books and uniforms to a student. Payment is taken at the store.                            |
| `store:count`         | Records a stock count. Shortages wait for someone with adjustment:approve.                       |
| `announcement:create` | Writes announcements for parents and students in the portal.                                     |
| any `*:readOwn`       | Sees only the student’s own records, or a guardian’s linked children.                            |

6. A permission's human label is "<resource label>: <action in words>", splitting camelCase (`campus:readAll` → "Campus reach: read all", `student:markAway` → "Students: mark away").

### Roles

7. `owner` is defined in code and holds every permission, including ones added later. `member` is defined in code and holds none; everyone added starts with it. Every other role is a row in Better Auth's `organizationRole` with a fixed slug and an editable label (permissions doc, Roles).
8. Starter roles inserted for each new school by the school-created hook, from M1.1 ([D-010](../technical-reference.md#decision-log)). These are the final sets; each slice adds only what it introduces (rule 3):

| Slug            | Label         | Description                                                                   | Permissions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `administrator` | Administrator | Runs the school day to day: calendar, classes, students and staff.            | `member:read`, `member:update`, `ac:read`, `team:read`, `team:create`, `team:update`, `campus:readAll`, `schoolAccount:read`, `session:*` (create, read, update, setCurrent), `class:*` (create, read, readAll, update, assignTeacher), `student:create`, `student:read`, `student:update`, `student:markAway`, `student:archive`, `enrollment:*`, `guardian:*`, `feeLine:read`, `invoice:read`, `payment:read`, `subject:create`, `subject:read`, `subject:update`, `store:read`, `announcement:create`, `announcement:read`, `announcement:update` |
| `teacher`       | Teacher       | Teaches their own classes. Sees only those classes.                           | `student:read`, `student:markAway`, `class:read`, `subject:read`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `bursar`        | Bursar        | Charges fees, records payments and asks for corrections. Cannot approve them. | `student:read`, `guardian:read`, `enrollment:read`, `feeLine:create`, `feeLine:read`, `feeLine:update`, `feeLine:retire`, `invoice:bill`, `invoice:read`, `payment:record`, `payment:read`, `payment:void`, `adjustment:create`, `adjustment:read`, `store:read`, `store:receive`, `store:issue`, `store:count`, `moneyAccount:read`, `ledger:read`                                                                                                                                                                                                  |
| `principal`     | Principal     | Approves money corrections across the school.                                 | `team:read`, `campus:readAll`, `student:read`, `class:read`, `class:readAll`, `subject:read`, `invoice:read`, `payment:read`, `moneyAccount:read`, `adjustment:read`, `adjustment:approve`, `store:read`, `announcement:create`, `announcement:read`, `announcement:update`, `leave:approve`                                                                                                                                                                                                                                                         |
| `student`       | Student       | Portal only. Sees their own records.                                          | `student:readOwn`, `feeLine:readOwn`, `invoice:readOwn`, `payment:readOwn`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `guardian`      | Guardian      | Portal only. Sees their linked children.                                      | same as `student`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

In the prototype `principal` is a custom role the owner created; here it is a ready-made starter role like the others ([D-010](../technical-reference.md#decision-log)), so every school has it and the dev seed only assigns it to Grace (see [04](04-foundation-testing-and-seed.md)). D-006's "owner and principal by default" for `leave:approve` holds in every school: the owner always, and the Principal starter role from M3.6.

### The plain-language model (`CAP_AREAS`)

9. The role editor and My access describe permissions as areas, not chips. Each permission sits in exactly one slot: an area's "See" set, its "Change" set, or one extra switch. (Checked: all 70 permissions have exactly one slot; a `libs/policy` unit test keeps it so.)

| Group             | Area                    | See                                                                                                                                                                   | Change ("Can change" text)                                                                                                                             | Extras (switch label: description)                                                                                                                                                                         |
| ----------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People and access | Staff ⚑                 | `member:read`                                                                                                                                                         | `member:create`, `member:update`, `member:delete` ("Add and remove staff, and give them roles")                                                        | Approves staff leave ⚑: "Nobody can approve their own leave." (`leave:approve`)                                                                                                                            |
| People and access | Roles ⚑                 | `ac:read`                                                                                                                                                             | `ac:create`, `ac:update`, `ac:delete` ("Create roles and change what they allow")                                                                      |                                                                                                                                                                                                            |
| People and access | Campuses                | `team:read`                                                                                                                                                           | `team:create`, `team:update`, `team:delete` ("Add and rename campuses")                                                                                | Sees every campus ⚑: "Without this, they only see the campuses they work on." (`campus:readAll`)                                                                                                           |
| People and access | School settings         | `schoolAccount:read`                                                                                                                                                  | `schoolAccount:update` ("Change the school profile and rules")                                                                                         | Hand over or delete the school ⚑: "Normally only the owner." (`organization:update`, `organization:delete`)                                                                                                |
| School            | School years and terms  | `session:read`                                                                                                                                                        | `session:create`, `session:update`, `session:setCurrent` ("Add school years, holidays and set the current term")                                       |                                                                                                                                                                                                            |
| School            | Students                | `student:read`                                                                                                                                                        | `student:create`, `student:update`, `enrollment:read`, `enrollment:create`, `enrollment:place` ("Admit students, update them and put them in classes") | Marks students away: "Records that a student has not been seen since a date." (`student:markAway`); Records leaving and graduation: "Takes students off the roll. Nothing is deleted." (`student:archive`) |
| School            | Parents and guardians   | `guardian:read`                                                                                                                                                       | `guardian:create`, `guardian:update`, `guardian:link` ("Add guardians and link them to students")                                                      |                                                                                                                                                                                                            |
| School            | Classes                 | `class:read`                                                                                                                                                          | `class:create`, `class:update`, `class:assignTeacher` ("Create classes and assign teachers")                                                           | Sees every class ⚑: "Without this, teachers only see the classes they teach." (`class:readAll`)                                                                                                            |
| School            | Subjects                | `subject:read`                                                                                                                                                        | `subject:create`, `subject:update` ("Add subjects and choose who teaches them")                                                                        |                                                                                                                                                                                                            |
| School            | Announcements           | `announcement:read`                                                                                                                                                   | `announcement:create`, `announcement:update` ("Write and publish news for parents")                                                                    |                                                                                                                                                                                                            |
| Money             | Fees                    | `feeLine:read`                                                                                                                                                        | `feeLine:create`, `feeLine:update`, `feeLine:retire` ("Set and change what each class pays")                                                           |                                                                                                                                                                                                            |
| Money             | Charges                 | `invoice:read`                                                                                                                                                        | `invoice:bill` ("Charge students for a term")                                                                                                          |                                                                                                                                                                                                            |
| Money             | Payments                | `payment:read`                                                                                                                                                        | `payment:record` ("Record payments and give receipts")                                                                                                 |                                                                                                                                                                                                            |
| Money             | Discounts and refunds ⚑ | `adjustment:read`                                                                                                                                                     | `adjustment:create`, `payment:void` ("Ask for refunds, discounts and cancelled payments")                                                              | Approves refunds, discounts and cancellations ⚑: "Nobody can approve their own request." (`adjustment:approve`)                                                                                            |
| Money             | Bank and POS accounts   | `moneyAccount:read`                                                                                                                                                   | `moneyAccount:create`, `moneyAccount:update` ("Add and change bank and POS accounts")                                                                  |                                                                                                                                                                                                            |
| Money             | Money categories ⚑      | `ledger:read`                                                                                                                                                         | `ledger:manageAccounts` ("Change the accountant’s categories")                                                                                         |                                                                                                                                                                                                            |
| Money             | Store                   | `store:read`                                                                                                                                                          | `store:receive`, `store:issue`, `store:count` ("Sell items, receive deliveries and count stock")                                                       |                                                                                                                                                                                                            |
| Portal            | Portal                  | `student:readOwn`, `feeLine:readOwn`, `invoice:readOwn`, `payment:readOwn` (label "Own records": "Students see their own records. Guardians see their own children.") | none                                                                                                                                                   |                                                                                                                                                                                                            |

⚑ = the area's `important` flag (amber dot in the editor). Levels read "No access", "Can see", "Can change".

10. An area's level for a permission set: **Can change** when the Change set is non-empty and every See and Change permission is held; **Can see** when every See permission is held; **some access** ("custom") when any of them is held; otherwise **No access**. The summary is one line per area: "<Area>: <changeDesc, first letter lower-cased>" for Can change, "<Area>: can see" (or "own records") for Can see, "<Area>: some access" for custom, plus one line per extra whose permissions are all held, using the extra's label.
11. An area, extra or `PERM_HELP` row whose permissions have not yet landed in `statements.ts` is not rendered.

### Where it lives in code

12. `libs/policy` (`scope:shared`, importable by API and SPAs):
    - `statements.ts`: the list (rule 1), `SENSITIVE`, `PERM_HELP`, labels.
    - `cap-areas.ts`: `CAP_AREAS`, `capLevel`, `capSummary`.
    - `roles.ts`: the code-defined `owner` and `member`, `STARTER_ROLES`, and `can(permissions, resource, action)` over a resolved permission set (no more role-name checks; `ROLE_NAMES`, `parseRoles`-to-fixed-roles and `seesAllCampuses` go).
    - `grants.ts`: `canGrantRole(role, assignerPermissions, assignerIsOwner)` (owner only grants `owner`; `member` always grantable; otherwise the assigner must hold every permission in the role, returning the missing ones) and `grantablePermissions(assigner)` for the role editor.
13. `apps/api/src/app/common/auth`:
    - `@OrganizationAuth(resource, action)` on each handler (unchanged rule). The guard: resolves the session (401 without one); applies the acting header for a super admin (rule 25); resolves the active member (403 "No active school for this session" without one); splits `member.role` on commas; loads only those custom roles' permissions in one query (`SELECT permission FROM "organizationRole" WHERE "organizationId" = $1 AND role = ANY($2)`); unions them with the code roles; checks the one required permission (403); then builds `OrgContext`.
    - `OrgContext` gains `roles: string[]`, `permissions` (the union), `isOwner`, `classScope`, `studentScope` and `acting` (`null`, or `{ reason: string | null }`), keeping `organizationId`, `activeCampusId`, `campusScope`, `user`, `headers`. `role: string` is removed.
    - Scope helpers next to `campus-scope.ts`: `inCampusScope(eb, column, scope, { nullMeans })`, `inClassScope(eb, armColumn, scope)`, `inStudentScope(eb, studentColumn, scope)`, each returning `true`, `false` or an `IN` list.
14. `GET /me/permissions` in the existing `me` module (rule 21). The SPAs load it in the root route's `beforeLoad` and pass it to `PermissionsProvider` in `libs/auth-client`, which exposes `useCan(resource, action)` and `<Can>`.
15. One extra database read per guarded request reverses ADR 0002's "no round trip" reasoning; a new ADR records it (permissions doc, Guard).

### Scopes

16. **Campus scope**: `'all'` when the member holds `campus:readAll` (or is an acting super admin); otherwise the campuses (`teamMember` rows) the member belongs to in this school, possibly empty. Every query on a campus-aware table filters by it.
17. **Class scope**: binds only a member who holds `class:read` without `class:readAll`. For them it is the arms where, for the current school year, they are a class teacher (any role: lead, assistant, uniform) or, for the current term, a subject teacher. Everyone else, including a member with no class permission at all, is `'all'`. It narrows student, class and guardian reads: a guardian is visible only through a student in scope ([D-048](../technical-reference.md#decision-log)). Finance is campus-scoped, never class-scoped (overview, Class scope). Until `class_arm_teacher` (M2.3) and `subject_teacher` (M4.1) exist it is `'all'` for everyone, and a teacher's class scope is built from whichever of the two tables exists.
18. **Student scope**: `'all'` for staff endpoints. For a `readOwn` endpoint it is the caller's own student id (`student.user_id`) or, for a guardian, the students linked to their guardian row (`guardian.user_id` → `guardian_student`). Until the guardian tables exist (M2.4) it is empty.
19. Visibility of a row with a null `campus_id` (overview, Rules every table follows):

| Table kind                                                       | Null means             | Who sees it                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration (`fee_line`, later `item`, `assessment_component`) | every campus           | Anyone in the school with the read permission (`nullMeans: 'all'`)                                                                                                                                                                                                            |
| `announcement`                                                   | everyone in the school | Anyone with `announcement:read`; the portal shows it to every student and guardian                                                                                                                                                                                            |
| Money (`money_account`, `journal_line`)                          | school-wide            | Listed only for `campus:readAll` (`nullMeans: 'readAllOnly'`). A campus bursar may still record a payment into a school-wide account ([D-045](../technical-reference.md#decision-log)), and a payment is visible when any student it is allocated to is in their campus scope |
| Approval item with no campus                                     | every approver         | Every holder of the approving permission                                                                                                                                                                                                                                      |

20. A list endpoint that takes a `campusId` filter answers 404 "Campus not found" when that campus is outside the caller's scope (today's `StudentService.list` behaviour), not an empty list.

### `/me/permissions`

21. `GET /me/permissions` needs a session and an active school (no specific permission). It returns the active `organizationId`, the caller's roles, their permission union as `{ resource: action[] }` (resources with no actions omitted), `campusScope`, `classScope` and the acting state: `null`, or `{ organizationId, writes: boolean }` while acting, where `writes` is true when the request carried a reason ([D-034](../technical-reference.md#decision-log)). It never returns student ids; the portal fetches its children from a portal endpoint (PS-05). The client refetches it on focus and after any 403 ([10](10-app-shell-and-navigation.md#business-rules)). The prototype's preview for Grace (teacher and principal) is the shape to match, once every resource has landed:

```json
{
  "organizationId": "<greenfield id>",
  "roles": ["member", "teacher", "principal"],
  "campusScope": "all",
  "classScope": "all",
  "permissions": {
    "team": ["read"],
    "campus": ["readAll"],
    "student": ["read", "markAway"],
    "class": ["read", "readAll"],
    "subject": ["read"],
    "announcement": ["create", "read", "update"],
    "leave": ["approve"],
    "invoice": ["read"],
    "payment": ["read"],
    "moneyAccount": ["read"],
    "adjustment": ["read", "approve"],
    "store": ["read"]
  },
  "acting": null
}
```

22. The UI never decides access from role names. It reads this union; Better Auth's client-side `checkRolePermission` knows only code roles and is not used.

### 401, 403, 404, 409

23. The order of checks, and what each answers:

| Step             | Fails when                                                                                                                | Answer                                                    | Body message (examples)                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Session       | No session, or the user is banned                                                                                         | 401                                                       | "Authentication is required"                                           |
| 2. Acting header | A super admin names a school that doesn't exist                                                                           | 404                                                       | "School not found"                                                     |
| 3. Active school | The session has no active school the user belongs to                                                                      | 403 `NoSchool`                                            | "No active school for this session"                                    |
| 4. Acting write  | Acting without `X-Eduvault-Acting-Reason` on POST, PUT, PATCH or DELETE                                                   | 403 `ActingReadOnly`                                      | "Acting read-only. A write needs a reason (X-Eduvault-Acting-Reason)." |
| 5. Permission    | No role grants the handler's permission                                                                                   | 403 `Forbidden`                                           | "Missing permission student:read"                                      |
| 6. Row in school | The id belongs to another school                                                                                          | 404 `NotFound`                                            | "Student not found"                                                    |
| 7. Row in scope  | The row is outside the campus, class or student scope, or is a school-wide money row for someone without `campus:readAll` | 404 `NotFound`                                            | "Student not found"                                                    |
| 8. Business rule | Self-approval, a unique reference with a different payload, a restricted delete, an escalating role grant                 | 409 `SelfApproval` or `Conflict` (grant: 403 `Forbidden`) | "You created this. Someone else must approve it."                      |

Two more 403 codes join the contract in later slices: `MustChangePassword` (M1.2, [11](11-sign-in-and-setup.md)) and `SchoolSuspended` (M1.5, [12](12-platform-console.md)). The 403 message names the missing permission (PS-01): staff can tell the owner what to grant, and permission names are not secret. The acting-write check runs before the permission check, so an acting super admin without a reason always gets the acting message rather than a missing-permission one. The permission check runs before the row is read, so a caller without the permission gets 403 even for another school's id; that answer is about the route, not the row, and leaks nothing. A caller with the permission never learns whether an out-of-scope id exists.

24. Self-approval is refused by the database (`CHECK (approved_by <> created_by)` and `CHECK (rejected_by <> created_by)`, see [03](03-foundation-ledger-and-documents.md)). Postgres reports it as `23514` (check violation), which `ErrorFilter` does not map today (it maps `23505` and `23503` to 409). The service pre-checks and throws 409 `SelfApproval` with the readable message; `ErrorFilter` also maps `23514` to 409 as the backstop ([D-013](../technical-reference.md#decision-log)). Every approvable table uses the same columns, `staff_leave` and `stock_count` included ([D-025](../technical-reference.md#decision-log)).

### Acting super admin

25. A request from a `superadmin` with `X-Eduvault-Acting-Org: <schoolId>` acts in that school. The header is ignored for anyone else. While acting:
    - permissions are `READ_PERMS`, every `read` and `readAll` permission (20 of them; `readOwn` is excluded), with `campusScope` and `classScope` `'all'`;
    - a write needs `X-Eduvault-Acting-Reason` (for example "SUP-2214"); with it, the request runs with every permission (owner-level), and without it answers 403 `ActingReadOnly` (rule 23, step 4);
    - every acting request, reads included, writes one audit row (actor, school, method, path, status, reason, time) after the response status is known (M1.5);
    - approval and self-approval rules still apply with the super admin's own user id.
26. In the UI the reason is entered in the acting banner ("Allow writes"), held in memory for that tab, sent on every request until "Back to read-only" or "Leave school", and never stored in the school's data except in the audit row.

### Staff who are also guardians

27. A person who is both staff and a guardian in one school (a teacher whose child attends) has one member row holding both kinds of role. The scope follows the endpoint, not the person: portal endpoints use the `readOwn` permissions and filter by their guardian links, and staff endpoints use `read` with the campus and class scopes. The prototype's "portal route for staff answers 404" rule is dropped (PS-03).

## Data

- No domain table in M1.1. Better Auth's `organizationRole` (via `api:auth-generate`, with the extra fields in [21](21-roles-and-permissions.md#data)) and `dynamicAccessControl: { enabled: true }` arrive with M1.1, because the starter roles are seeded there ([D-010](../technical-reference.md#decision-log)); the role editor that writes to it comes in M1.4.
- The guard reads custom-role permissions with one query per request; there is no cache until one is measured to be needed (PS-04).
- `audit_log` arrives with M1.5 (permissions doc, New tables and fields).
- Class scope reads `class_arm_teacher` (M2.3) and `subject_teacher` (M4.1); student scope reads `student.user_id`, `guardian`, `guardian_student` (M2.4, M2.8), per [data-model-overview.md](../brainstorming/data-model-overview.md#foundation-model).

## API

| Method | Path              | Permission               | Request | Response                                                                  | Errors                                         |
| ------ | ----------------- | ------------------------ | ------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| GET    | `/me`             | signed in                | none    | user, active school, active campus                                        | 401                                            |
| GET    | `/me/permissions` | signed in, active school | none    | `{ organizationId, roles, permissions, campusScope, classScope, acting }` | 401; 403 `NoSchool`; 404 unknown acting school |

Every existing handler keeps `@OrganizationAuth(resource, action)`. `DELETE /students/:id` is removed in M1.1 together with `student:delete`, and the e2e cleanup is rewritten ([D-014](../technical-reference.md#decision-log); [04](04-foundation-testing-and-seed.md)). Contract types (`MePermissions`, `PermissionMap`, `Scope`) live in `@eduvault/api-contract`.

## Acceptance criteria

1. Given `statements.ts`, when the `libs/policy` test enumerates `CAP_AREAS`, then every listed permission sits in exactly one slot and every slot names a listed permission.
2. Given owner Funmi, when she calls any guarded endpoint, then the permission check passes, including for a permission added after her school was created.
3. Given Kemi with only `member`, when she calls `GET /students`, then 403; when she opens web-admin, then the nav shows only Dashboard and Approvals and the Dashboard shows "No access yet".
4. Given Chika (bursar, Lekki) and an Ikeja student, when she calls `GET /students/<ikeja id>`, then 404; given Mr Obi (teacher) listing fee lines through the API (`feeLine:read`, M3.2), then 403.
5. Given a school-A owner and a school-B student id, when the owner calls `GET`, `PATCH` on it, then 404 each, and the list does not contain it.
6. Given Mr Obi, when he lists students, then only students placed this term in JSS 2 Gold and JSS 3 Gold are returned; given Chika, then every Lekki student is returned (no class scope).
7. Given a member with `campus:readAll` and one without, when each lists money accounts, then the school-wide GTBank account appears only for the first; when the second records a payment into GTBank for a Lekki student, then it succeeds and the payment appears in their payments list.
8. Given Grace (teacher and the ready-made principal role) once every resource has landed, when she calls `GET /me/permissions`, then the body equals the example in rule 21.
9. Given Chika created a payment cancellation, when she approves it (even with `adjustment:approve` granted), then 409 `SelfApproval` "You created this. Someone else must approve it." and nothing posts.
10. Given a super admin acting in Greenfield with no reason, when they `GET /students`, then 200 with every campus; when they `PATCH` a student, then 403 and an audit row records status 403; with `X-Eduvault-Acting-Reason: SUP-2214`, the `PATCH` answers 200 and the audit row records the reason.
11. Given a non-super-admin sending `X-Eduvault-Acting-Org`, then the header is ignored and the request runs in their own active school.
12. Given an administrator with `member:update` but not `adjustment:approve`, when they assign a role holding `adjustment:approve`, then 403 naming the missing permission (M1.3 endpoint; `canGrantRole` unit-tested in M1.1).
13. Given a route gated by `invoice:bill or invoice:read`, when a person holds only `invoice:read`, then the link shows and the route opens.
14. Given a new school, when it is created, then it has the six starter roles, Principal included, each holding only the permissions that exist at that slice; given an existing school whose Principal role is unedited, when the M3.6 migration runs, then Principal gains `leave:approve`, and an edited one is left alone.
15. Given a member holding `guardian:read` and `class:read` without `class:readAll`, and a guardian linked only to students outside that member's classes, when the member lists guardians, then that guardian is not returned.

## Tests

- Unit (`nx run policy:test`): rule 1 list shape; `CAP_AREAS` one-slot invariant (AC 1); `capLevel` four outcomes; `capSummary` lines for owner, administrator, teacher, bursar, principal, member; `can()` over unions (a permission in role B but not A passes); `canGrantRole` (owner-only owner, member always, missing list); `READ_PERMS` has 20 entries and no `readOwn`; `permLabel` splitting. `nx run auth-client:test`: `useCan` and `<Can>` with a fake permission map. Each app: nav hides gated links and `beforeLoad` redirects (fake permission map).
- Integration (`api:test-integration`): a guard spec with custom roles (union across two roles; one extra query); 401/403/404 ordering per rule 23 for one route of each kind; campus scope (cross-campus 404, `campusId` filter 404); class scope once M2.3 lands; null-campus money visibility once M3.1 lands; `/me/permissions` for each persona; acting: read-only, write without reason 403, with reason 200, header ignored for non-super-admin, unknown school 404; `23514` mapped to 409.
- E2E (required, `eduvault-e2e`): as owner, administrator, bursar, teacher, new hire and a foreign-school owner, `curl` one read and one write per pillar that exists and assert the exact status; browser: the nav each persona sees, and a teacher typing `/finance/school-fees` landing on the Dashboard.

## Open decisions

| #     | Question                                                                                                                                                                                                                                                                                                                                     | Recommendation                                                                                                            | Confidence | Decided                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| PS-01 | Where the 403 detail goes. Options: (a) name the missing permission in the message ("Missing permission student:read"); (b) a generic "Forbidden"                                                                                                                                                                                            | (a): staff can tell the owner what to grant; permission names are not secret                                              | Medium     | Adopted                                                                                           |
| PS-02 | `DELETE /students/:id` exists today but the final list has no `student:delete` and students are never deleted [risk-001]. Options: (a) remove the endpoint in M1.1 and move e2e cleanup to a per-run database ([04](04-foundation-testing-and-seed.md)); (b) keep it owner-only as a legacy permission until M2.4 rebuilds the student table | (a)                                                                                                                       | Medium     | [D-014](../technical-reference.md#decision-log): endpoint removed in M1.1                         |
| PS-03 | A person who is both staff and a guardian in one school (a teacher whose child attends). Options: (a) one member row with both roles; portal endpoints always use `readOwn` and filter by their links, staff endpoints use `read`; (b) forbid it and require a second account                                                                | (a): the scope follows the endpoint, not the person; the prototype's "portal route for staff answers 404" rule is dropped | Medium     | Adopted                                                                                           |
| PS-04 | Caching the custom-role lookup. Options: (a) one query per request (simple, consistent); (b) a per-school in-memory cache invalidated on role edits                                                                                                                                                                                          | (a) until measured                                                                                                        | High       | Adopted                                                                                           |
| PS-05 | Should `GET /me/permissions` include the student scope ids for portal users? Options: (a) no, the portal fetches `/portal/children`; (b) yes                                                                                                                                                                                                 | (a): ids for guardians' children belong to a portal endpoint                                                              | Medium     | Adopted                                                                                           |
| PS-06 | School-wide money accounts in a campus bursar's money-accounts list. Options: (a) hidden (prototype); (b) shown read-only because they record into it                                                                                                                                                                                        | Still open in [data-model-finance.md](../brainstorming/data-model-finance.md#still-open); not decided here. Lean (a)      | Low        | [D-045](../technical-reference.md#decision-log): hidden from the list, can still be recorded into |
| PS-07 | Whether class scope also narrows guardians shown to a teacher (guardian reads go through the student)                                                                                                                                                                                                                                        | Yes: a guardian is visible only through a student in scope                                                                | Medium     | [D-048](../technical-reference.md#decision-log): class scope narrows guardians                    |

## Prototype gaps noticed

- The "Students" area puts `enrollment:read` in its Change set, so a role with "Can see" on Students cannot read enrolments (the class column) without being given "Can change". Consider moving `enrollment:read` to See.
- `READ_PERMS` (acting read-only) includes `campus:readAll` and `class:readAll`, which are not actions but reach; harmless because the acting scopes are `'all'` anyway.
- The access lab's request trace answers 404 for a staff member calling a portal route; that rule is not in any doc (see PS-03).
- The trace says self-approval answers 409 "`CHECK (approved_by <> created_by)` refuses it", but the approval helpers pass `auto` to skip the check for switched-off kinds and then set `approvedBy` to the creator (`approveAdjustment(id, true)` sets `approvedBy = myUserId()`), contradicting D-007. The build follows D-007.
- `approvals` and the Dashboard have no gate; everyone signed in, including Kemi, can open them. Kept as is.
- `SENSITIVE` and the `important` flags in `CAP_AREAS` are two different sets (for example `organization:update` is important but not sensitive, and `leave:approve` is in neither). The build keeps one list (rule 4).

## Dependencies

- [01](01-foundation-design-system.md) for the shells it gates.
- M1.3 (members) and M1.4 (the role editor) use `canGrantRole` and the starter roles seeded here; M1.5 adds `audit_log` and the platform guard; M2.3, M4.1 and M2.8 fill the class and student scopes.

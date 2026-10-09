# Permissions and custom roles

- Status: brainstorm (not yet an ADR)
- Date: 2026-10-07
- Better Auth version checked: 1.7.7 (`catalog:auth`)
- Supersedes, once accepted: the fixed-role parts of [ADR 0002](../adr/0002-better-auth-in-nestjs.md); amends [ADR 0005](../adr/0005-tenancy.md)

## Goal

Replace the fixed roles (`owner`, `admin`, `teacher`, `student`) with a permission-based model built on the principle of least privilege.

- Nobody signs themselves up. A school owner adds users.
- Only a super admin (a developer, at platform level) creates schools, and a super admin can reach every school.
- Each school defines its own roles and picks their permissions. A member can hold several roles, and their permissions combine.
- "Admin" and "teacher" stop being fixed roles. They become custom roles: a member with certain permissions attached.

## Decisions taken

| Question                                    | Answer                                                                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who defines the permission bundles          | Each school, through Better Auth custom roles (`dynamicAccessControl`). The permission list itself stays in code.                                                                                                                                    |
| When a resource's permissions are added     | With the feature that adds its endpoints. Phase 1 lists only resources that have endpoints today. Results, attendance, exams and payments add theirs, and update the starter roles, when they're built.                                              |
| Who holds `member:create`                   | Only `owner` by default. It's a permission, so a school can delegate it later through a custom role.                                                                                                                                                 |
| Who can edit roles (`ac:*`)                 | Only `owner` by default. Better Auth already stops anyone creating or editing a role with permissions they don't hold, so delegating it later is safe.                                                                                               |
| Platform role name                          | `superadmin`, defined in the admin plugin's own access control with `adminRoles: ['superadmin']`.                                                                                                                                                    |
| How the superadmin reaches school data      | A platform console for platform-wide jobs, plus an explicit "acting in school X" header.                                                                                                                                                             |
| What an acting superadmin can do            | Read-only by default. A write also needs a reason header, which is stored in the audit row.                                                                                                                                                          |
| What the audit log records                  | Every acting request, reads included.                                                                                                                                                                                                                |
| Where the platform console lives            | `/platform` routes inside `web-admin`, checked by the superadmin role in `beforeLoad` and by `PlatformAuthGuard` on the API.                                                                                                                         |
| How an added user gets their first password | Both ways. A deliverable email with an email provider configured gets a set-password link. Anything else (no provider yet, a child with no email) gets a temporary password and must change it at first sign-in. The temporary password ships first. |
| Email provider                              | Resend (phase 5), behind a small `EmailSender` interface.                                                                                                                                                                                            |
| Who signs in to `web-portal`                | Students and guardians only, each limited to their own records. All staff, teachers included, use `web-admin`.                                                                                                                                       |
| How students sign in                        | A username made from the school slug plus the admission number (`greenfield-0123`), with a temporary password. School slugs become fixed in practice.                                                                                                |
| How guardians sign in                       | Email if they have one (a set-password link once Resend is in), otherwise a username and a temporary password. One account works across schools.                                                                                                     |
| Teacher scope                               | Limited to the classes they teach. Built in phase 4b along with the class and section model.                                                                                                                                                         |
| The file-based router switch                | Done on its own first (phase 0: commits `0d3b7aa`, `f47f655`, `9e4827c`); phase 1 builds on it.                                                                                                                                                      |
| How the work is delivered                   | One phase at a time: one `/goal` and one PR per phase, each started after the previous one merges.                                                                                                                                                   |

## Model

### Permission list (in code, `libs/policy`)

The permission list is the single source of truth. A school combines these permissions into roles but can never invent new ones. A resource joins the list in the same change that adds its endpoints, so the permission grid never offers a permission that does nothing.

**Phase 1** (resources with endpoints today):

| Resource        | Actions                           | Notes                                                                    |
| --------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `organization`  | update, delete                    | Better Auth default                                                      |
| `member`        | create, **read**, update, delete  | Better Auth's defaults have no `read`; we add it                         |
| `invitation`    | create, cancel                    | Better Auth default; its routes are switched off (see below)             |
| `team`          | create, update, delete            | Better Auth default; a team is a campus                                  |
| `ac`            | create, read, update, delete      | Managing roles; Better Auth's custom roles need it                       |
| `campus`        | **readAll**                       | Sees every campus in the school; replaces `seesAllCampuses(owner/admin)` |
| `student`       | create, read, update, **archive** | No `delete`: students are archived, never deleted                        |
| `feeSchedule`   | create, read, update, delete      |                                                                          |
| `schoolAccount` | read, update                      |                                                                          |

**Later additions** (each lands with its feature):

| Resource                 | Actions                                                  | Lands with                                          |
| ------------------------ | -------------------------------------------------------- | --------------------------------------------------- |
| `student`, `feeSchedule` | + readOwn                                                | Phase 4a (student and guardian accounts)            |
| `class`                  | create, read, **readAll**, update, delete, assignTeacher | Phase 4b (class and section model)                  |
| `attendance`             | record, read, readOwn                                    | Attendance feature                                  |
| `exam`                   | create, read, update                                     | Exams feature                                       |
| `result`                 | record, read, readOwn, **publish**                       | Results feature (entering separate from publishing) |
| `payment`                | record, read, readOwn, **void**                          | Payments feature (voided, never deleted)            |

### Roles

| Role                                                           | Defined in                                   | Meaning                                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `owner`                                                        | code: `ac.newRole(statements)`               | Every action, including ones added later. Set only by the super admin or another owner. The last owner can't be removed. |
| `member`                                                       | code: no permissions                         | Everyone added starts here; being added grants nothing                                                                   |
| Custom roles (e.g. `administrator`, `class-teacher`, `bursar`) | `organizationRole` table, one set per school | Each school creates its own from the permission list                                                                     |

- **How roles are stored:** a member's roles are a comma list in `member.role` (`"member,class-teacher,exams-officer"`). Their permissions combine.
- **Starter roles:** creating a school inserts editable starter roles: `administrator`, `teacher`, `bursar` (phase 1), then `student` and `guardian` (phase 4a). Each feature that adds resources also updates the starter roles for new schools; existing schools' roles are left alone, since owners may have edited them.
  - They're inserted in the organization plugin's `organizationHooks.afterCreateOrganization`, so every way of creating a school gets them: today's `CreateSchoolForm`, `seed.ts`, test helpers, and later `POST /platform/schools`.
  - The insert is a direct Kysely write, because Better Auth's `createRole` needs a signed-in session and the new owner has none.
  - They must exist before anyone is assigned one, because `addMember` checks custom role names against the code-defined roles and the `organizationRole` table (`routes/crud-members.mjs`).
- **Role names:** each custom role has a fixed **slug** (`^[a-z0-9-]+$`, never changed after creation) plus an editable display label stored as an extra field on `organizationRole`.

### How far each person can see

`OrgContext` carries these limits, and services filter every query by each one that applies. Out-of-scope rows answer 404.

| Limit                                 | Comes from                                                                              | Filter helper            | Phase |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------ | ----- |
| `campusScope: 'all' \| campusIds[]`   | `campus.readAll`, otherwise the campuses the member belongs to (`teamMember`)           | `inCampusScope` (exists) | 1     |
| `studentScope: 'all' \| studentIds[]` | `<resource>.read` sees everyone; `<resource>.readOwn` sees only linked students         | `inStudentScope` (new)   | 4a    |
| `classScope: 'all' \| classIds[]`     | `class.readAll` sees every class; otherwise only the classes the teacher is assigned to | `inClassScope` (new)     | 4b    |

## Gaps in Better Auth 1.7.7 that we close ourselves

Each was read in `node_modules/better-auth/dist/plugins/organization/`.

1. **Assigning a role lets a member escalate their own access.** `updateMemberRole` (`routes/crud-members.mjs`) only checks `member:update` plus owner protection. It doesn't check that the assigner holds the permissions in the role.
   - Roles are assigned only through our endpoints, and only if the assigner's combined permissions cover everything in the roles being assigned.
   - Better Auth's `/organization/update-member-role`, `/organization/add-member` and the invitation routes go in `disabledPaths`.
   - Role _creation_ is already safe: `createOrgRole` checks every permission against the creator (`checkIfMemberHasPermission`).
2. **Renaming a role takes it away from everyone who holds it.** `updateOrgRole` updates `organizationRole.role` but never `member.role`. Nothing rejects a comma in a role name either, and a comma breaks the stored list. Hence the fixed slug and separate label.
3. **Better Auth only checks a union one permission at a time.** `hasPermissionFn` (`permission.mjs`) passes only if a _single_ role grants _everything_ asked for in one check.
   - The guard always checks one `resource:action`, never a combined set.
   - The UI reads the server-computed union from `GET /me/permissions`. Better Auth's client-side `checkRolePermission` only knows the roles defined in code.
4. **Deleting a role that members still hold** is already refused (`ROLE_IS_ASSIGNED_TO_MEMBERS`). Nothing to add.
5. **`cacheAllRoles`** is an in-memory map, one entry per school, with no size limit. It's harmless now; note it if the number of schools grows large.

## API

### Guard

- `OrganizationAuthGuard` resolves the session and member as it does today.
- It then loads just the member's custom roles: `SELECT permission FROM "organizationRole" WHERE "organizationId" = $1 AND role = ANY($2)`. That's cheaper than `auth.api.hasPermission`, which loads every role in the school.
- It combines those with the roles defined in code, then calls `can(permissions, resource, action)`.
- This costs one extra database read per request and reverses ADR 0002's "no round trip" reasoning, so it needs a new ADR.

### Endpoints

| Endpoint                       | Permission                     | Notes                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me/permissions`          | signed in, active school       | Added to the existing `me` module (`GET /me` already exists). Returns the combined permissions plus `campusScope`, for the UI                                                                                   |
| `GET /members`                 | `member:read`                  |                                                                                                                                                                                                                 |
| `POST /members`                | `member:create`                | Phase 1: adds an **existing** user by `userId`. Phase 2: `{ name, email \| username, password? }` and calls `auth.api.createUser` on the server. Never passes `role`, which on that call is the _platform_ role |
| `PUT /members/:id/roles`       | `member:update`                | Allowed only if the assigner holds every permission in the assigned roles; only an owner can grant `owner`                                                                                                      |
| `DELETE /members/:id`          | `member:delete`                | Better Auth still protects the last owner                                                                                                                                                                       |
| `GET/POST/PATCH/DELETE /roles` | `ac:read/create/update/delete` | Wraps Better Auth's role endpoints; validates the slug and label                                                                                                                                                |
| `POST /platform/schools`       | `superadmin`                   | `createUser` (owner), then `createOrganization({ userId })`, then insert the starter roles                                                                                                                      |
| `/platform/*` others           | `superadmin`                   | Replace an owner, suspend a school, read the audit log                                                                                                                                                          |

### Super admin

- **Platform role:** `superadmin`, the admin plugin's `user.role`.
  - Defined in the admin plugin's own `ac`/`roles` with `adminRoles: ['superadmin']`, because `adminRoles` rejects names it doesn't know.
  - `PlatformAuthGuard` protects `/platform/*`. Test helpers currently set `role = 'admin'` (`base-test.ts:225`) and change with it.
- **Acting inside a school:** an `X-Eduvault-Acting-Org` header.
  - It's honoured only for `superadmin` and silently ignored for everyone else.
  - An unknown school answers 404.
  - It grants **read-only** access: every `read`/`readAll` action and `campusScope: 'all'`.
  - A write (`POST`, `PATCH`, `PUT`, `DELETE`) also needs an `X-Eduvault-Acting-Reason` header (for example a ticket reference). Without it the write answers 403. With it, the write runs with owner-level permissions.
  - **Every** acting request, reads included, writes one `audit_log` row: actor, school, method, path, response status, reason, time. Retention is decided later.

### Better Auth settings

- `emailAndPassword.disableSignUp: true`.
  - This blocks `/sign-up/email` even when the server calls it (`api/routes/sign-up.mjs:145`), so `seed.ts`, the test helpers and the e2e personas all have to change (see Starting from an empty database).
  - It also blocks sign-up through the username plugin, which only hooks `/sign-up/email`.
- `organization({ allowUserToCreateOrganization: false, dynamicAccessControl: { enabled: true }, ... })`.
  - A server call to `createOrganization` with `userId` and no session counts as a system action and skips `allowUserToCreateOrganization` (`routes/crud-org.mjs:56-58`).
  - The same call from a browser is refused.
- `auth.api.createUser` called on the server with no headers is also a system action. It accepts `data` for extra fields such as `username` and `mustChangePassword`.
- `username()` plugin, for anyone without an email.
  - Students: `<school-slug>-<admission number>` (for example `greenfield-0123`). Admission numbers already come from one sequence shared across schools (`CONTEXT.md`), so the slug is there to make the username readable. Changing a school slug would mean regenerating usernames, so slugs become fixed in practice.
  - Guardians without email: a username chosen when the account is created. Guardians with email sign in with it.
- `user.email` can't be empty and must be unique, so username-only accounts get a placeholder email generated from their id.
  - It's never shown in the UI, and the set-password-link path refuses to send to it.
  - Treat it as personal data.

### New tables and fields

| Change                                                                                              | Phase |
| --------------------------------------------------------------------------------------------------- | ----- |
| `organizationRole` (Better Auth, via `api:auth-generate`) plus a label field                        | 1     |
| `user.mustChangePassword`                                                                           | 2     |
| `audit_log` (actor, organization, method, path, status, reason, time)                               | 3     |
| `user.username`, `student.user_id` (nullable), `guardian`, `guardian_student`                       | 4a    |
| Class and section tables, teacher-to-class assignment, `student` linked to a class (designed in 4b) | 4b    |

New domain tables carry `organization_id`, include it in their foreign keys, and get an isolation test.

## Starting from an empty database

1. **First super admin:** run `nx run api:bootstrap-admin` once. It reads `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from the environment, calls `createUser` with `role: 'superadmin'`, and does nothing if that admin already exists. There's no UI for this step. `adminUserIds` can't help, because it needs a user id that doesn't exist yet.
2. **Super admin creates a school:** `POST /platform/schools` creates the school, its owner and its starter roles.
3. **Owner adds people:** `POST /members` adds staff, then students and guardians.

`scripts/seed.ts` becomes exactly this sequence, so seeding also exercises the real onboarding flow. Phase 2 has to land as one change; otherwise neither the local stack nor the tests can create users.

Phase 1 touches these files too, more lightly. It removes the code-defined `admin`, `teacher` and `student` roles, so every `addMember(..., 'teacher' | 'admin')` has to switch to a starter role (or `member` plus a starter role):

- `seed.ts`, lines 130, 140 and 149
- `base-test.ts`'s `addMember` and its role type
- the `crud` and `tenancy` specs
- the e2e personas

The `student` starter role doesn't arrive until phase 4a. Until then, the e2e `student` persona and any test using the old `student` role become a plain `member`, who is refused everywhere; that is the least-privilege check for phase 1. Sign-up keeps working until phase 2.

| Breaks once sign-up is off                             | Today                          | Becomes                                                                                            |
| ------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `apps/api/scripts/seed.ts`                             | `auth.api.signUpEmail`         | Bootstrap admin, then `/platform/schools`, then `/members`                                         |
| `apps/api/test/support/base-test.ts`                   | HTTP `/api/auth/sign-up/email` | A helper that creates users on the server, plus a superadmin helper                                |
| `apps/web-e2e/src/support/personas.ts`                 | HTTP sign-up                   | Created through `/platform/schools` and `/members`; `bootstrap-admin` added to the run-local stack |
| `apps/web-admin/src/components/create-school-form.tsx` | users create schools           | Removed; creating schools moves to the platform console                                            |

## Phases

Each phase ends with `pnpm validate:quick` and `nx run api:test-integration` passing. A phase that changes the schema also runs `api:auth-generate` or a migration, then `pnpm drift:fix`.

`api:auth-generate` runs `scripts/drift-check.ts --write --only=auth`, which starts Postgres through `@eduvault/testcontainers`. **It needs Docker**, as do `pnpm drift:fix` and `api:test-integration`.

- A session without Docker can write all of phase 1's code and unit tests, but not generate the `organizationRole` migration.
- That step belongs under `## E2E checks` in `tasks.md` (or runs in `/ship`), not as an implementation task.
- Code that queries `organizationRole` should use Kysely types that exist only after `pnpm drift:fix` regenerates `db-types.ts`. Until then, tasks may type the row locally and note the follow-up.

| #   | Phase                                                                                                                                                                                                                                                           | Schema change |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 0   | **Done.** File-based TanStack Router in both web apps, and `docs/conventions.md:69` updated (`0d3b7aa`, `f47f655`, `9e4827c`)                                                                                                                                   | No            |
| 1   | Phase-1 permission list; custom roles; starter roles `administrator`, `teacher`, `bursar`; new guard; member and role endpoints that block escalation; `/me/permissions`; remove the admin, teacher and student roles; members and roles screens in `web-admin` | Yes           |
| 2   | `disableSignUp`, `superadmin` role, `bootstrap-admin`, `/platform` create-school-and-owner (API and `web-admin` routes), temporary password with `mustChangePassword`, seed, test helpers and e2e personas rewritten                                            | Yes           |
| 3   | Acting-in-school header (read-only by default, reason needed for writes), `audit_log` of every acting request, platform audit page                                                                                                                              | Yes           |
| 4a  | Student and guardian accounts: username plugin, student usernames from slug and admission number, guardians by email or username, linking tables, `readOwn` and `studentScope`, self-service pages in `web-portal`, `student` and `guardian` starter roles      | Yes           |
| 4b  | Class and section model, teacher-to-class assignment, `class` permissions, `classScope` on `OrgContext`, classes screens in `web-admin`                                                                                                                         | Yes           |
| 5   | Resend behind `EmailSender`; set-password links for accounts with a deliverable email                                                                                                                                                                           | No            |

## Affected projects

| Project                          | Changes                                                                                                                                                                                                                                                                                                                                                                                                                               | Phases   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `apps/api`                       | **Auth setup** (`better-auth-base.ts`): custom roles, `disableSignUp`, username plugin, `disabledPaths`, `superadmin` role. **Guard and auth context**: permissions from the database, both scopes, acting header. **New modules**: `members`, `roles`, `me`, `platform`, `audit`. **Migrations.** `seed.ts`, `bootstrap-admin`. **Tests**: `base-test.ts`, `crud` and `tenancy` specs, new escalation, self-scope and platform specs | 1–5      |
| `apps/web-admin`                 | Members and roles screens, permission grid, nav and routes filtered by permission, platform console, classes and teacher assignment (4b), password-change step; `create-school-form.tsx` removed                                                                                                                                                                                                                                      | 1–4b     |
| `apps/web-portal`                | Self-service pages for students and guardians, username sign-in, password-change step                                                                                                                                                                                                                                                                                                                                                 | 2, 4a    |
| `apps/web-e2e`                   | Personas and the log of created test records rebuilt on custom roles and the platform flow                                                                                                                                                                                                                                                                                                                                            | 1–4b     |
| `libs/policy`                    | Rewritten: permission list, `owner` with every action, `member` with none, `can()` checks resolved permissions, no `ROLE_NAMES`/`seesAllCampuses`, starter roles, the "only grant what you hold" check                                                                                                                                                                                                                                | 1–4b     |
| `libs/api-contract`              | Contracts for `/members`, `/roles`, `/me/permissions`, `/platform/*` and the self-service routes                                                                                                                                                                                                                                                                                                                                      | 1–4b     |
| `libs/auth-client`               | `permissions.tsx` (`PermissionsProvider`, `useCan`, `<Can>`, which take the permission map as a prop), `change-password-form.tsx`, sign-in without sign-up and with username                                                                                                                                                                                                                                                          | 1, 2, 4a |
| `libs/shared`                    | Possibly shared permission types                                                                                                                                                                                                                                                                                                                                                                                                      | 1        |
| `libs/ui`, `libs/testcontainers` | No change                                                                                                                                                                                                                                                                                                                                                                                                                             | –        |
| Docs and skills                  | New ADR; ADR 0005 amended; `CONTEXT.md` (roles, superadmin, guardian, class); `docs/conventions.md:69` (`permissions.tsx`); `.claude/skills/run-local`, `eduvault-e2e`                                                                                                                                                                                                                                                                | 0–4b     |

`libs/policy` is `scope:shared`, so the SPAs can import `can()`. It imports `better-auth/plugins/access`, and the SPA lint config forbids importing `better-auth` directly. That rule should only apply to the apps' own imports, but confirm it with a lint and typecheck run once a page imports `@eduvault/policy`.

## Folder structure

Both apps use TanStack Router's **file-based routes** (phase 0, already committed):

- `src/routes/*.tsx` are thin route files: `createFileRoute`, a `loader` that fills the cache through `queryClient`, and `component` taken from `pages/`.
- `src/routeTree.gen.ts` is generated.
- `src/queries.ts` holds `queryOptions`.
- `src/query-client.ts` holds the shared `QueryClient`.
- `src/router.tsx` only builds the router with `context: { queryClient, api }`.

This plan follows that layout, which `docs/conventions.md:69` describes. Phase 1 only adds `src/permissions.tsx` to that line.

Permission gating fits the route context:

- The root route's `beforeLoad` loads `/me/permissions` through `queryClient` (`mePermissionsQueryOptions` in `queries.ts`) and puts it on the context.
- Each gated route's `beforeLoad` calls `can(context.permissions, resource, action)` and redirects if it fails.
- Nav links and buttons use `useCan`.

Legend: `+` new, `✎` changed, `✗` removed, `(Pn)` phase.

### `apps/web-admin` (staff)

```
src/
├── main.tsx
├── app.tsx                        ✎ sign-in → must-change-password (P2) → "no school assigned" (P2) → router
├── router.tsx                     ✎ context gains permissions (P1)
├── routeTree.gen.ts               generated
├── query-client.ts
├── queries.ts                     ✎ mePermissions, members, member, roles, role (P1); platformSchools, audit (P2–3)
├── permissions.tsx                + wires /me/permissions into PermissionsProvider (P1)
├── api.tsx · auth.ts · env.ts
├── test-utils.tsx                 ✎ renderWithApi also takes a fake permission map (P1)
├── routes/
│   ├── __root.tsx                 ✎ beforeLoad loads permissions; nav filtered with useCan (P1)
│   ├── index.tsx                  ✎ students; beforeLoad needs student:read (P1)
│   ├── campuses.tsx               ✎ gated (P1)
│   ├── fees.tsx                   ✎ gated (P1)
│   ├── members/
│   │   ├── index.tsx              + member:read (P1)
│   │   └── $memberId.tsx          + member:update (P1)
│   ├── roles/
│   │   ├── index.tsx              + ac:read (P1)
│   │   ├── new.tsx                + ac:create (P1)
│   │   └── $roleSlug.tsx          + ac:update (P1)
│   ├── classes/
│   │   ├── index.tsx              + class:read (P4b)
│   │   └── $classId.tsx           + sections and teacher assignment; class:update, class:assignTeacher (P4b)
│   ├── platform.tsx               + layout; beforeLoad needs superadmin (P2)
│   └── platform/
│       ├── schools/index.tsx      + list and create schools (P2)
│       ├── schools/$schoolId.tsx  + owner, suspend, "act in this school" (P2–3)
│       └── audit.tsx              + acting-in-school audit log (P3)
├── pages/
│   ├── students-page.tsx          ✎ actions shown or hidden per permission
│   ├── campuses-page.tsx          ✎
│   ├── fees-page.tsx              ✎
│   ├── members-page.tsx           + (P1)
│   ├── member-page.tsx            + assign or remove roles and campuses (P1)
│   ├── roles-page.tsx             + (P1)
│   ├── role-page.tsx              + label and permission grid, used for both new and edit (P1)
│   ├── classes-page.tsx           + (P4b)
│   ├── class-page.tsx             + (P4b)
│   ├── platform-schools-page.tsx  + (P2)
│   ├── platform-school-page.tsx   + (P2–3)
│   └── platform-audit-page.tsx    + (P3)
└── components/
    ├── error-message.tsx
    ├── create-school-form.tsx     ✗ (P2)
    ├── add-member-dialog.tsx      + (P1)
    ├── role-assignment-form.tsx   + only offers roles you're allowed to grant (P1)
    ├── permission-matrix.tsx      + resources × actions checkbox grid (P1)
    ├── create-school-dialog.tsx   + school plus first owner (P2)
    └── acting-school-banner.tsx   + (P3)
```

### `apps/web-portal` (students and guardians)

Phase 4a only covers what exists: the student's own record and fees. Results and attendance pages arrive with those features.

```
src/
├── main.tsx
├── app.tsx                        ✎ sign-in with username or email (P4a) → must-change-password (P2) → router
├── router.tsx · routeTree.gen.ts · query-client.ts
├── queries.ts                     ✎ mePermissions, myProfile, myFees, children (P4a)
├── permissions.tsx                + (P4a)
├── api.tsx · auth.ts · env.ts · test-utils.tsx
├── routes/
│   ├── __root.tsx                 ✎ beforeLoad loads permissions; guardian child switcher (P4a)
│   ├── index.tsx                  ✎ becomes my-profile (P4a)
│   ├── fees.tsx                   ✎ becomes my-fees (P4a)
│   ├── children.tsx               + guardian picks which child to view (P4a)
│   ├── results.tsx                + with the results feature
│   └── attendance.tsx             + with the attendance feature
├── pages/
│   ├── students-page.tsx          ✗ staff-style page (P4a)
│   ├── fees-page.tsx              ✗ replaced by my-fees-page (P4a)
│   ├── my-profile-page.tsx        + (P4a)
│   ├── my-fees-page.tsx           + (P4a)
│   ├── children-page.tsx          + (P4a)
│   ├── my-results-page.tsx        + with the results feature
│   └── my-attendance-page.tsx     + with the attendance feature
└── components/
    ├── error-message.tsx
    └── child-switcher.tsx         + (P4a)
```

## Still open

All of these are deliberately put off; none block phase 1.

- **Class model details** (phase 4b): what class, section and stream mean, how students move up between sessions, and whether one subject teacher can cover several classes. Settle these when 4b is proposed.
- **Retention for `audit_log`** (phase 3).
- **Results, attendance, exams and payments**: each is a separate feature that adds its permissions and updates the starter roles when it lands.

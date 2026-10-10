# PRD: Staff and members

- Status: built in M1.3
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M1.3` (see [roadmap](README.md))
- Related: [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (Roles, Gaps 1 and 4, Endpoints, phase 2 temporary passwords), [data-model-overview.md](../brainstorming/data-model-overview.md#permission-list) (one-senior-role and handover guardrails), [21-roles-and-permissions.md](21-roles-and-permissions.md), [22-staff-leave.md](22-staff-leave.md), [technical reference](../technical-reference.md) decisions `D-001`, `D-006`, `D-010`, `D-011`, `D-015`, `D-025`

## Summary

The owner (or anyone given `member:create`) adds people to a school, gives them roles and chooses the campuses they work on. Nobody signs up. A new account starts as a plain member who can do nothing, gets a temporary password, and gains access only through roles. Role changes go through our own endpoint so nobody can hand out access they don't hold themselves.

## Who uses it

| Persona (seed)                        | Permission(s)                  | What they can do here                                                                                                                |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Owner (Funmi Adeyemi)                 | every permission (`owner`)     | List and open members, add members, assign and remove any role except `owner`, change campuses, remove members except the last owner |
| Administrator (Tunde Bakare)          | `member:read`, `member:update` | List and open members; assign or remove only roles whose permissions he holds; change campuses. Cannot add or remove members         |
| Principal (Grace Nwosu, ready-made)   | none of `member:*`             | No access; nav link hidden                                                                                                           |
| Bursar, Teacher, Member with no roles | none of `member:*`             | No access; nav link hidden                                                                                                           |
| Super admin acting read-only          | every `read`                   | Sees the list and member pages; every control that writes is hidden                                                                  |
| Super admin acting with a reason      | everything                     | As owner; each request audited ([M1.5])                                                                                              |

Scopes:

- Campus scope applies to the list and the member page (SM-3): a viewer without `campus:readAll` sees only members who share at least one campus with them. A member outside scope answers 404.
- Class and student scopes do not apply.
- In scope without `member:read` answers 403 [tenancy-001]. A member id from another school answers 404.

## Screens

### Staff and members (list)

- **Route:** `/members` in `web-admin`. Nav section **People**, second item (after Students). Phase label `P1`. Gate `member:read`; without it the nav link is hidden and the route's `beforeLoad` redirects to the first allowed page.
- **Header**
  - Title: "Staff and members".
  - Description: "{n} people in {school name}" (for example "10 people in Greenfield College"). The count is staff only (SM-8).
  - Info tip: "Nobody signs themselves up. The owner adds people; each starts as a plain member with no permissions until roles are added."
  - Action: **Add member** (primary, icon user-plus), gate `member:create`, hidden without it. Opens the Add a member sheet.
- **Toolbar** (inside the card)
  - Search input, placeholder "Search name, title or role". Matches name, title and role slugs, case-insensitive.
  - Role select, label "Role": first option "Any role", then every role except `member` by label (Owner, Administrator, Teacher, Bursar, Principal, Student, Guardian, then the school's own roles).
- **Table** (10 rows a page, pager "Showing {from} to {to} of {n}", Previous / Next). No sort control; order is by name. Portal-only members (holding only `member`, `student`, `guardian`) are left out unless the Role filter is Student or Guardian (SM-8).

  | Column   | Content                                                                                                                                                                                                                                                                                                   |
  | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Name     | Avatar, name, and the member's title underneath                                                                                                                                                                                                                                                           |
  | Roles    | A badge per role except `member`, coloured by source (Owner: default; Ready-made: secondary; Your own: brand). Tooltip: "{Built in \| Ready-made role \| Your own role} · {n \| all} permissions". If the member holds only `member`: outline badge "No roles", tooltip "Membership alone grants nothing" |
  | Campuses | Campus names, comma separated                                                                                                                                                                                                                                                                             |

  The whole row opens the member page. No row actions.

- **Empty state:** icon users, "No one matches".
- **Add a member** (sheet, opened by Add member or the command-menu action "Add a staff member")
  - Title "Add a member". Description "They start as a plain member with no permissions. Add roles on their page."
  - Fields:

    | Label     | Control                                           | Required            | Default                                            | Validation                                                                     |
    | --------- | ------------------------------------------------- | ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
    | Full name | text                                              | yes                 | empty (the prototype's "Bisi Okafor" is demo data) | non-empty after trim, at most 120 characters                                   |
    | Email     | email                                             | yes                 | empty                                              | a valid email address; staff have no usernames (SM-5)                          |
    | Job title | text                                              | no                  | empty (saved as "New member")                      | at most 80 characters (SM-1)                                                   |
    | Campuses  | one checkbox per campus, showing name and address | at least one (SM-4) | the active campus ticked                           | hint "They only see these campuses, unless a role lets them see every campus." |

  - Buttons: **Cancel** (ghost), **Create account** (primary, icon user-plus, submit).
  - On submit: creates the user with a temporary password and `mustChangePassword`, adds them to the school with role `member` only, adds them to each ticked campus, then navigates to the new member's page, which shows the temporary-password callout. No toast. When the email already has an Eduvault account (rule 4), the callout instead reads "{name} already has an Eduvault account. They sign in with their existing password."
  - Errors, shown inline under the field: "Enter their full name.", "Enter their email address.", "Choose at least one campus.", "{email} is already on the staff list." (409). These strings are new; the prototype submits without client validation.
- **States:** loading shows table skeleton rows; a failed query renders `ErrorMessage`; 403 is unreachable from the UI (route redirects); acting read-only hides Add member.

### Member

- **Route:** `/members/$memberId` (`memberId` is Better Auth `member.id`). Not in nav; the People › Staff and members link stays highlighted. Phase `P1`. Gate `member:read` (page renders read-only without `member:update`).
- **Breadcrumb:** "People › Staff and members › {name}".
- **Header**
  - Title: member's name.
  - Description: "{title} · {email or username}".
  - Overflow menu (icon "More actions"): **Remove from school…** (destructive, icon trash-2), gate `member:delete`. The menu is absent when this member is the school's last owner.
  - The prototype's "Sign in as {first name}" button is demo tooling; out of scope.
- **New-account callout** (only right after Add member, success tone): "Account created. Temporary password `{password}`. They change it at first sign-in. Next, give them a role below." Shown once; leaving the page loses it (SM-6).
- **Layout:** two columns. Left: Roles card, then Campuses card. Right: What they can do card.

#### Roles card (the role-assignment wizard)

- Title "Roles" (icon shield-check). Description "Someone with more than one role can do everything each role allows."
- With `member:update`, a stepper sits at the top: **roles → campuses → review** when the draft needs a campus step, otherwise **roles → review**.
- **Step 1, roles**
  - Built-in roles the member holds (`owner`, and `member` which everyone holds) show as badges with "Built-in roles can’t be removed here." and a separator. Owner is never offered as a checkbox; it changes only through the handover in Settings › Danger zone (SM-7).
  - One checkbox row per assignable role: label, source badge (Built in / Ready-made / Your own), description, and a badge "Adding" (brand) or "Removing" (warning) when the draft differs from what they hold.
  - Assignable = roles other than `owner` and `member` that the editor can grant (`canGrantRole`), plus roles the member already holds.
  - A held role the editor could not grant is shown checked but disabled, tooltip "It allows things you can’t do yourself, so you can’t give it out" (the prototype leaves it enabled and then refuses on save; see gaps).
  - Without `member:update`: only the roles they hold, all disabled, tooltip "You can’t change roles".
  - Empty: icon shield, "No other roles", description "Choose a role to give this person access." (description only for editors).
  - Disclosure, icon lock: "{n} roles you can’t assign", listing those roles disabled with the same tooltip, then "You can only give someone a role if you can already do everything it allows."
  - Combination error (see rules 9–11) shows as a danger callout with the message below the list, and disables **Next**.
  - Footer, only once the draft differs: a summary "{n} more" (success), ", " , "{m} fewer" (destructive), " things they can do", or "No change to what they can do"; **Discard** (ghost) resets the draft; **Next** (primary, arrow-right).
- **Step 2, campuses** (only when the draft needs it, rule 12)
  - "Where will {first name} work? These roles only apply on the campuses switched on here."
  - One switch per campus, prefilled with their current campuses.
  - With none on: warning callout "Choose at least one campus."
  - Footer: **Back**, **Next** (disabled with tooltip "Choose at least one campus" while none is on).
- **Step 3, review**
  - Badges for the draft roles (excluding `member`), or "No roles".
  - Badges "Adding {role}" (brand) and "Removing {role}" (warning).
  - "Will be able to" (success, trending-up) with one line per gained capability, from the plain-language summary in [21](21-roles-and-permissions.md#plain-language-areas).
  - "Will no longer be able to" (destructive, trending-down) with one line per lost capability.
  - "Campuses: {names}" plus a "Changed" badge when the campus step changed them, or "These roles see every campus." when no campus step was needed.
  - Combination error callout, if any.
  - "Takes effect on their next request." (tiny, muted).
  - Footer: **Back**, **Review and save** (primary, icon check, gate `member:update`).
- **On save:** `PUT /members/:id/roles`. Success toast: "Saved. **{name}** now has {n} permissions." The wizard resets to step 1. Refusals show a danger toast with the server message:
  - "Refused: needs member:update (403)." becomes "You can’t change roles." in the build (the prototype's wording names the permission).
  - "Refused (403): you don’t hold {permissions}, so you can’t grant {role}." / "… can’t remove {role}." (rule 6). The build shows role labels and plain-language capabilities, not permission strings.
  - The combination messages in rules 9–11.
  - "Choose at least one campus."

#### Campuses card

- Title "Campuses" (icon building-2). Description "Which campuses they see, unless a role lets them see every campus."
- One switch per campus of the school. Disabled without `member:update`.
- Each toggle saves at once through `PUT /members/:id/campuses` and toasts "{name} added to {campus}." or "{name} removed from {campus}."
- The build refuses switching off the last campus (rule 13) with "Choose at least one campus."; the prototype allows it.

#### What they can do card

- Title "What they can do" (icon key-round).
- One line per capability from the plain-language summary of their combined permissions (see [21](21-roles-and-permissions.md#plain-language-areas)), each with a check icon. Empty: "Nothing yet. Give them a role to get started."
- Then a key–value list: **Campuses**: "Every campus" or the campus names; **Classes**: "Every class", "{class names} (classes they teach)", or "No classes assigned yet". Classes needs the class model ([M2.3]); until it lands the row reads "Every class" for anyone with `class:readAll` and is hidden otherwise.

#### Remove dialog

- Opened by **Remove from school…**.
- Title "Remove {name}?". Description "They lose access to {school name}. Records they created keep their name."
- Body: warning callout "Payments recorded and approvals given stay attributed to them."
- Buttons: **Cancel** (ghost), **Remove member** (destructive, icon trash-2, gate `member:delete`).
- On success: toast "{name} removed." and navigate to Staff and members.

#### States

- **Not found** (unknown id, another school, or outside campus scope): title "Member not found", empty state "We couldn’t find that member", description "It may have been moved, or it may belong to a campus or class you don’t look after.", button **Go back** (to Staff and members).
- **Read-only** (no `member:update`, or super admin acting without a reason): no stepper, no footers, switches disabled, Remove hidden.
- **Loading / error:** skeleton cards; `ErrorMessage` on failure.

### Touchpoints elsewhere

- **Dashboard › Needs you today** (anyone with `member:update`): one task per member with no role besides `member`: title "{name} has no role yet", sub "They can sign in but can’t see anything until you give them a role.", button "Give a role" to their member page. Spec owned by [M2.6]; listed so the member query supports it.
- **Dashboard for a member with no permissions:** "Welcome, {first name}" and the empty state "No access yet" / "You’re on the staff list, but you can’t see anything until the owner gives you a role. This page fills in once they do." with **See my access**. Owned by [M2.6].
- **Command menu:** "Add a staff member" (icon user-round-plus, hint "People", gate `member:create`) opens the list with the sheet open.
- **Sidebar user menu:** under the name, the labels of the user's roles except `member`, joined by ", ", or "Member, no roles".
- **Settings › Danger zone › Hand over the school** ([M2.2]) reuses rule 9 and drops administrator or principal from the new owner.
- **Campuses** ([M2.2]): creating a campus adds its creator to it; the campus card counts "Staff" from campus membership.
- **Staff leave** ([M3.6], [22](22-staff-leave.md)): a "Leave" card on the member page for `leave:approve` holders and an "On leave" badge on the list on approved days; owned by 22.

## Business rules

1. Nobody signs up. Accounts are created only by `POST /members` (needs `member:create`) or by the platform console: create school with its first owner in M1.2 ([D-011](../technical-reference.md#decision-log)) and replace owner in M1.5.
2. A new member holds exactly `member` and gains nothing until another role is added. The response to `POST /members` never carries a role from the request; `auth.api.createUser` is never passed `role` (that is the platform role).
3. A new account gets a server-generated temporary password and `user.mustChangePassword = true`. The password is returned once in the create response and never stored or shown again (M1.2 owns the change-password step).
4. Adding someone whose email already belongs to a user in another school adds that existing user as a member, without a new password (SM-2). Adding someone already in this school answers 409.
5. Role changes go only through `PUT /members/:id/roles`. Better Auth's `/organization/update-member-role`, `/organization/add-member` and the invitation routes are in `disabledPaths` (permissions doc, Gap 1).
6. **No escalation (`canGrantRole`).** For every role being added **or removed**, the editor's combined permissions must include every permission in that role. Otherwise 403 naming the role. `member` can always be kept. Granting or removing `owner` is refused on this endpoint (409); ownership changes only by handover (SM-7).
7. The last owner can never lose `owner` or be removed (409). Better Auth's `removeMember` also refuses it (`YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER`) and only lets an owner remove an owner.
8. Removing a member (rule 15) follows rule 6 too: the remover must be able to grant every role the target holds. A member cannot remove themselves (SM-9).
9. **One senior role.** A person holds at most one of `owner`, `administrator`, `principal` (`SENIOR_ROLES`, tied to slugs per [D-006](../technical-reference.md#decision-log); `principal` is a ready-made role in every school, [D-010](../technical-reference.md#decision-log)). Message: "{Role} and {Role} can’t be held by the same person. Choose one senior role."
10. **Students hold no staff roles.** A draft containing `student` may contain only `member`, `student` and `guardian`. Message: "A student can’t also hold staff roles ({roles})."
11. **Portal-only users stay portal-only.** A member whose current roles are only from {`member`, `student`, `guardian`} cannot be given any other role. Message: "{name} is a portal user (student or guardian) and can’t be given {roles}." The prototype checks only the hard-coded `STAFF_ROLES` (`teacher`, `bursar`, `administrator`, `principal`), so a school's own role slips through; the build uses "any role outside {member, student, guardian}". A staff member may also be a guardian (a teacher who is a parent); the reverse order (guardian first, then a staff role) is refused by this rule, see SM-10.
12. The campus step appears when the draft's combined permissions lack `campus:readAll` (the prototype asks when any single role lacks it; see gaps). When it appears, at least one campus is required.
13. A member always belongs to at least one campus of the school. The campus endpoint refuses an empty set (400).
14. An editor can only add a member to, or remove them from, campuses in the editor's own campus scope.
15. Removing a member deletes the `member` row and their `teamMember` rows for this school's campuses (Better Auth does both in one transaction). The `user` row stays, because one account can span schools. Every record they created or decided keeps `created_by`, `recorded_by`, `approved_by` or `rejected_by` ([D-025](../technical-reference.md#decision-log)) pointing at `user.id`, so it still shows their name.
16. Role and campus changes take effect on the member's next request, because the guard reads roles and `teamMember` per request (see [21](21-roles-and-permissions.md)).
17. A role-combination or escalation failure leaves the member unchanged: roles and campuses save in one transaction.

## Data

- **Better Auth tables** (no new tables): `user`, `member` (`role` is the comma list of slugs), `team`, `teamMember`, `organizationRole`. See [architecture.md](../architecture.md#organization-plugin-teams-enabled).
- **New column, not in any data-model doc:** a job title per member ("Proprietor", "Bursar, Lekki", default "New member"), stored as `member.title`, a Better Auth `schema.member.additionalFields` entry generated by `api:auth-generate` (SM-1). It is per school, optional in Add member, and editable on the member page in a later slice.
- **From M1.2:** `user.mustChangePassword` (permissions doc, New tables and fields, phase 2), which lands before this slice.
- Staff sign in by email. `user.username` arrives with the username plugin at admission in M2.4, for students and guardians ([D-015](../technical-reference.md#decision-log), SM-5).
- Migrations: one `api:auth-generate` migration for the member title, then `pnpm drift:fix`.

## API

All under the `members` module. Contract types in `@eduvault/api-contract` (`contract.members`). Member ids are Better Auth `member.id`.

| Method | Path                    | Permission      | Request                                                                                 | Response                                                                                                                                                  | Errors                                                                                                                                                                                                          |
| ------ | ----------------------- | --------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/members`              | `member:read`   | query `q?`, `role?` (slug), `page?`                                                     | `{ items: MemberSummary[], total }`; `MemberSummary = { id, userId, name, email \| null, username \| null, title, roles: string[], campusIds: string[] }` | 403 without `member:read`                                                                                                                                                                                       |
| GET    | `/members/:id`          | `member:read`   | —                                                                                       | `MemberDetail = MemberSummary & { permissions: Record<resource, action[]>, campusScope: 'all' \| string[], classScope: 'all' \| string[] }`               | 404 other school or out of campus scope; 403 without permission                                                                                                                                                 |
| POST   | `/members`              | `member:create` | `{ name, email, campusIds: string[] (≥1), title? }`                                     | `{ member: MemberDetail, temporaryPassword: string \| null }` (null when an existing user was added, rule 4)                                              | 400 invalid; 404 a campus id not in this school or not in the editor's scope; 409 already a member                                                                                                              |
| PUT    | `/members/:id/roles`    | `member:update` | `{ roles: string[], campusIds?: string[] }` (`campusIds` required when rule 12 applies) | `MemberDetail`                                                                                                                                            | 403 escalation (rule 6), body names the role; 404 member or campus out of scope, or unknown role slug; 409 `LAST_OWNER`, `OWNER_BY_HANDOVER`, `ROLE_COMBINATION` (rules 9–11); 400 no campus when one is needed |
| PUT    | `/members/:id/campuses` | `member:update` | `{ campusIds: string[] }` (≥1)                                                          | `MemberDetail`                                                                                                                                            | 400 empty; 404 member or campus out of scope                                                                                                                                                                    |
| DELETE | `/members/:id`          | `member:delete` | —                                                                                       | `{ id }`                                                                                                                                                  | 403 escalation (rule 8); 404 out of scope; 409 `LAST_OWNER`, `SELF_REMOVAL`                                                                                                                                     |

- `POST /members` calls `auth.api.createUser` on the server without headers (a system action), then adds the member and team memberships in our service. It never calls Better Auth's `addMember` from the browser.
- `PUT /members/:id/roles` writes `member.role` only after our checks pass, through `AuthService.api.updateMemberRole` with the caller's headers (the route has `requireHeaders: true`; Better Auth then re-checks `member:update`, which is harmless). `disabledPaths` is enforced only in Better Auth's HTTP router (`onRequest`), so this server-side call still works after the public path is disabled.
- `GET /me/permissions` belongs to M1.1; its shape is in [21](21-roles-and-permissions.md#get-mepermissions).

## Acceptance criteria

1. **List gate.** Given the bursar (no `member:read`), when she opens `/members`, then she is redirected and the People nav shows no "Staff and members"; `GET /members` answers 403.
2. **List.** Given the owner, when she opens Staff and members, then she sees every member with their non-`member` roles as badges and "No roles" for Kemi Lawson; typing "bursar" leaves Chika Eze and Yemi Alade.
3. **Add.** Given the owner, when she adds "Bisi Okafor", `bisi.okafor@greenfield.edu.ng`, Lekki, then she lands on Bisi's page with the callout showing a temporary password, Bisi holds only `member`, belongs to Lekki, and `mustChangePassword` is true.
4. **Add without permission.** Given the administrator, then no Add member button shows and `POST /members` answers 403.
5. **Duplicate.** Given Chika is already a member, when the owner adds her email again, then 409 and the sheet shows "{email} is already on the staff list."
6. **Escalation refused.** Given the owner created "Fees approver" (holds `adjustment:approve`), when the administrator opens Kemi's page, then Fees approver is disabled under "{n} roles you can’t assign" (with Bursar, Principal, Student and Guardian) (and the API refuses `PUT … { roles: ['member','fees-approver'] }` with 403 naming it).
7. **Removing a role you can't grant.** Given Grace holds `principal`, when the administrator (lacks `adjustment:approve`, `leave:approve`) tries to remove it, then 403 and Grace keeps it.
8. **Grant within your permissions.** Given the administrator, when he gives Kemi `teacher` on Lekki, then the review lists the gained capabilities, saving toasts "Saved. **Kemi Lawson** now has 4 permissions.", and Kemi's next request passes `student:read` (she sees only students in classes she teaches, none yet).
9. **Campus step.** Given the draft is `teacher` only, then the wizard shows roles → campuses → review; given the draft is `administrator` only, then it shows roles → review with "These roles see every campus."
10. **One senior role.** Given Grace holds `principal`, when the owner ticks Administrator, then the danger callout reads "Administrator and Principal can’t be held by the same person. Choose one senior role." and Next is disabled; the API answers 409.
11. **Student.** Given Ada holds `student`, when anyone tries to add `teacher`, then 409 "A student can’t also hold staff roles (Teacher)."
12. **Portal user.** Given Ngozi holds only `guardian`, when anyone adds a school's own role, then 409 with the portal-user message.
13. **Last owner.** Given Funmi is the only owner, then her page shows no Remove menu, `DELETE /members/{funmi}` answers 409, and no roles request can take `owner` from her.
14. **Remove.** Given the owner removes Kemi, then the toast reads "Kemi Lawson removed.", Kemi's next request answers 403 (no school), her `user` row remains, and anything she recorded still shows her name.
15. **Campus toggle.** Given the owner switches Ikeja on for Chika, then the toast reads "Chika Eze added to Ikeja." and Chika's next request includes Ikeja in campus scope; switching off her only campus is refused.
16. **Isolation.** Given a member of another school, when the owner requests `GET /members/{id}`, then 404.
17. **Read-only acting.** Given a super admin acting without a reason, then the list and pages render with no Add, no wizard footer, disabled switches and no Remove.

## Tests

- **Unit (`nx run policy:test`)**: `canGrantRole` (owner-only `owner`, `member` always, missing list); `validateRoleCombo` for every rule 9–11 message, including a custom role on a portal-only user; `needsCampusStep` from combined permissions.
- **Unit (`nx run web-admin:test`)**: members page renders badges and "No roles"; search and role filter; wizard step order with and without the campus step; disabled role rows and the "roles you can’t assign" disclosure; Remove hidden for the last owner; read-only render without `member:update`.
- **Integration (`nx run api:test-integration`)**
  - Isolation: `GET/PUT/DELETE /members/:id` for another school's member answers 404 [tenancy-002]; for a member on a campus outside the editor's scope answers 404.
  - Escalation: administrator assigning a role with `adjustment:approve` answers 403; removing it answers 403; owner succeeds.
  - Disabled Better Auth paths: `/api/auth/organization/update-member-role` and `/add-member` answer 404.
  - Last owner: remove and role change both answer 409.
  - Combinations: 409 for each of rules 9–11.
  - Create: `mustChangePassword` set, only `member`, temporary password returned once, existing-user path returns null.
  - Remove: `member` and `teamMember` rows gone, `user` row kept.
- **E2E (opt-in, `eduvault-e2e`)**: owner adds a member and assigns Teacher on one campus through the wizard; administrator sees a role locked under "roles you can’t assign"; the new member signs in, changes the temporary password and sees only Students.

## Open decisions

| #     | Question                                                                                                                                                                         | Recommendation                                                                                                                                                 | Confidence                                                                                          | Decided                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| SM-1  | Where does a member's job title live? Options: `member.title` via Better Auth `additionalFields`; a domain `staff_profile (organization_id, user_id, title)` table; drop titles. | `member.title` additional field, editable later on the member page; optional in Add member. It is per school, as titles are.                                   | Medium: simplest, but nothing in the prototype edits it yet                                         | Adopted                                                                                          |
| SM-2  | Adding an email that already has a user (from another school). Options: add the existing user with no new password; refuse.                                                      | Add the existing user; return `temporaryPassword: null` and show "{name} already has an Eduvault account. They sign in with their existing password."          | Medium: matches "one account works across schools" in the permissions doc                           | Adopted                                                                                          |
| SM-3  | Does campus scope limit the members list? Options: every member visible to `member:read`; only members sharing a campus with the viewer.                                         | Share-a-campus filter for viewers without `campus:readAll`, 404 outside it; editors can only assign campuses in their scope.                                   | Medium: keeps a campus head from managing another campus's staff; no starter role is affected today | Adopted                                                                                          |
| SM-4  | Is a campus required when adding? The prototype silently falls back to the first campus.                                                                                         | Required, at least one, defaulting to the active campus.                                                                                                       | High: a member with no campus sees nothing and the wizard already requires one                      | Adopted                                                                                          |
| SM-5  | Staff accounts by username (no email) in M1.3?                                                                                                                                   | Email only for staff in M1.3; usernames arrive with the username plugin in M2.4 (students and guardians). Keep the field label "Email" until then.             | Medium: the username plugin is scheduled with portal accounts                                       | Adopted; usernames arrive at admission in M2.4 ([D-015](../technical-reference.md#decision-log)) |
| SM-6  | Can a lost temporary password be reissued?                                                                                                                                       | Yes, later: a "Reset password" row action that issues a new temporary password (needs `member:update`); out of scope for M1.3.                                 | Medium                                                                                              | Adopted                                                                                          |
| SM-7  | How does someone become an owner besides handover? Options: owners can grant `owner` on the member page; handover only; super admin only.                                        | Handover (M2.2) and the platform console (M1.5) only; the roles endpoint refuses `owner`.                                                                      | Medium: matches the prototype's wizard, which never offers owner                                    | Adopted                                                                                          |
| SM-8  | Who appears on "Staff and members"? Students and guardians are members too and would swamp the list.                                                                             | Hide portal-only members (only `member`, `student`, `guardian`) unless the Role filter is Student or Guardian; the count in the description counts staff only. | Medium                                                                                              | Adopted                                                                                          |
| SM-9  | May a member remove themselves?                                                                                                                                                  | No (409 `SELF_REMOVAL`); leaving a school is a separate, later action.                                                                                         | Medium                                                                                              | Adopted                                                                                          |
| SM-10 | Can an existing guardian (portal-only) later become staff, for a parent hired as a teacher?                                                                                      | Not through role assignment; the owner adds them with their staff email (rule 4 reuses the user). Revisit if schools ask.                                      | Low: rare, and rule 11 as written in the prototype forbids it                                       | Adopted                                                                                          |

## Prototype gaps noticed

- Add member pre-fills "Bisi Okafor" and her email, and pre-ticks Lekki: demo data.
- Add member has no client validation and assigns Lekki when no campus is ticked.
- The temporary password `Green-{n}` is derived from the school name and member count; the build generates a random one.
- Every new member gets title "New member" and no screen edits titles.
- A held role the editor can't grant is left enabled in the wizard; unticking it is refused only on save.
- The campus step triggers when any one role lacks `campus:readAll`, even if another drafted role grants it (so Administrator + Teacher asks for campuses but sees every campus).
- The Campuses card lets you switch off every campus; the wizard requires one. Two paths edit the same thing with different rules.
- `STAFF_ROLES` is hard-coded, so the portal-only rule misses the school's own roles.
- The review step's "This is the last owner. Removing owner is refused." can never show, because owner is never in the draft.
- The member page computes a per-pillar permission accordion and "granted by" tooltips but never renders them.
- No self-removal or outranking check on Remove.
- The members list has no campus-scope filter and no sort.
- Error toasts name raw permissions ("needs member:update (403)"); the build uses plain language.
- "Records they created keep their name" needs records to reference `user.id`; the prototype conflates member and user ids.

## Dependencies

- **M1.1**: permission list in `libs/policy`, the per-request guard, `/me/permissions`, nav gating, and the starter roles (Administrator, Teacher, Bursar, Principal, Student, Guardian) seeded at school creation (`afterCreateOrganization`), so the wizard has roles to assign ([D-010](../technical-reference.md#decision-log)). `member` (create, read, update, delete) joins the permission list in this slice.
- **M1.2**: `mustChangePassword`, the change-password step, server-side `createUser` and create school.
- **M1.4** (role editor) follows this slice; the wizard assigns any role the school creates there without change.
- **M2.2** for the handover that changes owners; **M2.3** for the Classes line on the member page; **M2.6** for the dashboard tasks.

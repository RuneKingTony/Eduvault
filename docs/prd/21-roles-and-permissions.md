# PRD: Roles and permissions

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M1.4` (see [roadmap](README.md)); the permission list, `/me/permissions` and the ready-made starter roles, Principal included, are `M1.1` ([D-010](../technical-reference.md#decision-log))
- Related: [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md), [02-foundation-permissions-and-scopes.md](02-foundation-permissions-and-scopes.md) (M1.1), [data-model-overview.md](../brainstorming/data-model-overview.md#permission-list), [20-staff-and-members.md](20-staff-and-members.md), [technical reference](../technical-reference.md) decisions [D-001, D-006, D-010, D-034](../technical-reference.md#decision-log)

## Summary

Each school decides what its roles allow. The owner (or anyone given `ac:*`) edits ready-made roles and creates the school's own, choosing in plain language what each part of the app allows ("No access", "Can see", "Can change") rather than ticking raw permissions. Nobody can put access into a role that they don't hold themselves. A role keeps a fixed slug, so renaming it never takes it away from the people who hold it.

## Who uses it

| Persona (seed)                                                      | Permission(s)    | What they can do here                                        |
| ------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| Owner                                                               | every permission | See, create, edit and delete roles (except Owner and Member) |
| Administrator                                                       | `ac:read`        | See roles and each role's settings, read-only                |
| Bursar, Teacher, Principal, Member with no roles                    | no `ac:*`        | No access; Settings › Roles and permissions hidden           |
| A school's own role with `ac:create`/`ac:update` but not everything | `ac:*` subset    | Create or edit roles using only permissions they hold (RP-1) |
| Super admin acting read-only                                        | every `read`     | See roles; writes hidden                                     |

Scopes: roles are school-wide. No campus, class or student scope applies. A role slug from another school answers 404; in school without `ac:read` answers 403 [tenancy-001].

## Screens

### Roles (list)

- **Route:** `/roles` in `web-admin`. Not in the sidebar: it lives in **Settings**, group **Access**, item "Roles and permissions" (icon shield-check), after the School structure and Finance groups and before "Danger zone". Phase `P1`. Gate `ac:read`; the Settings item is hidden without it.
- Rendered inside the Settings frame (left settings nav; on phones a "Settings section" select).
- **Header**
  - Title "Roles". Description "Choose what each role can do."
  - Info tip: "A role is a set of things people can do. Changes apply straight away to everyone with the role."
  - Action: **New role** (primary, icon plus), gate `ac:create`, goes to `/roles/new`.
- **Disclosure "Kinds of roles"** (icon circle-help), closed by default:
  - "**Built in:** Owner (can do everything) and Member (can do nothing). These can’t be edited."
  - "**Ready-made roles** come with the school and can be changed."
  - "**Your own roles** are ones you create. Renaming a role never removes it from the people who have it."
- **Group "Your school’s roles"**: every role except Owner and Member, ready-made first in seed order (Administrator, Teacher, Bursar, Principal, Student, Guardian), then the school's own in creation order. Three-column grid, 10 cards a page with the standard pager.
- **Role card** (whole card opens `/roles/$roleSlug`)
  - Icon (sparkles for Your own, shield otherwise), label, source badge:
    - "Built in" (outline, icon code-xml), tooltip "Built into the system; can’t be edited".
    - "Ready-made" (secondary), tooltip "Inserted when the school was created; the school’s to edit".
    - "Your own" (brand, icon sparkles), tooltip "Created by this school".
  - Description (two lines reserved).
  - "**{n}** thing(s) switched on", counting lines of the plain-language summary, or "Nothing switched on".
  - Avatar stack of holders (up to 4, then "+{n}"), tooltip with holder names or "Nobody holds it". Names only if the viewer has `member:read`; otherwise the count only (RP-9).
- **Disclosure "Built-in roles (cannot be edited)"** (icon lock): Owner, "Every action, including ones added later. Set only by a super admin or another owner.", **Everything**; Member, "Everyone added starts here. Being added grants nothing.", **Nothing**. Footer: "Every person has Member. Only Owner can do everything, and ownership is handed over in Settings, Danger zone."
- **States:** loading skeleton cards; error `ErrorMessage`; no empty state is needed because starter roles always exist.

### Role (view, edit, new)

- **Routes:** `/roles/new` (gate `ac:create`) and `/roles/$roleSlug` (gate `ac:read`). Settings frame, same Access item highlighted. Phase `P1`. The slug `new` is reserved so the routes can't clash.
- **Breadcrumb:** "Roles › {label}" or "Roles › New role".
- **Header**
  - Title: role label, or "New role". A source badge after an existing role's title.
  - Description: the role's description; for a new role "Name it, then choose what it can do."
  - Action (only when editable): **Create role** (primary, icon check, gate `ac:create`, disabled with tooltip "Give the role a name first" while the name is empty) or **Save changes** (gate `ac:update`, disabled with tooltip "No changes yet" until something changes).
  - Overflow: **Delete role…** (destructive, icon trash-2, gate `ac:delete`), not for a new role or a built-in role.
- **Editable** means: not Owner or Member; the viewer holds `ac:create` (new) or `ac:update` (existing); and, per RP-1, the viewer holds every permission the role already has.
- **Callouts at the top**
  - Owner: "The owner can do everything, including anything added to the app later. It can’t be edited."
  - Member: "Everyone on the staff list has this role. On its own it allows nothing, and it can’t be edited."
  - A save or delete refusal shows as a danger callout with its message.
- **Start from a template** card (new role, editable only). Description "Permissions you don’t hold are skipped."
  - Two choices:
    - **Fees approver** (icon badge-check): "Approves refunds, write-offs and discounts; cannot record payments." Permissions: `student:read`, `invoice:read`, `payment:read`, `adjustment:read`, `adjustment:approve`.
    - **Campus head** (icon building-2): "Everything for one campus except money approvals." Permissions: `student:read`, `student:update`, `class:read`, `class:readAll`, `class:assignTeacher`, `enrollment:read`, `enrollment:place`, `guardian:read`, `invoice:read`, `payment:read`.
  - Choosing one fills the name, description and permissions it can (and the slug, `fees-approver` / `campus-head`). Toast "Filled from the **{label}** template. Review, then create." or, when some were skipped, a warning toast "Skipped {n} you don’t hold: {list}" (the build lists capabilities, not permission strings).
  - Row "Or copy" with one small button (icon copy) per existing role except Owner and Member, or a select when there are more than four (RP-10; the prototype offers only Teacher and Bursar). Copying fills the permissions the editor holds, and, if empty, the name "{label} (copy)". Like a template, it warns "Skipped {n} you don’t hold: {list}" when it drops any.
  - Templates are only offered when every one of their permissions exists in the permission list of that release (see rule 3).
- **Left column**
  - **Card "What this role can do"** (icon key-round). Description: Owner "Everything, including anything added later."; otherwise "{n} thing(s) switched on." or "Nothing yet. Choose a level for each part of the app.", then "{dot} marks things that touch money or access."
  - Body: the plain-language areas (next section), grouped under "People and access", "School", "Money" and "Portal". The Portal group shows only for a role that already has a `readOwn` permission, or for the Student and Guardian roles.
  - **Disclosure "Advanced: every permission, one by one"** (icon sliders-horizontal), closed by default:
    - Heading "Every permission, one by one" with a badge "{held}/{total}". Legend: amber dot "important"; when editable also " · struck through: you don’t hold it".
    - Filter input, placeholder "Filter permissions", matching resource label, key, action and pillar label. No match: "No permissions match", "Try “approve”, “publish” or a pillar name."
    - One accordion item per pillar ("People and access", "Foundation", "Finance") with a count badge "{on}/{total}" and, when any are on, a warning badge "{n} important" (tooltip "Sensitive permissions ticked in this pillar"). The first pillar with anything ticked opens by default; all open while filtering.
    - In an open pillar (editable): buttons **Select all I hold** (icon check-check) and **Clear** (icon x).
    - One row per resource (its label) with a toggle chip per action, worded as in the action-word table below. Chip tooltip: the permission help text, "Sensitive: approvals, money or access." when sensitive, and "You don’t hold this, so you can’t put it in a role." when the editor lacks it (chip struck through and disabled).
    - Ticking an unheld permission toasts "You don’t hold {permission}." (danger).
- **Right column**
  - **Card "Details"** (icon pencil)
    - **Name**: text, required, placeholder "Fees approver", hint "Shown next to people’s names. You can rename it any time." Validation (new copy): "Give the role a name first." when empty; "A role called {label} already exists." (RP-5); at most 40 characters.
    - **Description**: textarea, optional, at most 200 characters.
    - Disabled when not editable.
  - **Card "Who holds it"** (icon users)
    - Existing role: each holder (avatar, name, chevron) linking to their member page; or "Nobody yet. Assign it from a member’s page."
    - New role: "Assign it from a member’s page once it exists."
    - With unsaved changes, a section "If you save now": per holder "+{gained}" (success) and "−{lost}" (destructive) permission counts, or "no change" (tooltip "Another of their roles already covers it").
  - Read-only, not built in: info callout "You can look at this role but not change it."
- **Create:** `POST /roles`. Toast "Role **{label}** created." with action **Assign it to someone** (shown with `member:update`, goes to Staff and members). Then opens `/roles/{slug}`.
- **Save:** `PATCH /roles/{slug}`. Toast "Role saved. Holders get the change on their next request."
- **Refusal on save:** "You can’t give access you don’t have yourself. Switch those parts off and save again."
- **Delete dialog**
  - Title "Delete “{label}”?".
  - Nobody holds it: description "Members can’t hold it any more. This can’t be undone.", info callout "Nobody holds this role."
  - Someone holds it: description "This will be refused.", danger callout "{names} still have this role. Take it off them first." The build disables **Delete role** in this case.
  - Buttons: **Cancel**, **Delete role** (destructive, icon trash-2, gate `ac:delete`).
  - On success: toast "Role {label} deleted." and go to Roles. On 409: the danger callout above.
- **States:** unknown slug or another school's slug: "Role not found", "We couldn’t find that role", "It may have been moved, or it may belong to a campus or class you don’t look after.", **Go back**. Loading skeletons; `ErrorMessage` on failure.

### Plain-language areas

Every permission in the list sits in exactly one place: an area's See level, its Change level, or one extra switch. Areas are `CAP_AREAS` in the prototype and move to `libs/policy` with the permission list.

Levels per area: "No access", "Can see" (or the area's own label), "Can change". Choosing a level replaces the area's See and Change permissions; choosing "No access" also turns off its extras. A level whose permissions the editor doesn't fully hold is disabled, tooltip "You can’t give access you don’t have yourself". If picking a level left some permissions out, toast "Some of that was left out because you can’t do it yourself." (warning).

An area whose permissions match no level shows a "Custom" badge (tooltip "Set by hand under Advanced. Pick a level to tidy it up.") and the line "Some permissions are set by hand". The line under each area otherwise reads its Change description, its See description ("Can look but not change anything" by default), or "Can’t open this part of the app".

| Group             | Area (● important)      | Can see                                                                                                                                                              | Can change adds                                                                                | Change description                                    | Extra switches (● important)                                                                                                                                                                                 |
| ----------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| People and access | Staff ●                 | `member:read`                                                                                                                                                        | `member:create`, `member:update`, `member:delete`                                              | "Add and remove staff, and give them roles"           | ● "Approves staff leave", "Nobody can approve their own leave.": `leave:approve`                                                                                                                             |
| People and access | Roles ●                 | `ac:read`                                                                                                                                                            | `ac:create`, `ac:update`, `ac:delete`                                                          | "Create roles and change what they allow"             | —                                                                                                                                                                                                            |
| People and access | Campuses                | `team:read`                                                                                                                                                          | `team:create`, `team:update`, `team:delete`                                                    | "Add and rename campuses"                             | ● "Sees every campus", "Without this, they only see the campuses they work on.": `campus:readAll`                                                                                                            |
| People and access | School settings         | `schoolAccount:read`                                                                                                                                                 | `schoolAccount:update`                                                                         | "Change the school profile and rules"                 | ● "Hand over or delete the school", "Normally only the owner.": `organization:update`, `organization:delete`                                                                                                 |
| School            | School years and terms  | `session:read`                                                                                                                                                       | `session:create`, `session:update`, `session:setCurrent`                                       | "Add school years, holidays and set the current term" | —                                                                                                                                                                                                            |
| School            | Students                | `student:read`                                                                                                                                                       | `student:create`, `student:update`, `enrollment:read`, `enrollment:create`, `enrollment:place` | "Admit students, update them and put them in classes" | "Marks students away", "Records that a student has not been seen since a date.": `student:markAway`; "Records leaving and graduation", "Takes students off the roll. Nothing is deleted.": `student:archive` |
| School            | Parents and guardians   | `guardian:read`                                                                                                                                                      | `guardian:create`, `guardian:update`, `guardian:link`                                          | "Add guardians and link them to students"             | —                                                                                                                                                                                                            |
| School            | Classes                 | `class:read`                                                                                                                                                         | `class:create`, `class:update`, `class:assignTeacher`                                          | "Create classes and assign teachers"                  | ● "Sees every class", "Without this, teachers only see the classes they teach.": `class:readAll`                                                                                                             |
| School            | Subjects                | `subject:read`                                                                                                                                                       | `subject:create`, `subject:update`                                                             | "Add subjects and choose who teaches them"            | —                                                                                                                                                                                                            |
| School            | Announcements           | `announcement:read`                                                                                                                                                  | `announcement:create`, `announcement:update`                                                   | "Write and publish news for parents"                  | —                                                                                                                                                                                                            |
| Money             | Fees                    | `feeLine:read`                                                                                                                                                       | `feeLine:create`, `feeLine:update`, `feeLine:retire`                                           | "Set and change what each class pays"                 | —                                                                                                                                                                                                            |
| Money             | Charges                 | `invoice:read`                                                                                                                                                       | `invoice:bill`                                                                                 | "Charge students for a term"                          | —                                                                                                                                                                                                            |
| Money             | Payments                | `payment:read`                                                                                                                                                       | `payment:record`                                                                               | "Record payments and give receipts"                   | —                                                                                                                                                                                                            |
| Money             | Discounts and refunds ● | `adjustment:read`                                                                                                                                                    | `adjustment:create`, `payment:void`                                                            | "Ask for refunds, discounts and cancelled payments"   | ● "Approves refunds, discounts and cancellations", "Nobody can approve their own request.": `adjustment:approve`                                                                                             |
| Money             | Bank and POS accounts   | `moneyAccount:read`                                                                                                                                                  | `moneyAccount:create`, `moneyAccount:update`                                                   | "Add and change bank and POS accounts"                | —                                                                                                                                                                                                            |
| Money             | Money categories ●      | `ledger:read`                                                                                                                                                        | `ledger:manageAccounts`                                                                        | "Change the accountant’s categories"                  | —                                                                                                                                                                                                            |
| Money             | Store                   | `store:read`                                                                                                                                                         | `store:receive`, `store:issue`, `store:count`                                                  | "Sell items, receive deliveries and count stock"      | —                                                                                                                                                                                                            |
| Portal            | Portal                  | "Own records": `student:readOwn`, `feeLine:readOwn`, `invoice:readOwn`, `payment:readOwn` (desc "Students see their own records. Guardians see their own children.") | — (only No access / Own records)                                                               | —                                                     | —                                                                                                                                                                                                            |

Note that the Students area's Change level carries `enrollment:read`, which is a read permission; see gaps.

**Summary lines** (used on role cards, the member page, the review step and My access): one line per area at "Can change" ("{Area}: {change description, first letter lower-cased}"), "Can see" ("{Area}: can see" or "Portal: own records"), or custom ("{Area}: some access"), plus one line per extra that is fully on (its label).

**Action words** in the Advanced grid:

| Action        | Word             | Action         | Word              |
| ------------- | ---------------- | -------------- | ----------------- |
| create        | add              | link           | link to a student |
| read          | see              | bill           | charge            |
| readOwn       | see own only     | record         | record            |
| readAll       | see all          | void           | ask to cancel     |
| update        | change           | approve        | approve           |
| delete        | remove           | retire         | retire            |
| setCurrent    | set current term | manageAccounts | change categories |
| assignTeacher | assign teachers  | receive        | receive stock     |
| markAway      | mark away        | issue          | sell              |
| archive       | record leaving   | count          | count stock       |
| place         | place in a class |                |                   |

**Sensitive permissions** (amber marker in the Advanced grid, and the source of the plain-language "important" dots): `organization:update`, `organization:delete`, `member:create`, `member:delete`, `ac:create`, `ac:update`, `ac:delete`, `campus:readAll`, `class:readAll`, `leave:approve`, `payment:void`, `adjustment:approve`, `ledger:manageAccounts`. This is one list in `libs/policy`, used by both the grid and the areas: the prototype's `SENSITIVE` plus `leave:approve` and `organization:update` (RP-6). An area or extra is marked important when it holds any of them.

**Permission help** (tooltips), quoted from the prototype: `campus:readAll` "Sees every campus. Without it a member sees only the campuses they belong to."; `class:readAll` "Sees every class. Without it a teacher sees only the classes they teach or are class teacher of."; `member:create` "Adds people to the school. Owner-only by default."; `member:update` "Assigns roles, but only roles whose permissions the assigner holds too."; `ac:create` "Creates custom roles, limited to permissions the creator holds."; `payment:void` "Drafts a void. A second person with adjustment:approve approves it."; `adjustment:approve` "Approves credit notes, discounts, write-offs, refunds and payment voids. Never your own."; `leave:approve` "Approves or declines staff leave requests. Never your own."; `invoice:bill` "Runs billing: draft, review, issue."; `student:markAway` "Marks a student “not seen since” a date. After 5 weeks with no word they become Inactive."; `student:archive` "Records a student leaving or graduating. Nothing is deleted."; `store:issue` "Sells books and uniforms to a student. Payment is taken at the store."; `store:count` "Records a stock count. Shortages wait for someone with adjustment:approve."; `announcement:create` "Writes announcements for parents and students in the portal."; any `readOwn` "Sees only the student’s own records, or a guardian’s linked children." The build rewords the ones that name raw permissions.

### My access (sheet)

- Opened from the sidebar user menu item **My access** (icon key-round; not shown to a super admin outside a school) and from the dashboard's "See my access". Reads `GET /me/permissions`. Shell component, built in M1.1; specified here because it shows roles and the plain-language summary.
- Title "My access". Description in the build: "What you can do in {school name}, and why." (the prototype says "What this person can do…", written for the persona switcher).
- Avatar, name and the job title; then key–value **Roles** (role badges), **Campuses** ("Every campus" or names), **Classes** ("Every class", "{classes} (classes they teach)", "No classes assigned yet").
- "What you can do": summary lines, or "Nothing yet. Ask the owner to give you a role."
- The prototype's footer "Open the access lab" is demo tooling; out of scope.

### Command menu

- "Create a custom role" (icon shield-check, hint "Roles", gate `ac:create`) opens `/roles/new`.

## Starter and built-in roles

Role sources: **Built in** (`owner`, `member`; defined in code, never in `organizationRole`), **Ready-made** (inserted for every new school by `organizationHooks.afterCreateOrganization`, editable), **Your own** (created by the school).

Target permission sets, quoted from the prototype seed. All six ready-made roles are inserted from M1.1, each holding only the permissions whose resources exist at that point; the sets grow slice by slice, for new schools and for unedited roles in existing schools (rule 3).

| Slug            | Label         | Source     | Description                                                                             | Permissions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------- | ---------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner`         | Owner         | Built in   | "Every action, including ones added later. Set only by a super admin or another owner." | Every permission, including future ones                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `member`        | Member        | Built in   | "Everyone added starts here. Being added grants nothing."                               | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `administrator` | Administrator | Ready-made | "Runs the school day to day: calendar, classes, students and staff."                    | `member:read`, `member:update`, `ac:read`, `team:read`, `team:create`, `team:update`, `campus:readAll`, `schoolAccount:read`, `session:create`, `session:read`, `session:update`, `session:setCurrent`, `class:create`, `class:read`, `class:readAll`, `class:update`, `class:assignTeacher`, `student:create`, `student:read`, `student:update`, `student:archive`, `student:markAway`, `enrollment:create`, `enrollment:read`, `enrollment:place`, `guardian:create`, `guardian:read`, `guardian:update`, `guardian:link`, `feeLine:read`, `invoice:read`, `payment:read`, `subject:create`, `subject:read`, `subject:update`, `store:read`, `announcement:create`, `announcement:read`, `announcement:update` (39) |
| `teacher`       | Teacher       | Ready-made | "Teaches their own classes. Sees only those classes."                                   | `student:read`, `student:markAway`, `class:read`, `subject:read` (4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bursar`        | Bursar        | Ready-made | "Charges fees, records payments and asks for corrections. Cannot approve them."         | `student:read`, `guardian:read`, `enrollment:read`, `feeLine:create`, `feeLine:read`, `feeLine:update`, `feeLine:retire`, `invoice:bill`, `invoice:read`, `payment:record`, `payment:read`, `payment:void`, `adjustment:create`, `adjustment:read`, `store:read`, `store:receive`, `store:issue`, `store:count`, `moneyAccount:read`, `ledger:read` (20)                                                                                                                                                                                                                                                                                                                                                              |
| `student`       | Student       | Ready-made | "Portal only. Sees their own records."                                                  | `student:readOwn`, `feeLine:readOwn`, `invoice:readOwn`, `payment:readOwn` (4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `guardian`      | Guardian      | Ready-made | "Portal only. Sees their linked children."                                              | `student:readOwn`, `feeLine:readOwn`, `invoice:readOwn`, `payment:readOwn` (4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `principal`     | Principal     | Ready-made | "Approves money corrections across the school."                                         | `team:read`, `campus:readAll`, `student:read`, `class:read`, `class:readAll`, `subject:read`, `invoice:read`, `payment:read`, `moneyAccount:read`, `adjustment:read`, `adjustment:approve`, `store:read`, `announcement:create`, `announcement:read`, `announcement:update`, `leave:approve` (16)                                                                                                                                                                                                                                                                                                                                                                                                                     |

Principal is ready-made, not the school's own role as in the prototype seed, so every school has a default leave approver besides the owner ([D-010](../technical-reference.md#decision-log), D-006). Neither Administrator nor any other ready-made role holds `member:create`, `member:delete`, `ac:create/update/delete`, `organization:*` or `leave:approve`; those stay with the owner (and Principal for `leave:approve`, per D-006).

## GET /me/permissions

Owned by M1.1 (`me` module, signed in with an active school); the full contract is [02](02-foundation-permissions-and-scopes.md#mepermissions), rule 21. The UI reads the server-computed union because Better Auth's client-side check only knows code roles, and refetches it on window focus and after any 403 ([D-034](../technical-reference.md#decision-log)). Shape, from the prototype's access lab (abridged):

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
    "leave": ["approve"]
  },
  "acting": null
}
```

- `roles`: the member's slugs, `member` included.
- `campusScope`: `"all"` with `campus:readAll` (or acting super admin), otherwise the campus ids from `teamMember`.
- `classScope`: `"all"` with `class:readAll`, or when the member has no `class:read` at all; otherwise the arm ids they are class teacher of this session or subject teacher of this term (empty array until M2.3/M4.1 land).
- `permissions`: resource to actions; resources with no action are omitted.
- The permissions doc promised only the permissions and `campusScope`; `roles` and `classScope` are additions (difference 8).
- `acting`: `null`, or `{ organizationId, writes }` while a super admin acts in the school.
- A member with no roles gets `permissions: {}`; the SPA shows the "No access yet" dashboard.

## Business rules

1. The permission list lives in code (`libs/policy`). A school combines permissions into roles but cannot invent new ones.
2. Every permission maps to exactly one plain-language slot (an area's See level, its Change level, or an extra). A unit test enforces it.
3. A resource joins the permission list in the slice that adds its endpoints. The editor shows an area only when its See permissions exist, an extra only when its permissions exist, and a template only when all its permissions exist. Starter roles are trimmed to existing permissions. When a slice adds permissions, it adds them to the starter roles of new schools, and its migration backfills every starter role an existing school has not edited (`source = 'starter'` and `editedAt` null); a starter role the school has edited is left alone (RP-11).
4. **Only what you hold.** Creating or updating a role refuses any permission the editor doesn't hold (403). Our service checks the editor's combined permissions first; Better Auth's `createOrgRole`/`updateOrgRole` repeat the check one permission at a time (`checkIfMemberHasPermission`).
5. **Editing a role you don't fully hold** is refused (RP-1): the editor must hold every permission the role has before and after the change. Otherwise the page is read-only for them.
6. Owner and Member are built in: never stored in `organizationRole`, never editable or deletable (409).
7. **Fixed slug.** A role's slug is set at creation and never changes. It is never shown or edited in the school's app; only a super admin sees it, read-only, in the platform console (RP-3). It matches `^[a-z0-9-]+$`, is 2–40 characters, is unique in the school, and is not `owner`, `member`, `admin` or `new`. It is derived from the label (lower-case, runs of other characters become `-`, trimmed; `role` if empty) with `-2`, `-3`… added on a clash; a template proposes its own key. The UI never shows or edits the slug. Better Auth lower-cases role names and refuses its predefined names (`ROLE_NAME_IS_ALREADY_TAKEN`).
8. **Editable label and description.** Renaming changes only the label, so holders keep the role. We never pass `roleName` to `updateOrgRole` (permissions doc, Gap 2).
9. **Deleting a role in use is refused** (409). Better Auth refuses with `ROLE_IS_ASSIGNED_TO_MEMBERS`; our service checks first and names the holders. The `student` and `guardian` ready-made roles can never be deleted, because admission assigns them (409, "Admissions use this role.") (RP-4).
10. **Changes apply on the next request.** The guard reads the member's role permissions from `organizationRole` on every request (one indexed query), not from Better Auth's in-memory `cacheAllRoles`. A role change never needs a sign-out.
11. The guard checks one `resource:action` at a time against the union of the member's roles (code roles plus their `organizationRole` rows) (permissions doc, Gap 3).
12. A role can be saved with no permissions.
13. Role labels are unique per school, case-insensitive (RP-5).
14. Starter roles are inserted by a direct Kysely write in `afterCreateOrganization`, from M1.1, before anyone can be assigned one, because `addMember` checks role names against code roles and `organizationRole`.
15. A school has at most 50 roles in `organizationRole` (`maximumRolesPerOrganization: 50`); creating one more answers 400 `TOO_MANY_ROLES` (RP-7).

### Better Auth 1.7.7 gaps we close

From the permissions doc, re-checked in `node_modules/better-auth/dist/plugins/organization/`:

1. **Role assignment can escalate**: `updateMemberRole` checks only `member:update`. We assign through `PUT /members/:id/roles` with `canGrantRole` and put Better Auth's member and invitation routes in `disabledPaths` ([20](20-staff-and-members.md)).
2. **Renaming strips the role from holders**: `updateOrgRole` renames `organizationRole.role` but not `member.role`, and a comma would break the list. Fixed slug, separate label (rules 7–8).
3. **Unions checked one role at a time**: `hasPermissionFn` passes only if one role grants everything asked. The guard asks for a single permission; the UI reads `/me/permissions`.
4. **Deleting a role in use**: already refused (`ROLE_IS_ASSIGNED_TO_MEMBERS`, which splits `member.role` on commas). We check first for a friendlier message.
5. **`cacheAllRoles`** is an unbounded per-process map per school. Our guard bypasses it (rule 10). Better Auth's own role routes still read it with `useMemoryCache: true`, after a database-loaded `ac:*` check refreshes it in the same request.
6. **No cap on roles per school**: `maximumRolesPerOrganization` defaults to infinity. We set it to 50 (rule 15).
7. **Removing a role a member holds** only needs `member:update` in Better Auth; we also require the editor to hold the role ([20](20-staff-and-members.md), rule 6).

## Data

- `organizationRole` (Better Auth, via `api:auth-generate`), already in the permissions doc for phase 1. It and the additional fields below arrive in M1.1, because the starter roles are seeded there ([D-010](../technical-reference.md#decision-log)); the editor in M1.4 adds no table.
- **Additional fields** on `organizationRole` through `schema.organizationRole.additionalFields` (Better Auth supports them on create and update):
  - `label` (text, required), in the permissions doc.
  - `description` (text, optional). **New**, not in any doc.
  - `source` (`'starter' | 'custom'`). **New**, needed for the Ready-made / Your own badges. Built-in roles never have a row.
  - `editedAt` (timestamp, null until a `PATCH`). **New**: a slice's backfill skips starter roles where it is set (RP-11).
- No domain table. `member.role` holds slugs.
- Migrations: M1.1's `api:auth-generate` migration creates `organizationRole` with these fields, then `pnpm drift:fix`. Each later slice that adds permissions ships a data migration that backfills unedited starter roles.

## API

`roles` module. Contract types in `@eduvault/api-contract` (`contract.roles`). `RoleDto = { slug, label, description, source: 'code' | 'starter' | 'custom', permissions: Record<resource, action[]>, holderCount, holders?: { memberId, name }[] }`. For `owner`, `permissions` lists every current permission.

| Method | Path              | Permission               | Request                                                                                                 | Response                                                         | Errors                                                                                                                                           |
| ------ | ----------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/roles`          | `ac:read`                | —                                                                                                       | `RoleDto[]` (built-in first) ; `holders` only with `member:read` | 403                                                                                                                                              |
| GET    | `/roles/:slug`    | `ac:read`                | —                                                                                                       | `RoleDto`                                                        | 404 unknown or another school's slug; 403                                                                                                        |
| POST   | `/roles`          | `ac:create`              | `{ label, description?, permissions, slug? }` (slug optional; derived from label when missing or taken) | `RoleDto`                                                        | 400 invalid label, slug or unknown permission; 403 a permission the editor lacks (body lists them); 409 label taken; 400 `TOO_MANY_ROLES` (RP-7) |
| PATCH  | `/roles/:slug`    | `ac:update`              | `{ label?, description?, permissions? }`                                                                | `RoleDto`                                                        | 403 a permission the editor lacks, before or after (rule 5); 404; 409 built-in role or label taken                                               |
| DELETE | `/roles/:slug`    | `ac:delete`              | —                                                                                                       | `{ slug }`                                                       | 403 rule 5; 404; 409 built-in, or held by members (body names them), or protected (RP-4)                                                         |
| GET    | `/me/permissions` | signed in, active school | —                                                                                                       | see above                                                        | 401; 403 no active school                                                                                                                        |

The service wraps Better Auth's `createOrgRole`, `updateOrgRole`, `deleteOrgRole` through `AuthService.api` with the caller's headers (they need a session), after our own checks. The guard's query: `SELECT permission FROM "organizationRole" WHERE "organizationId" = $1 AND role = ANY($2)`.

## Acceptance criteria

1. **List gate.** Given the bursar, then Settings shows no "Roles and permissions" and `GET /roles` answers 403.
2. **List.** Given the owner, then "Your school’s roles" shows Administrator, Teacher, Bursar, Principal, Student and Guardian, all Ready-made; Owner and Member sit under "Built-in roles (cannot be edited)".
3. **Read-only.** Given the administrator (`ac:read` only), when he opens Bursar, then every control is disabled, there is no Save or Delete, and the callout reads "You can look at this role but not change it."
4. **Create from template.** Given the owner, when she picks Fees approver and creates it, then the toast reads "Role **Fees approver** created.", the slug is `fees-approver`, and `GET /roles/fees-approver` lists five permissions.
5. **Only what you hold.** Given a member whose role has `ac:create` and `student:read` only, when they post a role with `adjustment:approve`, then 403; in the editor the Discounts and refunds levels and the approve switch are disabled.
6. **Rename keeps holders.** Given Kemi holds `fees-approver`, when the owner renames it "Head of approvals", then Kemi still holds it and `member.role` is unchanged.
7. **Delete in use.** Given Kemi holds `fees-approver`, when the owner deletes it, then 409 and the callout names Kemi; after removing it from Kemi, deletion succeeds with "Role Fees approver deleted."
8. **Built-in.** Given the owner opens Owner, then the callout reads "The owner can do everything, including anything added to the app later. It can’t be edited." and `PATCH /roles/owner` answers 409.
9. **Next request.** Given Chika holds Bursar, when the owner removes "Charges: Can change" from Bursar, then Chika's very next `POST` that needs `invoice:bill` answers 403 without signing out.
10. **Levels.** Given a draft with Fees at "Can see", when the editor picks "Can change", then `feeLine:create`, `feeLine:update` and `feeLine:retire` are added; picking "No access" removes all four and any extras.
11. **Custom badge.** Given only `feeLine:create` is ticked under Advanced, then the Fees area shows "Custom" and "Some permissions are set by hand".
12. **Isolation.** Given another school created role `fees-approver`, when this school's owner reads `/roles/fees-approver` and none exists here, then 404; this school's roles never list it.
13. **`/me/permissions`.** Given Grace (teacher + principal), then the response has `roles: ["member","teacher","principal"]`, `campusScope: "all"`, `classScope: "all"`, and `permissions.leave` is `["approve"]`.
14. **Protected roles.** Given the owner, when she deletes the Student role, then 409 "Admissions use this role." even when nobody holds it.
15. **Backfill.** Given a school created before M3.6 whose Principal role is unedited, when the M3.6 migration runs, then Principal holds `leave:approve`; given one whose Principal was edited, then it is unchanged.
16. **Role cap.** Given a school with 50 roles, when the owner creates another, then 400 `TOO_MANY_ROLES`.

## Tests

- **Unit (`nx run policy:test`)**: every permission in exactly one area slot; `capLevel` returns none, see, change and custom; `capSummary` lines; slug derivation and reserved names; template and starter sets contain only listed permissions; owner holds every permission.
- **Unit (`nx run web-admin:test`)**: roles list groups and badges; role page read-only for `ac:read`; levels disabled for unheld permissions; Portal group shown only for portal roles; delete dialog disables Delete when held; templates skip unheld permissions with the warning toast.
- **Integration (`nx run api:test-integration`)**
  - Isolation: `GET/PATCH/DELETE /roles/:slug` for a slug only another school has answers 404; `GET /roles` never lists another school's role [tenancy-002].
  - Escalation on create and update (403), including editing a role that holds a permission the editor lacks.
  - Built-in roles: 409 on update and delete.
  - Delete in use: 409.
  - Rename keeps `member.role`.
  - Guard sees a role change on the next request.
  - Six starter roles, Principal included, exist on a new school, with the trimmed sets; a slice's backfill updates unedited starter roles only.
  - Deleting `student` or `guardian` answers 409.
  - `/me/permissions` shape for owner, multi-role member and no-role member.
- **E2E (opt-in, `eduvault-e2e`)**: owner creates Fees approver from the template and assigns it to the no-role persona, who then sees Approvals and not School fees; the administrator persona sees the role editor read-only.

## Open decisions

| #     | Question                                                                                                                                                                                                                                                                                                                                                                                                                                         | Recommendation                                                                                                                                | Confidence                                                           | Decided                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| RP-1  | Can someone with `ac:update` edit a role that holds permissions they lack? The prototype lets them untick those and save, so they can remove access they don't hold; Better Auth checks only the new set.                                                                                                                                                                                                                                        | No: they must hold every permission the role has before and after; otherwise the role is read-only for them. Same rule for delete.            | High: mirrors the "remove only what you could grant" rule on members | Adopted                                                                                        |
| RP-2  | Principal is seeded as the school's own role, yet the one-senior-role rule, handover and D-006's default leave approver all name it. A new school has no principal, so only the owner approves leave. Options: make `principal` a ready-made role; drop the name tie and leave it to schools.                                                                                                                                                    | Ready-made role with the seed's permission set, inserted with the others.                                                                     | High: D-006 assumes it exists                                        | [D-010](../technical-reference.md#decision-log): Principal is a ready-made role seeded in M1.1 |
| RP-3  | Is the role editor's slug ever shown?                                                                                                                                                                                                                                                                                                                                                                                                            | Never shown or edited; shown read-only only to a super admin in the platform console.                                                         | Medium                                                               | Adopted                                                                                        |
| RP-4  | May a school delete the Student or Guardian ready-made role? Admission assigns them.                                                                                                                                                                                                                                                                                                                                                             | Refuse deleting `student` and `guardian` (409, "Admissions use this role."); other ready-made roles follow rule 9.                            | Medium                                                               | Adopted                                                                                        |
| RP-5  | Must role labels be unique? The prototype doesn't check.                                                                                                                                                                                                                                                                                                                                                                                         | Unique per school, case-insensitive (409 "A role called {label} already exists.").                                                            | Medium: two "Teacher" roles would be confusing on badges             | Adopted                                                                                        |
| RP-6  | One list of sensitive permissions. The prototype has two (`SENSITIVE` and the area "important" dots); the overview doc marks four with ⚑; `leave:approve` appears in none.                                                                                                                                                                                                                                                                       | One list in `libs/policy`, used by both the grid and the areas: the prototype's `SENSITIVE` plus `leave:approve` and `organization:update`.   | Medium                                                               | Adopted                                                                                        |
| RP-7  | Cap on roles per school (`maximumRolesPerOrganization`).                                                                                                                                                                                                                                                                                                                                                                                         | 50.                                                                                                                                           | Low: no evidence either way                                          | Adopted                                                                                        |
| RP-8  | How does a holder's open SPA learn about a role change?                                                                                                                                                                                                                                                                                                                                                                                          | Refetch `/me/permissions` on window focus and after any 403.                                                                                  | Medium                                                               | [D-034](../technical-reference.md#decision-log): refetch on focus and after any 403            |
| RP-9  | Should `GET /roles` reveal holder names to someone with `ac:read` but not `member:read`?                                                                                                                                                                                                                                                                                                                                                         | Count only without `member:read`.                                                                                                             | Medium                                                               | Adopted                                                                                        |
| RP-10 | "Or copy" offers only Teacher and Bursar.                                                                                                                                                                                                                                                                                                                                                                                                        | Offer every existing role except Owner and Member, in a select when there are more than four.                                                 | Medium                                                               | Adopted                                                                                        |
| RP-11 | Rule 3 trims starter roles to existing permissions and never touches existing schools. So Principal gets `leave:approve` only in schools created after M3.6, and Student and Guardian start empty at M1.4 although admission (M2.4) assigns them and they gain `readOwn` only at M2.8. Options: backfill starter roles the school hasn’t edited when a slice adds permissions; accept the gap because no production school exists before launch. | Backfill unedited starter roles in each slice’s migration; track edits with `source = 'starter'` plus an `editedAt` field set on any `PATCH`. | Medium: cheap now, and it keeps D-006 true for every school          | Adopted                                                                                        |

## Differences from permissions-and-custom-roles.md

1. **Permission list.** The prototype has no `invitation` resource (its routes are disabled anyway); adds `team:read`; replaces `student:delete` with `student:archive` and adds `readOwn`, `markAway`; replaces `feeSchedule` with `feeLine` (`create`, `read`, `readOwn`, `update`, `retire`); `schoolAccount` is `read`, `update` only; and adds `session`, `class` (no delete), `enrollment`, `guardian`, `subject`, `announcement`, `leave`, `ledger`, `moneyAccount`, `invoice`, `payment` (with `void`), `adjustment`, `store`. The overview doc already records these as amendments; the permissions doc's own tables still need updating.
2. **Starter roles.** The doc seeds `administrator`, `teacher`, `bursar` in phase 1 and `student`, `guardian` in 4a. The prototype seeds all five and also has `principal` (as the school's own role). We seed all six as ready-made roles in M1.1 ([D-010](../technical-reference.md#decision-log)).
3. **`ac` defaults.** The doc gives `ac:*` to the owner only. The prototype's Administrator holds `ac:read`.
4. **Role fields.** The doc adds only a label. The prototype also has a description and a source (Ready-made / Your own).
5. **Slug.** The doc implies the slug is chosen at creation. The prototype never shows it and derives it from the label.
6. **Where roles live.** The doc's folder plan puts Roles in the main nav with `ac:create` on `/roles/new` and `ac:update` on `/roles/$roleSlug`. The prototype puts them under Settings › Access › "Roles and permissions", gates the role page on `ac:read` (or `ac:create`) and renders it read-only without `ac:update`.
7. **Editor.** The doc plans a resources × actions checkbox grid (`permission-matrix.tsx`). The prototype leads with plain-language areas and levels and keeps the grid under "Advanced".
8. **`/me/permissions`.** The doc returns permissions and `campusScope`. The prototype adds `roles` and `classScope`.
9. **Removing roles.** The doc checks only roles being assigned. The prototype also checks roles being removed.
10. **Owner.** The doc lets an owner grant `owner` on `PUT /members/:id/roles`. The prototype never offers Owner in the wizard; ownership moves by handover.
11. **Templates and copy** (Fees approver, Campus head, "Or copy") are new.
12. **Sensitive markers** are new (RP-6).
13. **Leave approval.** `leave:approve` isn't in the doc; D-006 and the overview add it, defaulting to owner and principal.
14. **Role combinations** (one senior role, student and portal-only rules) aren't in the doc; the overview and D-006 add the senior-role rule.

## Prototype gaps noticed

- Principal is a "Your own" role in the seed, but logic elsewhere treats it as standard; it is ready-made here ([D-010](../technical-reference.md#decision-log)).
- The Students area's Change level includes `enrollment:read`, so "Can see" on Students never grants enrolment reads; a bursar-style role must use Advanced.
- Two inconsistent "important" lists (RP-6); `leave:approve` and `organization:update` aren't marked anywhere.
- "Or copy" is hard-coded to Teacher and Bursar, and silently drops unheld permissions (templates warn; copy doesn't).
- The delete dialog's Delete button stays enabled when the role is held; the refusal comes after.
- An editor can untick permissions they don't hold from an existing role and save (RP-1).
- No validation of label length or uniqueness; no unsaved-changes warning when leaving the editor.
- The Member role page's "Who holds it" lists every member of the school.
- The roles info tip says changes apply "straight away"; the save toast says "on their next request". Both are true for the server; the open SPA lags until it refetches (RP-8).
- The access sheet's description is written for the persona switcher ("What this person can do").
- Raw permission strings appear in toasts ("You don’t hold {permission}.").

## Dependencies

- **M1.1**: permission list and `CAP_AREAS` in `libs/policy`, the per-request guard, `/me/permissions`, `PermissionsProvider`/`useCan`, the Settings frame and nav gating.
- **M1.3** assigns roles to members; the starter roles it assigns are seeded in M1.1.
- **M2.2** Settings frame pages share the Access group with Danger zone.
- Each later slice that adds a resource adds its area to `CAP_AREAS`, adds its permissions to the starter roles of new schools, and backfills unedited starter roles in existing schools.

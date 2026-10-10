# PRD: Campuses

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M2.2` (campuses page, add and edit); `M4.3` (one store per campus) (see [roadmap](README.md))
- Related: [ADR 0005 tenancy](../adr/0005-tenancy.md), [architecture](../architecture.md), [data-model-overview.md](../brainstorming/data-model-overview.md) (campus `address`; null `campus_id` rules), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (`team`, `campus:readAll`), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-006](../technical-reference.md#decision-log), [D-010](../technical-reference.md#decision-log), [D-035](../technical-reference.md#decision-log). Sibling PRDs: [31 classes](31-classes.md), [33 school settings](33-school-settings.md)

## Summary

A campus is a Better Auth team plus a `campus` row with its address. The Campuses page shows each campus a person can see, with its principal and how many classes, students and staff it has, and lets people holding `team:create` add one; the creator is enrolled in the new campus so they can switch to it. This replaces today's bare list-and-form `campuses-page.tsx` and tightens the API's read gate.

## Who uses it

| Persona (seed)                                     | Permission(s)                                               | What they can do here                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Funmi Adeyemi, owner                               | every permission                                            | Sees every campus; adds, edits and (API only) deletes campuses                                        |
| Tunde Bakare, administrator (starter)              | `team:read`, `team:create`, `team:update`, `campus:readAll` | Sees every campus; adds and edits campuses; can't delete                                              |
| Grace Nwosu, principal (starter role)              | `team:read`, `campus:readAll`                               | Sees every campus, read-only                                                                          |
| Chika Eze (Lekki) / Yemi Alade (Ikeja), bursar     | no `team:*`                                                 | No access to the page. Campus names still reach her through pickers (see API)                         |
| Emeka Obi, teacher; Kemi Lawson, no roles          | no `team:*`                                                 | No access                                                                                             |
| A member with `team:read` but not `campus:readAll` | `team:read`                                                 | Sees only the campuses they belong to, with the description "You belong to Lekki" and an info callout |
| Super admin acting                                 | read-only until a reason is given                           | Sees every campus; no "New campus"                                                                    |

Scopes: campus scope applies to every read (`campus:readAll`, otherwise `teamMember`). Another school's campus, or one outside the caller's campus scope, answers 404; in scope without the permission answers 403 [tenancy-001].

## Screens

### Campuses

- Route `/campuses`, web-admin. Not in the side nav; it lives in the Settings frame under **School structure → Campuses** (second item, after School years and terms). Also reached from the school switcher menu, where each visible campus links here. Phase label F0. Gate `team:read`.
- Header:
  - Title "Campuses".
  - Description: with campus scope `all`, "2 campuses"; otherwise "You belong to Lekki" (comma-separated names).
  - Info tooltip "Each campus has its own staff, classes and students. Whoever adds a campus is added to it."
  - Action "New campus" (primary, plus icon), gate `team:create`.
- Body: a two-column grid (one column on phones) with one card per visible campus, ordered by name.
  - Card head: building icon in brand tone, the campus name as the card title, the address underneath (nothing when empty).
  - "Principal" (small, muted) followed by the avatar and name of each principal on that campus (rule 5), or "Not assigned" (muted).
  - Three figures in a row, each a small muted label over a number:

    | Label    | Value                                                                                        |
    | -------- | -------------------------------------------------------------------------------------------- |
    | Classes  | Non-archived classes on the campus                                                           |
    | Students | Students placed on the campus in the current term (active enrolment, not archived; see gaps) |
    | Staff    | Members of the campus team, excluding portal accounts (students and guardians)               |

  - **New**: an "Edit" ghost button in the card head, gate `team:update`.
- Below the grid, when the caller's campus scope isn't `all`: info callout "You only see the campuses you work on."
- Empty state (**new**; a school created by the platform console starts with no campus): empty state "No campuses yet", "Add the first campus to start adding classes and students.", with "New campus" (gate `team:create`).
- States: loading skeleton; error `ErrorMessage`; denied (no `team:read`) hides the Settings item and redirects; read-only acting super admin hides "New campus" and "Edit".

#### New campus (dialog)

The prototype's button is a stub that always creates "Ajah, 22 Addo Road, Ajah". The dialog below is inferred; its title, fields and labels are **new** copy except where quoted from the prototype.

- Title "New campus". Description "Each campus has its own staff, classes and students. You are added to it." (adapted from the page's info tooltip).
- Fields: Name (text, required, max 60), Address (text, optional, max 200).
- Buttons "Cancel" (ghost) and "Create campus" (primary, plus icon), gate `team:create`.
- Validation: empty name, "Give the campus a name."; duplicate (case-insensitive) in the school, "Ajah already exists." (prototype copy, 409).
- On success: the campus team is created, the caller is enrolled in it, the `campus` row is written, and the toast (success) reads "Ajah campus created. You were added to it." (prototype copy, name substituted).

#### Edit campus (dialog)

- Title "Edit {name}". Same fields, pre-filled. Buttons "Cancel" and "Save changes", gate `team:update`. Toast "Campus saved." (**new**).

## Business rules

1. A campus is a Better Auth team in the school plus exactly one `campus` row keyed by `team.id` ([ADR 0005](../adr/0005-tenancy.md)). Teams are created only through `AuthService.api.createTeam`; the default team is disabled.
2. Creating a campus enrols its creator in the team (Better Auth only activates a team the user belongs to). If any step fails, the team is removed (today's `CampusService.create` already does this; keep it).
3. Campus names are unique per school, case-insensitive (**new**; today nothing stops two "Lekki" teams).
4. A caller sees a campus only if they hold `campus:readAll` or belong to its team.
5. The principal shown on a campus is every member of that campus's team whose roles include the `principal` slug. Principal is a ready-made starter role seeded in M1.1 ([D-010](../technical-reference.md#decision-log)), so the slug is reserved.
6. The Classes figure counts classes on the campus with `retired_at` null. The Students figure counts distinct students with a current-term placement on the campus whose enrolment isn't withdrawn and who aren't archived (same rule as a class roster in [31](31-classes.md)). The Staff figure counts team members whose roles aren't only `student` or `guardian`.
7. A campus can be deleted only if nothing references it: no class (archived included), placement, student home campus, fee line, money account, journal line, store item or movement, announcement or approval item. Otherwise 409. The database's FKs (default `NO ACTION`) back this up; the service checks first so Better Auth's `removeTeam` never runs on a campus that has records.
8. Renaming a campus renames the Better Auth team (`updateTeam`); the address lives only on `campus`.
9. From M4.3, creating a campus also creates its store; the M4.3 migration backfills a store for every existing campus ([61-store](61-store.md)).

## Data

- `campus` exists (`team_id`, `organization_id`, `address`, timestamps; migration `20261007112300`). No new columns.
- Every new table that references a campus uses the composite FK `(campus_id, organization_id) → campus (team_id, organization_id)` (overview, rules every table follows). Configuration tables use the default `ON DELETE NO ACTION`, not `RESTRICT`: it still refuses deleting a campus that has rows, but lets a whole-school delete cascade through, where `RESTRICT` would fail as soon as the `campus` row cascades from `team`. Student and money tables may use `RESTRICT`, since a school with them can't be deleted at all. Today's `fee_schedule` and `student` FKs default to `NO ACTION`; `fee_schedule` goes away with M3.2.
- No migration in this slice. Rule 3 is a service-level check inside a transaction with an advisory lock per school, because Better Auth tables aren't hand-edited.
- Permissions: `team` gains `read` (`team: [...defaultStatements.team, 'read']` in `libs/policy/statements.ts`); `campus: ['readAll']` arrives with M1.1. Starter grants: administrator `team:read`, `team:create`, `team:update`, `campus:readAll`.

### What this replaces

| Today                                                                                                          | After M2.2                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /campuses`, `GET /campuses/:id` with bare `@OrganizationAuth()` (any member, scoped)                      | Unchanged gate for these two (name and address only), because campus pickers on student, fee and store screens serve people without `team:read`. The page uses a new `GET /campuses/summary` gated `team:read` |
| `POST /campuses` (`team:create`), enrols the creator                                                           | Kept; adds the duplicate-name check (409)                                                                                                                                                                      |
| `PATCH /campuses/:id` (`team:update`)                                                                          | Kept; gains the duplicate-name check                                                                                                                                                                           |
| `DELETE /campuses/:id` (`team:delete`) refusing only when `student` or `fee_schedule` rows exist               | Kept as API only; the check covers rule 7's list                                                                                                                                                               |
| `apps/web-admin/src/pages/campuses-page.tsx`: a `<ul>` of names and addresses plus an inline Name/Address form | Replaced by the card grid and the New campus and Edit campus dialogs inside the Settings frame                                                                                                                 |
| `apps/web-admin/src/routes/campuses.tsx`: loader only                                                          | Gains `beforeLoad` requiring `team:read`; loader prefetches the summary                                                                                                                                        |
| `campusesQueryOptions`                                                                                         | Kept for pickers; add `campusSummaryQueryOptions`                                                                                                                                                              |
| `seesAllCampuses(owner/admin)` in `libs/policy`                                                                | Replaced by `campus:readAll` (M1.1)                                                                                                                                                                            |

## API

Module `apps/api/src/app/modules/campus` (exists). Contract `contract.campuses`.

| Method | Path                | Permission              | Request               | Response                                                                                                | Errors                                                                                                      |
| ------ | ------------------- | ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET    | `/campuses`         | signed in to the school |                       | `Campus[]` (id, name, address) in campus scope, by name                                                 | —                                                                                                           |
| GET    | `/campuses/:id`     | signed in to the school |                       | `Campus`                                                                                                | 404 (other school, out of scope)                                                                            |
| GET    | `/campuses/summary` | `team:read`             |                       | `[{ ...Campus, principals: [{ userId, name }], counts: { classes, students, staff } }]` in campus scope | 403                                                                                                         |
| POST   | `/campuses`         | `team:create`           | `{ name, address? }`  | `Campus`                                                                                                | 400 (empty name), 409 (name exists), 403                                                                    |
| PATCH  | `/campuses/:id`     | `team:update`           | `{ name?, address? }` | `Campus`                                                                                                | 400, 404, 409 (name exists), 403                                                                            |
| DELETE | `/campuses/:id`     | `team:delete`           |                       | `{ id }`                                                                                                | 404, 409 ("This campus still has classes, students or money records, so it can’t be deleted." **new**), 403 |

## Acceptance criteria

- **List, all campuses.** Given Tunde, when he opens Campuses, then he sees Ikeja and Lekki cards with "2 campuses", no callout, and Lekki shows Grace Nwosu as principal.
- **List, own campuses.** Given a member with `team:read` on Lekki only, then only Lekki shows, the description reads "You belong to Lekki", and the callout "You only see the campuses you work on." appears.
- **Counts.** Given the seed in First term 2026/2027, then Lekki shows Classes 7 and Ikeja 2 (archived JSS 1 Ruby not counted), and the Students figures exclude Bola Johnson and Tayo Bankole (withdrawn).
- **Create.** Given Tunde, when he creates "Ajah" with address "22 Addo Road, Ajah", then the card appears, Tunde is a member of the Ajah team (he can make it his active campus), and the toast reads "Ajah campus created. You were added to it."
- **Create, duplicate.** Given Lekki exists, when someone creates "lekki", then 409 and "lekki already exists." (the prototype echoes the typed name).
- **Create, denied.** Given Grace (no `team:create`), then no "New campus" button and `POST /campuses` answers 403.
- **Summary denied.** Given Chika (no `team:read`), when she calls `GET /campuses/summary`, then 403; `GET /campuses` still returns Lekki only.
- **Out of scope.** Given Chika (Lekki), when she calls `GET /campuses/{ikeja}`, then 404.
- **Delete refused.** Given Lekki has classes, when the owner calls `DELETE /campuses/{lekki}`, then 409 and the team still exists.
- **Isolation.** Given a campus in school B, when a member of school A reads, edits or deletes it, then 404.

## Tests

- Unit: count rules (rule 6) against fixtures; the principal lookup. web-admin: description and callout per scope; "New campus" and "Edit" per permission.
- Integration (`api:test-integration`): existing `tenancy.integration.spec.ts` campus cases keep passing; add `GET /campuses/summary` for 403 without `team:read`, scope filtering, and another school's campus 404 [tenancy-002]; duplicate name 409; delete refused when a `class_arm` references the campus (and the Better Auth team survives); create rolls back the team if the `campus` insert fails.
- E2E (required, `eduvault-e2e`): administrator adds a campus, switches the active campus to it from the switcher, and sees it in the class campus picker.

## Open decisions

| #       | Question                                                                                                                                                                                                                                                             | Recommendation                                                                                                                                                                                                                  | Confidence                                                                         | Decided                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| OD-32-1 | "Principal" is found by role slug `principal`, but in the seed that's a custom role a school created, not a starter role. Options: (a) reserved slug lookup; (b) a `campus.principal_user_id` column set on the campus; (c) holders of `leave:approve` on the campus | (a) for v1: D-006 already ties the one-senior-role rule and the handover rule to the name `principal`, so treat it as a reserved slug and add `principal` to the starter roles (M1.1); show "Not assigned" when no one holds it | Medium: (b) is cleaner but needs a picker the prototype doesn't have               | [D-010](../technical-reference.md#decision-log): Principal is a ready-made starter role seeded in M1.1 |
| OD-32-2 | The role editor says the campus permission lets people "Add and rename campuses", the API has `PATCH`, but the page has no edit control. Ship "Edit" (name, address) on each card?                                                                                   | Yes, `team:update`                                                                                                                                                                                                              | High: an address typo otherwise needs a developer                                  | Adopted                                                                                                |
| OD-32-3 | Gate the plain campus list on `team:read`, or keep it open to any member?                                                                                                                                                                                            | Keep `GET /campuses` open (names and addresses, scoped) for pickers and switchers; gate the new summary on `team:read`                                                                                                          | Medium: gating the list breaks the bursar's campus filters; names aren't sensitive | Adopted                                                                                                |
| OD-32-4 | Ship a "Delete campus" control? `team:delete` exists; the prototype has none                                                                                                                                                                                         | API only in v1, refused while anything references the campus; no UI                                                                                                                                                             | Medium: deleting a campus is rare and mostly a set-up mistake                      | Adopted                                                                                                |
| OD-32-5 | Is a campus address required?                                                                                                                                                                                                                                        | Optional, as today                                                                                                                                                                                                              | High: the prototype shows nothing when it's empty                                  | Adopted                                                                                                |

## Prototype gaps noticed

- "New campus" is a stub that always creates Ajah; no dialog, no fields.
- No edit or delete UI, though `team:update` and `team:delete` exist. Edit ships here; delete stays API only.
- The Students figure counts every current-term placement, including withdrawn students (Bola, Tayo) and archived ones.
- The Staff figure would count portal accounts if students and guardians were team members; the prototype's member list is staff only.
- No empty state for a school with no campus.
- Principal by role name; settled by making Principal a starter role ([D-010](../technical-reference.md#decision-log)).

## Dependencies

- M1.1: `team:read`, `campus:readAll`, the guard and the Settings frame gating.
- M1.1: the `principal` starter role ([D-010](../technical-reference.md#decision-log)).
- M4.3: one store per campus, created with the campus and backfilled.
- M0.1: card grid, dialog. The counts read `class_arm` (M2.3) and placements (M2.4); before those land they show 0.

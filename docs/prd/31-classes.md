# PRD: Classes

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M2.3` (levels page, classes, class teachers, teacher-candidates endpoint, archive and restore); the "Graduate class" action ships with `M2.5` (see [roadmap](README.md))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md) (Foundation model: `class_level`, `class_arm`, `class_arm_teacher`; [Class scope](../brainstorming/data-model-overview.md#class-scope); Student lifecycle), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md), [technical reference](../technical-reference.md) [D-001, D-006, D-010, D-011, D-029](../technical-reference.md#decision-log). Sibling PRDs: [30 school years and terms](30-school-years-and-terms.md), [32 campuses](32-campuses.md), [40 students](40-students.md)

## Summary

A level is a school-wide year group (JSS 2); a class ("arm" in the model) is one group of a level on one campus (JSS 2 Gold, Lekki). Staff see the classes on their campuses, or only the ones they teach, open a class to see its teachers and roster, add, archive and restore classes, and name one or more class teachers per school year as lead, assistant or uniform teacher. Being a class teacher is what gives a teacher access to the class (class scope). Levels are seeded when the school is created and can be adjusted on a small Levels page. Final-year classes can be graduated in one step, or with the rest of the school by Start new school year. Nothing like this exists in Eduvault today; `student` has no class.

## Who uses it

| Persona (seed)                        | Permission(s)                                                                                                             | What they can do here                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Funmi Adeyemi, owner                  | every permission                                                                                                          | Everything, every campus and class                                                                                                               |
| Tunde Bakare, administrator (starter) | `class:create`, `class:read`, `class:readAll`, `class:update`, `class:assignTeacher`, `campus:readAll`, `student:archive` | Everything, every campus and class, including levels, archiving and Graduate class                                                               |
| Grace Nwosu, principal (starter)      | `class:read`, `class:readAll`, `campus:readAll`                                                                           | Sees every class, its teachers and the levels; no add, archive, assign or graduate controls                                                      |
| Emeka Obi, teacher (starter)          | `class:read` (no `readAll`)                                                                                               | Class-scoped: sees only JSS 3 Gold (lead class teacher) and the classes he teaches a subject to this term. Opening any other class answers 404   |
| Chika Eze, bursar                     | no `class:*`                                                                                                              | No Classes link; `/classes` redirects. Not class-scoped (a member with no class permission sees every student on her campuses, per the overview) |
| Kemi Lawson, no roles                 | none                                                                                                                      | No access                                                                                                                                        |
| Super admin acting                    | read-only until a reason is given                                                                                         | Sees every class; no write controls                                                                                                              |

Principal is a ready-made starter role seeded in M1.1 ([D-010](../technical-reference.md#decision-log)).

Scopes:

- **Campus scope.** A class is visible only if its campus is in the caller's campus scope (`campus:readAll` or `teamMember`).
- **Class scope.** Binds only callers holding `class:read` without `class:readAll`: they see classes where they are a class teacher in the current school year (any role) or teach a subject in the current term ([overview: Class scope](../brainstorming/data-model-overview.md#class-scope)).
- Out of either scope answers 404; in scope without the permission answers 403 [tenancy-001].

## Screens

### Classes

- Route `/classes`, web-admin. Side nav section **School**, first item (before Subjects). Phase label F0. Gate `class:read`.
- Header:
  - Title "Classes".
  - Description: with class scope `all`, "{n} classes in 2026/2027" (the current school year's name; `{n}` counts active classes only); class-scoped, "Classes you teach: JSS 2 Gold, JSS 3 Gold".
  - Info tooltip: with scope `all`, "A level is a year group, like JSS 1. Every campus uses the same levels. A class belongs to one campus and carries over each school year. Classes are archived, never deleted."; class-scoped, "Class scope: you see only the classes you teach or are class teacher of."
  - Action "New class" (primary, plus icon), gate `class:create`. Opens the New class sheet.
- Toolbar: a select "Show" with "Active classes" (default), "Archived" and "All" (OD-31-6). Hidden for class-scoped callers, who see only active classes.
- Body: one card per level that has at least one visible class, in level sequence order.
  - Card title: level name ("JSS 2"), layers icon. Description "3 classes" / "1 class". Flush table, 10 rows per page.
  - Columns:

    | Column        | Content                                                                                                                                                               |
    | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Class         | School icon, "JSS 2 Gold" in bold, campus name ("Lekki") underneath                                                                                                   |
    | Class teacher | None: "Not assigned" (muted). One: avatar and name. Several: "2 teachers" with a tooltip "Ayo Bassey (Lead), Claire Ade (Assistant)" ordered lead, assistant, uniform |
    | Students      | Right-aligned count of students placed in the class in the current term, excluding withdrawn enrolments and archived students                                         |
    | Status        | "Active" or "Archived" status badge                                                                                                                                   |

  - Row click opens the class.
  - Rows: order within a card by campus name, then class name.

- Empty state (nothing visible): a card with empty state "No classes in your scope" (school icon). A class-scoped caller with no classes sees this state rather than "Classes you teach: " with nothing after it.
- No current term: the set-up callout of [30](30-school-years-and-terms.md#no-current-term-shell-and-every-term-bound-screen) replaces the student counts.
- States: loading skeleton; error `ErrorMessage`; denied (no `class:read`) hides the nav link and redirects; read-only acting super admin hides "New class".

#### New class (sheet)

- Title "New class". Description "Classes belong to a campus and carry over each school year."
- Fields:

  | Field  | Type                                     | Required                                                                             | Default                                                    | Validation                                                                                                                                                                                                                  |
  | ------ | ---------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Level  | select of every level, by sequence       | yes                                                                                  | first level (the prototype pre-selects JSS 1 as demo data) | —                                                                                                                                                                                                                           |
  | Campus | select of campuses in the caller's scope | yes                                                                                  | the active campus                                          | out of scope → 404                                                                                                                                                                                                          |
  | Name   | text                                     | yes (**new**; the prototype doesn't require it and pre-fills "Diamond" as demo data) | empty                                                      | "Give the class a name, for example Gold." (**new**); "JSS 1 Gold already exists on Lekki." (**new**, 409); for an archived match, "JSS 1 Ruby already exists on Ikeja and is archived. Restore it instead." (**new**, 409) |

- Buttons "Cancel" (ghost) and "Create class" (primary).
- On success: sheet closes, toast (success) "JSS 1 Diamond created on Lekki."

### Class

- Route `/classes/$classId`, web-admin. Not in the nav; breadcrumb "Classes › JSS 2 Gold" and the Classes nav item stays highlighted. Phase label F0. Gate `class:read`.
- Not found (unknown id, another school, campus or class out of scope): header "Class not found"; empty state "We couldn’t find that class", "It may have been moved, or it may belong to a campus or class you don’t look after.", button "Go back" (to Classes).
- Header:
  - Title "JSS 2 Gold".
  - Description "Lekki campus · 8 students · First term", plus " · final year" when the level has no next level, plus " · archived" when archived.
  - Action "Graduate class" (graduation-cap icon), gate `student:archive`, shown only for a final-year level with at least one student in the roster, and only once M2.5 has shipped.
  - Overflow menu (ellipsis) with "Archive class" or "Restore class", gate `class:update` (OD-31-2). No confirmation. Toasts (new copy): "JSS 1 Ruby archived. It stays on file and can be restored." / "JSS 1 Ruby restored." Archiving a class with students placed this term or later is refused (rule 6): toast (danger) "Students are placed in JSS 2 Gold this term or later, so it can’t be archived yet."
- Two cards side by side (stacked on phones):
  1. **Teachers** (users icon).
     - With class teachers: a small label "Class teachers", then one row per class teacher of the current school year, ordered lead, assistant, uniform: avatar and name, a role badge ("Lead" in brand tone, "Assistant" and "Uniform" secondary), and an icon button "Remove" (x icon, ghost), gate `class:assignTeacher`. Below the list, "Add class teacher" (outline, small, user-plus icon), gate `class:assignTeacher`, hidden on an archived class.
     - Without: empty state "No class teacher yet", "Add a lead teacher so the class has someone responsible.", with the same "Add class teacher" button.
     - Then a divider and a subjects table, columns "Subject" and "Teacher" (avatar and name, or "—"), for the subjects of the class's level in the current term. Owned by [60 subjects](60-subjects.md) (M4.1); not rendered until M4.1 ships.
  2. **Roster** (graduation-cap icon, count badge). Flush table, 10 per page:

     | Column    | Content                                                                                         |
     | --------- | ----------------------------------------------------------------------------------------------- |
     | Student   | Avatar and full name, linking to the student                                                    |
     | Adm. no.  | Monospace "GF-0123"                                                                             |
     | Electives | The student's electives this school year, comma-separated, or "—". From M4.2; hidden until then |

     Empty: the standard "Nothing here yet" empty state.

- Remove class teacher: no confirmation. Toast (success) "**Ayo Bassey** removed as class teacher of JSS 2 Gold."
- Read-only acting super admin: no Add, Remove, Archive, Restore or Graduate controls.

#### Add class teacher (dialog)

- Title "Add class teacher". Description "A class can have several class teachers. Being one gives that teacher access to this class."
- Fields:

  | Field   | Type                                                                                                             | Required | Default     | Hint                                                                                                                                   |
  | ------- | ---------------------------------------------------------------------------------------------------------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
  | Teacher | select of teacher candidates (rule 9), excluding people already class teachers of this class this year (**new**) | yes      | none chosen | "Only teachers on the Lekki campus are listed." With no candidates: "No teachers on the Lekki campus yet. Add one under People first." |
  | Role    | select "Lead", "Assistant", "Uniform"; "Lead" is left out when the class already has a lead this year            | yes      | "Assistant" |                                                                                                                                        |

- Buttons "Cancel" (ghost) and "Add class teacher" (primary, user-plus icon), gate `class:assignTeacher`.
- Validation: "Choose a teacher."; "Choose a role."; "Ayo Bassey is already a class teacher of JSS 2 Gold." (409). **New**: "Only teachers on the Lekki campus can be class teachers of this class." (candidate check, 400); "JSS 2 Gold already has a lead class teacher: Ayo Bassey." (409, rule 8); "JSS 1 Ruby is archived. Restore it before adding teachers." (409).
- On success: toast (success) "**Claire Ade** added as assistant class teacher."

#### Graduate {class} (dialog, ships with M2.5)

- Large dialog, graduation-cap icon. Title "Graduate SS 3 Gold". Description "Ticked students move to Graduated for this school year. Untick anyone repeating the year."
- Body: a warning callout "Usually done once, at the end of Third term. Graduates leave the roll and are not billed again; what they owe stays in Who owes." Then one checkbox per roster student, all ticked, ordered by balance owed (highest first): name in bold; below, "GF-0061" and, only if the viewer holds `invoice:read` and the student owes, " · still owes ₦45,000". Before M3 there is no balance: order by last name, then first name.
- A muted note under the list: "To move the whole school into the next year, graduations included, use Start new school year on Students." with a link to [Start new school year](40-students.md#start-new-school-year-dialog) (shown with `enrollment:place`).
- Buttons "Cancel" (ghost) and "Graduate ticked students" (primary, graduation-cap icon), gate `student:archive`.
- Validation: "Tick at least one student."
- Before the last term of the school year (OD-31-4): confirming opens a second confirmation, title "Graduate during {current term}?", text "It is still {current term}. Graduates leave the roll today and won’t be billed for the rest of {school year}.", buttons "Go back" (ghost) and "Graduate now" (primary).
- On success: toast (success) "3 students graduated." ("1 student graduated." for one) with an action button "Graduated tab" that opens Students on the Graduated tab.

### Levels

A minimal list in the Settings frame under **School structure**, after Campuses ([D-011](../technical-reference.md#decision-log), OD-31-1). Not in the prototype; all copy here is new.

- Route `/settings/levels`, gate `class:read` to see, `class:update` to change.
- Header: title "Levels", description "Year groups every campus uses, in order. The last one is the final year."
- Table, by sequence: Code, Name, Next level ("Final year" when none), and with `class:update` a row menu "Edit" and "Move up" / "Move down".
- Action "Add level" (primary, plus icon), gate `class:update`. Dialog fields: Code (2–8 capitals and digits, unique), Name, Next level (select of levels, or "Final year"), placed after the current last level. Toast "{name} added."
- Edit dialog: Name and Next level; the code is fixed. Toast "{name} saved."
- Errors: "{code} already exists." (409); "A level can’t lead to itself." (400).
- A level has no delete. A level no class, enrolment or fee line uses yet can be renamed and reordered like any other.

## Business rules

1. Levels are school-wide: every campus uses the same levels. A level's code is unique per school. A level with no next level is the final year.
2. A class belongs to exactly one level and one campus, and its name is unique for that level and campus, archived classes included (`UNIQUE (class_level_id, campus_id, name)`).
3. A class's display name is "{level name} {class name}" ("JSS 2 Gold").
4. Classes carry over from year to year; they are never deleted. Archiving sets `retired_at` and `retired_by` ("Archived" on screen).
5. An archived class is still listed under "Archived" or "All" and still opens, but is not offered when placing a student, admitting, moving a student for next term, or as a target in Start new school year; it is not counted in a campus's classes or in the Classes description; it gets no new class teachers; and the dashboard "classes without a class teacher" task ignores it.
6. A class can be archived only when no student is placed in it for the current or a later term (OD-31-2). Restoring is always allowed.
7. Class teachers belong to a class and a school year (the current one, OD-31-5). A person holds at most one role per class per year (`UNIQUE (class_arm_id, session_id, user_id)`). Role is one of lead, assistant, uniform.
8. A class has at most one lead class teacher per year (OD-31-3).
9. Teacher candidates for a class are school members who hold `class:read` and either belong to the class's campus (`teamMember`) or hold `campus:readAll` ([D-006](../technical-reference.md#decision-log)). The server re-checks this on assign.
10. Being a class teacher this year (any role) puts the class in that person's class scope. Removing them takes it out immediately.
11. The Students count and the roster are students placed in the class for the current term whose enrolment isn't withdrawn and who aren't archived.
12. The roster needs `student:read` as well as `class:read`; without it the Roster card is not shown (**new**; every starter role with `class:read` also holds `student:read`).
13. "Graduate class" is offered only for a final-year level. Each ticked student must be on the class roster this term. For each, the student is graduated as [40-students](40-students.md) S-6 sets out: archived today by the caller with `exit_kind = 'graduated'`, exit reason "Completed {level name}", `graduated_session_id` = the current school year, their current enrolment `completed`, and their own portal login closed. All or nothing in one transaction. Balances are untouched; debts stay on Who owes. A class graduated here is skipped by Start new school year, which graduates final-year classes the same way in bulk ([40](40-students.md#start-new-school-year-dialog) S-25, S-27, [D-029](../technical-reference.md#decision-log)).
14. The dashboard task (M2.6) for holders of `class:assignTeacher`: "{n} class(es) without a class teacher" lists non-archived classes in campus scope that have students this term and no class teacher this year; button "Assign" opens the class (one) or Classes (several).
15. Graduate class can run in any term. Before the last term of the school year it asks for a second confirmation (OD-31-4).
16. A new school gets the default level ladder when it is created (M1.2, [D-011](../technical-reference.md#decision-log)): Primary 1–6, JSS 1–3 and SS 1–3, each leading to the next, SS 3 the final year. Primary 6 leads to JSS 1 and JSS 3 to SS 1.

## Data

- Tables as in [overview: Foundation model](../brainstorming/data-model-overview.md#foundation-model): `class_level`, `class_arm`, `class_arm_teacher`. `grade_scale_id` on `class_level` arrives with grading (nullable now).
- Additions to flag:
  - `class_arm.retired_by` (user id, nullable) to record who archived it.
  - Partial unique index `UNIQUE (class_arm_id, session_id) WHERE role = 'lead'` (rule 8).
  - `class_arm_teacher.organization_id` with composite FKs to `class_arm` and `academic_session`, so an assignment can't cross schools.
  - `class_arm (campus_id, organization_id)` composite FK to `campus`, as for every campus reference, with the default `ON DELETE NO ACTION` (refuses deleting a campus that has classes, but lets a whole-school delete cascade through).
  - `class_level`, `class_arm` and `class_arm_teacher` reference `organization` with `ON DELETE CASCADE` (configuration, removed with an empty school). Student and money tables that reference a class or level use `NO ACTION`; arms are never deleted on their own because there is no delete endpoint.
  - `class_level.next_level_id` FK to `class_level` in the same school; a check that it isn't the level itself.
- Migration: one migration for the three tables. The school-creation hook (`afterCreateOrganization`, M1.2, [D-011](../technical-reference.md#decision-log); see [33](33-school-settings.md)) inserts the default level ladder (rule 16), and this migration backfills it for existing schools that have none; the dev seed inserts Greenfield's nine levels and ten classes.
- Permissions: add `class: ['create', 'read', 'readAll', 'update', 'assignTeacher']` to `libs/policy`; starter grants: administrator all five, teacher `class:read`. No `class:delete`.
- `OrgContext` gains `classScope: 'all' | classIds[]` and the `inClassScope` helper (permissions doc, phase 4b); it reads `class_arm_teacher` for the current year (and `subject_teacher` once M4.1 lands).

## API

New module `apps/api/src/app/modules/class`. Contract under `contract.classes` and `contract.classLevels`.

| Method | Path                              | Permission                                 | Request                                                             | Response                                                                              | Errors                                                                                                                        |
| ------ | --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/class-levels`                   | signed in to the school                    |                                                                     | `ClassLevel[]` by sequence, with `isFinalYear`                                        | — (levels are needed by admission and fee screens for people without `class:read`)                                            |
| POST   | `/class-levels`                   | `class:update`                             | `{ code, name, nextLevelId? }`                                      | `ClassLevel`                                                                          | 400, 409 (code exists), 403                                                                                                   |
| PATCH  | `/class-levels/:id`               | `class:update`                             | `{ name?, sequence?, nextLevelId? }`                                | `ClassLevel`                                                                          | 400 (next level is itself), 404, 403                                                                                          |
| GET    | `/classes`                        | `class:read`                               | `?campusId&levelId&status=active\|archived\|all` (default `active`) | `Class[]` with `level`, `campus`, `classTeachers[]`, `studentCount`, `retiredAt`      | 403. Filtered by campus and class scope                                                                                       |
| GET    | `/classes/:id`                    | `class:read`                               |                                                                     | `ClassDetail`: the above plus `roster[]` (only with `student:read`) and `isFinalYear` | 404 (other school, campus or class out of scope), 403                                                                         |
| POST   | `/classes`                        | `class:create`                             | `{ levelId, campusId, name }`                                       | `Class`                                                                               | 400 (empty name), 404 (campus or level not in school or scope), 409 (name taken), 403                                         |
| PATCH  | `/classes/:id`                    | `class:update`                             | `{ name?, archived? }`                                              | `Class`                                                                               | 404, 409 (name taken; archiving with current or later placements, rule 6), 403                                                |
| GET    | `/classes/:id/teacher-candidates` | `class:assignTeacher`                      |                                                                     | `[{ userId, name }]` (rule 9, minus current class teachers)                           | 404, 403                                                                                                                      |
| POST   | `/classes/:id/teachers`           | `class:assignTeacher`                      | `{ userId, role }`                                                  | `ClassTeacher`                                                                        | 400 (role; not a candidate), 404 (class out of scope; user not in school), 409 (already assigned; second lead; archived), 403 |
| DELETE | `/classes/:id/teachers/:userId`   | `class:assignTeacher`                      |                                                                     | `{ classId, userId }`                                                                 | 404 (no such assignment this year), 403                                                                                       |
| POST   | `/classes/:id/graduate`           | `student:archive` (and `class:read` scope) | `{ studentIds: string[] }` (min 1)                                  | `{ graduated: number }`                                                               | 400 ("Tick at least one student."; level not final year; a student not on the roster), 404, 403. Ships with M2.5              |

## Acceptance criteria

- **List, all.** Given Tunde, when he opens Classes, then he sees every active class on both campuses grouped by level, with the description "9 classes in 2026/2027" (archived JSS 1 Ruby is not counted and shows only under "Archived" or "All").
- **List, class scope.** Given Emeka (lead of JSS 3 Gold, `class:read` only), then Classes shows only the classes in his class scope and the description "Classes you teach: JSS 3 Gold" (plus any subject classes once M4.1 lands).
- **Class out of scope.** Given Emeka, when he opens JSS 2 Silver by URL or calls `GET /classes/:id`, then "Class not found" / 404.
- **Campus out of scope.** Given a Lekki-only member with `class:read` and `class:readAll` but not `campus:readAll`, when they open JSS 2 Emerald (Ikeja), then 404.
- **Create.** Given Tunde, when he creates JSS 1 Diamond on Lekki, then it appears under JSS 1 as Active with "Not assigned" and the toast "JSS 1 Diamond created on Lekki."
- **Create, duplicate.** Given JSS 2 Gold exists on Lekki, when someone creates it again, then 409 and "JSS 2 Gold already exists on Lekki."
- **Create, denied.** Given Grace (no `class:create`), then the button isn't shown and `POST /classes` answers 403.
- **Assign.** Given Tunde on JSS 2 Gold, when he adds Claire Ade as Assistant, then the Teachers card lists Ayo Bassey (Lead) then Claire Ade (Assistant), and Claire's class scope now includes JSS 2 Gold.
- **Assign, not a candidate.** Given Emeka is on Lekki only, when someone assigns him to JSS 2 Emerald (Ikeja) through the API, then 400.
- **Assign, twice.** Given Ayo is already a class teacher of JSS 2 Gold, then 409 and "Ayo Bassey is already a class teacher of JSS 2 Gold."
- **Second lead.** Given Ayo leads JSS 2 Gold, then the Role select has no "Lead", and adding another Lead through the API answers 409.
- **Remove.** Given Ayo is removed from JSS 2 Gold, then the toast reads "**Ayo Bassey** removed as class teacher of JSS 2 Gold" and Ayo (without `class:readAll`) gets 404 on the class.
- **Archived.** Given JSS 1 Ruby is archived, then it lists with "Archived" under "Archived" or "All", is absent from placement pickers and from Start new school year targets, and adding a teacher answers 409.
- **Archive, refused.** Given JSS 2 Gold has students placed this term, when Tunde archives it, then 409 and the toast "Students are placed in JSS 2 Gold this term or later, so it can’t be archived yet."
- **Restore.** Given JSS 1 Ruby is archived, when Tunde restores it, then it shows "Active" and the toast reads "JSS 1 Ruby restored."
- **Graduate (M2.5).** Given SS 3 Gold with Efe, Sade and Yinka in Third term, when Tunde unticks Yinka and confirms, then Efe and Sade are Graduated with enrolments completed and portal logins closed, Yinka is untouched, and the toast reads "2 students graduated."
- **Graduate early (M2.5).** Given First term is current, when Tunde confirms Graduate class, then the second confirmation "Graduate during First term?" appears, and nothing changes until "Graduate now".
- **Graduate, then start the year (M2.5).** Given Efe was graduated from SS 3 Gold, when Start new school year runs, then Efe isn't listed and isn't changed.
- **Graduate, not final year.** Given JSS 2 Gold, then no "Graduate class" button, and `POST /classes/:id/graduate` answers 400.
- **Levels.** Given a new school, then `/settings/levels` lists Primary 1 to SS 3 with SS 3 as "Final year". Given Tunde adds "Creche" before Primary 1 leading to Primary 1, then it appears first. Given Grace, then she sees the list without Add, Edit or Move controls, and `POST /class-levels` answers 403.
- **Isolation.** Given a class, level or class teacher in school B, when a member of school A reads or writes it, then 404.

## Tests

- Unit: class-scope computation (class teacher this year, any role; subject teacher this term; `readAll` and no class permission both mean `all`); candidate filter (rule 9); student count excludes withdrawn and archived; the default level ladder (rule 16). web-admin: the list's description per scope; the "Show" filter; buttons per permission; roster hidden without `student:read`; the early-graduation second confirmation.
- Integration (`api:test-integration`):
  - Isolation for `class_level`, `class_arm`, `class_arm_teacher` and every route: another school's ids answer 404 [tenancy-002].
  - Another campus's class answers 404 for a campus-scoped caller; another class answers 404 for a class-scoped caller.
  - 403 for each write without its permission.
  - Unique name per level and campus enforced by the database; one lead per class per year (partial index).
  - Assigning a user from another school answers 404; a non-candidate answers 400.
  - Archiving refused with a current-term placement; allowed once none remain.
  - School creation seeds the level ladder; a level's next level from another school is refused.
  - Graduate (M2.5): all-or-nothing when one student isn't on the roster; enrolments completed; school memberships of graduates removed.
- E2E (opt-in): administrator creates a class and adds a lead teacher; the teacher persona then sees only that class; teacher can't open another class (404 page).

## Open decisions

| #       | Question                                                                                                                                                                                                                          | Recommendation                                                                                                                                         | Confidence                                                                                                 | Decided                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| OD-31-1 | No screen creates or edits levels, yet a class needs one; a new school has none. Options: (a) seed a default ladder when a school is created, no editor; (b) seed plus a minimal Levels editor; (c) platform console sets them up | (b): seed Primary 1–6, JSS 1–3, SS 1–3 with next levels (SS 3 final) on school creation; a minimal Levels page for rename, add, reorder and next level | Medium: Nigerian schools vary (nursery, creche, A-levels); without an editor a school can't fix the ladder | [D-011](../technical-reference.md#decision-log): (b); levels seeded at school creation in M1.2, Levels page in M2.3 |
| OD-31-2 | Archived classes are shown but nothing archives or restores one. Ship "Archive class" / "Restore class" in v1?                                                                                                                    | Yes: `class:update`, refused while students are placed in the current or a later term                                                                  | Medium: retiring an arm is the data model's only removal path; without it renamed or merged arms pile up   | Adopted                                                                                                             |
| OD-31-3 | The prototype allows any number of lead class teachers per class. At most one lead?                                                                                                                                               | Yes, one lead per class per year; any number of assistants and uniform teachers                                                                        | Medium: "the class teacher" in dashboards and messages assumes one lead                                    | Adopted                                                                                                             |
| OD-31-4 | "Graduate class" can be run any time; the copy only says "Usually done once, at the end of Third term". Restrict to the Third term?                                                                                               | No restriction; keep the warning. Add a second confirmation if run before Third term                                                                   | Low: schools graduate early for exam classes                                                               | Adopted                                                                                                             |
| OD-31-5 | Class teachers can only be set for the current year, so next year's classes can't be staffed in July                                                                                                                              | Allow choosing the year in M2.3 only if [30](30-school-years-and-terms.md) OD-30-8 says so; otherwise current year only                                | Low: depends on how schools roll over                                                                      | Adopted: current year only, as OD-30-8 keeps future years out of scope                                              |
| OD-31-6 | Should the class list hide archived classes by default?                                                                                                                                                                           | Show active by default with a filter "Archived" (the prototype mixes them in)                                                                          | Medium: archived rows add noise every year                                                                 | Adopted                                                                                                             |

## Prototype gaps noticed

- No level management at all; nine levels exist only in the seed (OD-31-1).
- No archive or restore action for classes; only the "Archived" badge (OD-31-2).
- New class sheet: no required name, no duplicate check, demo defaults ("Diamond", JSS 1, Lekki).
- Add class teacher: candidates include people already assigned; two leads allowed; no candidate re-check on save; archived classes accept teachers.
- The list's description counts archived classes ("10 classes" includes JSS 1 Ruby).
- Class-scoped description with no classes reads "Classes you teach: " with nothing after it; it should show the empty state.
- Row order inside a level is seed order.
- Graduate toast doesn't pluralise ("1 students graduated."). Its balance sort and "still owes" need finance (M3).
- The subjects table reads subject data that arrives in M4.1, and the Electives column data that arrives in M4.2.
- When a member is removed from the school or a campus, their class-teacher rows stay; M1.3 should end them for the current year.

## Dependencies

- M1.1 (permissions, guard, class scope in `OrgContext`, the Principal starter role), M0.1 (sheet, dialog, table, badges).
- M1.2: school creation and its hook, which seeds the level ladder ([D-011](../technical-reference.md#decision-log)).
- [30 school years and terms](30-school-years-and-terms.md) (M2.1): class teachers and placements key off the current year and term.
- [32 campuses](32-campuses.md) (M2.2): every class sits on a campus; the Levels item sits in the Settings frame ([33](33-school-settings.md)).
- M2.4 (students, enrolment, placement) for the roster and counts; until then the roster is empty.
- M2.5 for the graduate endpoint and Start new school year ([40](40-students.md)); M4.1 for subjects; M4.2 for electives; M3 for balances in the graduate dialog.

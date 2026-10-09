# PRD: Subjects and subject teachers

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53` (script 3836–3918; seed `seedSubjects` 1417–1449; candidates `teacherCandidates` 1063; class scope 188–200)
- Milestone and slice: `M4.1` (catalogue, subject teachers); `M4.2` (level-subject editor and per-session elective picker) (see [roadmap](README.md))
- Related: [data-model-grading.md, Curriculum (F2)](../brainstorming/data-model-grading.md#curriculum-f2), [data-model-overview.md, Class scope](../brainstorming/data-model-overview.md#class-scope) and [Permission list](../brainstorming/data-model-overview.md#permission-list), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-005](../technical-reference.md#decision-log), [D-006](../technical-reference.md#decision-log)

## Summary

The subject catalogue for a school, which subjects each class level takes (core or elective), which students take each elective this session, and who teaches each subject in each class this term. Administrators keep the catalogue and assign subject teachers; teachers see the classes and subjects they teach. A subject-teacher assignment also adds the class to that teacher's class scope, so it decides which students they can see now and whose scores they can enter at F3.

## Who uses it

| Persona                         | Permission(s)                                                                                                              | What they can do here                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Owner                           | All                                                                                                                        | Everything below, on every campus                                                                 |
| Administrator (starter role)    | `subject:create`, `subject:read`, `subject:update`, `class:read`, `class:readAll`, `class:assignTeacher`, `campus:readAll` | Add subjects, see every level and class, assign and change subject teachers                       |
| Principal (custom role in seed) | `subject:read`, `class:read`, `class:readAll`, `campus:readAll`                                                            | See the catalogue, level lists and every class's subject teachers. Cannot assign                  |
| Teacher (starter role)          | `subject:read`, `class:read` (no `class:readAll`)                                                                          | See the catalogue and level lists; on Subject teachers, see only the classes in their class scope |
| Bursar (starter role)           | none of `subject:*`                                                                                                        | No nav link; the route answers 403                                                                |
| Super admin acting read-only    | read permissions only                                                                                                      | Sees the screen; "Add subject", "Assign" and "Change" are hidden                                  |

Scopes:

- The catalogue (`subject`) and level lists (`level_subject`) are school-wide and visible to every holder of `subject:read`.
- Subject teachers are listed per arm. An arm shows only if it is in the viewer's campus scope and class scope [overview: Class scope]. An arm out of scope answers 404 on any arm-addressed route.
- Elective takers are filtered to students the viewer can see (campus and class scope).
- Out-of-scope rows answer 404; in scope without the permission answers 403 [tenancy-001].

## Screens

### Subjects and teachers

- Route: `/subjects`, app `web-admin`.
- Nav: section **School**, label "Subjects", icon `book-marked`. No explicit order; it follows **Classes** in the School section.
- Phase: F2. Gate: `subject:read`. Without it the nav link is hidden and the route's `beforeLoad` redirects to the no-access state.
- Header:
  - Title "Subjects and teachers".
  - Description "The subject catalogue, what each class level takes, and who teaches what this term."
  - Action: primary button "Add subject" (icon `plus`), gate `subject:create`. Opens the **New subject** sheet.
- Tabs (key `grd-subj`, each with a count):
  1. "Catalogue": number of subjects in the catalogue, including retired ones.
  2. "By level": number of class levels with at least one subject.
  3. "Subject teachers": number of arms listed on that tab for this viewer.

#### Tab: Catalogue

One card, "Subject catalogue", icon `book-marked`, description "`{n}` subjects." (n includes retired), flush table.

| Column    | Content                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code      | The code in monospace (`MTH`)                                                                                                                                                                  |
| Name      | The subject name, medium weight                                                                                                                                                                |
| Taught at | Badges with the class-level codes whose list contains the subject, up to 4; then an outline badge "+`{n}`" whose tooltip lists the remaining codes. When on no level: muted "Not on any level" |
| Status    | "Archived" status badge (tooltip "Retired `{date}`") for a retired subject, otherwise "Active"                                                                                                 |

- Order: active subjects by name, then retired ones by name; 10 per page (the prototype lists in insertion order, unpaged).
- Row actions (ghost, extra small, gate `subject:update`): **Edit** (pencil) on every subject; **Retire** (archive) on an active subject, **Restore** (rotate-ccw) on a retired one.
- Empty: "No subjects yet".

#### Dialog: Edit subject

- Title "Edit `{Name}`". Description "The code `{CODE}` can’t change."
- One field **Name** (required). Buttons "Cancel" (ghost), "Save" (primary).
- Toast (success): "Saved **`{Name}`**." Report cards copy the name when they are published, so a rename never rewrites past results.

#### Dialog: Retire subject

- Title "Retire `{Name}`?". Body "It stays in the catalogue as Archived and keeps every past assignment. It can’t be added to a level or assigned while retired."
- Buttons "Cancel" (ghost), "Retire" (destructive, icon `archive`).
- Refused while the subject is on any level list (409): toast (danger) "Take `{Name}` off every class level first." (new copy).
- Toast (success): "`{Name}` retired." **Restore** acts at once with toast "`{Name}` restored."

#### Tab: By level

- A three-column grid of cards, one per class level that has at least one subject, in level order. From M4.2, every class level gets a card, an empty one reading "No subjects yet".
  - Card title: the level name ("JSS 2"); count badge: number of subjects.
  - Flush table, ordered by `sequence`:

    | Column  | Content                                        |
    | ------- | ---------------------------------------------- |
    | #       | `sequence` (right-aligned)                     |
    | Subject | Subject name                                   |
    | Kind    | Badge "Core" (secondary) or "Elective" (brand) |

- Below the grid, a collapsible card "Electives taken this session":
  - Icon `list-checks`; count: number of subjects that are an elective on any level.
  - Description "Electives are taken only by the students who choose them."
  - One row per elective subject: the subject name on the left; on the right, an avatar per student who takes it in the current session (tooltip: student name), only for students the viewer can see. If none: muted "Nobody yet".
  - No electives at all: "No electives."
- The tab is read-only in the prototype and in M4.1. M4.2 adds the two editors below, both gated `subject:update`.

#### Sheet: Subjects for a level (M4.2)

- Opens from **Edit subjects** (ghost, extra small, icon `pencil`) on each By level card. Title "Subjects for `{Level}`". Description "Core subjects are for every student at this level; electives only for those who choose them."
- One row per subject on the level, in order: a drag handle (and Move up / Move down buttons for keyboard use), the subject name, a **Core** / **Elective** select, and a **Remove** icon button.
- **Add a subject**: a select of active subjects not yet on the level; the new row is added last as Core.
- Buttons "Cancel" (ghost), "Save subjects" (primary, icon `check`). Saving replaces the level's list; `sequence` follows the row order from 1.
- Removing a subject that students take as an elective this session asks first: "`{n}` students take `{Subject}` as an elective this session. Remove it anyway?"; their elective rows for this session are removed with it.
- Toast (success): "`{Level}` subjects saved."

#### Sheet: Choose students for an elective (M4.2)

- Opens from **Choose students** (ghost, extra small, icon `user-plus`) on each row of "Electives taken this session". Title "`{Subject}` · `{School year}`". Description "Students at levels where `{Subject}` is an elective."
- Search box ("Search name or GF number"), then the students the viewer can see at those levels, grouped by class, each with a checkbox, ticked when they take it this session.
- Buttons "Cancel" (ghost), "Save" (primary, icon `check`).
- Toast (success): "`{n}` students take `{Subject}` this session." Students outside the viewer's scope are not listed and their rows are left unchanged.

#### Tab: Subject teachers

- Lists the arms that are:
  - not retired;
  - on a campus in the viewer's campus scope;
  - in the viewer's class scope;
  - with or without students placed this term (rule 9; the prototype hides arms with no students).
- Order: arm order.
- One collapsible card per arm:
  - Title "`{Arm name}` · `{Campus name}`" (e.g. "JSS 2 Gold · Lekki"), icon `school`.
  - Open by default if it is the first card, or if the viewer teaches any subject in that arm this term.
  - Count badge: "`{n}` unassigned" when any subject has no teacher this term, otherwise "`{n}` subjects".
  - Flush table, one row per subject on the arm's level list, ordered by `sequence`:

    | Column   | Content                                                                                                                                      |
    | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
    | Subject  | Subject name                                                                                                                                 |
    | Teacher  | Avatar and name of this term's subject teacher, plus a brand badge "You" when it is the viewer; muted "Unassigned" when none                 |
    | (action) | Ghost extra-small button "Assign" (no teacher) or "Change" (has one), icon `user-plus`, gate `class:assignTeacher`. Opens **Assign subject** |

- Empty (no arms listed): card with empty state, icon `school`, title "No classes assigned to you", description "Classes appear here once you are named as a subject teacher or class teacher."
- The tab always shows the current term. There is no term picker.
- Header action on the tab: **Copy from last term** (outline, icon `copy`, gate `class:assignTeacher`), shown when the previous term has subject teachers on the listed arms. Confirm dialog: title "Copy last term’s subject teachers?", body "Only subjects with no teacher this term are filled. Subjects no longer on the level, and teachers who can no longer teach on that campus, are skipped.", buttons "Cancel" and "Copy teachers". Toast (success): "`{n}` subject teachers copied from `{term}`.", plus " `{k}` skipped." when any were.

#### Dialog: Assign subject

- Opens from "Assign" or "Change". Title "Assign `{Subject name}`". Description "`{Arm name}` · `{Current term name}`".
- Field "Teacher": a select listing the candidates for the arm's campus [D-006]: members who hold `class:read` and either work on that campus or hold `campus:readAll` [overview: Permission list]. Default: the current subject teacher, otherwise the first candidate. Hint "Only teachers on this class’s campus are listed."
- Callout (info): "Saving makes this person the teacher of this subject in this class, and adds the class to their list."
- Buttons: "Cancel" (ghost); "Save teacher" (primary, icon `check`, gate `class:assignTeacher`).
- On submit:
  - Replaces any existing subject teacher for this arm, subject and current term with the chosen member.
  - Closes the dialog.
  - Toast (success): "`{Member name}` now teaches `{Subject name}` in `{Arm name}`."
- No candidates: the prototype shows an empty select. Build: show the hint the class-teacher dialog uses, "No teachers on the `{Campus}` campus yet. Add one under People first.", and disable "Save teacher".
- When the subject has a teacher, the dialog also shows **Remove teacher** (ghost, destructive, gate `class:assignTeacher`). It deletes this term's row only and the class leaves that member's class scope unless another row keeps it there. Toast (success): "`{Subject name}` in `{Arm name}` has no teacher now."

#### Sheet: New subject

- Opens from "Add subject" (only if the viewer holds `subject:create`).
- Title "New subject". Description "Add it to a class level afterwards to use it."
- Fields:

  | Field | Type                   | Required | Default | Hint / placeholder                                            |
  | ----- | ---------------------- | -------- | ------- | ------------------------------------------------------------- |
  | Code  | text, max 5 characters | yes      | empty   | placeholder "AGR"; hint "Up to 5 letters. Unique per school." |
  | Name  | text                   | yes      | empty   | placeholder "Agricultural Science"                            |

- Buttons: "Cancel" (ghost); "Add subject" (primary, icon `plus`, gate `subject:create`).
- Validation (toast, danger, sheet stays open):
  - Code or name empty: "Enter a code and a name."
  - Code already used in this school, including by a retired subject: "A subject with code `{CODE}` already exists. Codes are unique per school."
  - Code not 1–5 letters A–Z after trimming and upper-casing (build addition; the prototype only limits length): "Use up to 5 letters for the code."
- On success:
  - The code is stored upper-case; the name is trimmed.
  - The sheet closes and the Catalogue tab becomes active.
  - Toast (success): "Added **`{Name}`**. Add it to a class level to use it.", with action "By level", which switches to the By level tab.

#### States

- Loading: skeleton rows in each card.
- Error: the standard query error card with retry.
- Denied (403): no-access state, "You don’t have access to this page".
- Not found (404): not addressable by id in the prototype. The API answers 404 for an arm or subject out of scope or in another school.
- Read-only (super admin acting without a reason): every write control above is hidden; reads work.

#### Surfaces owned by other PRDs that read this module

Listed so the build keeps them in step; they are specified in their own PRDs.

- Class detail (`/classes/$classId`), Teachers card: a Subject / Teacher table for the current term ("—" when unassigned).
- Class detail roster: an "Electives" column with the student's electives this session.
- Dashboard "My classes" rows: the subjects the viewer teaches in each class.
- Class scope: a subject-teacher row this term adds the arm to the teacher's scope.
- F3 score entry: a subject-teacher row gives entry rights for that arm and subject.
- Role editor ([21](21-roles-and-permissions.md)): the Subjects area is described as "Add and change subjects"; choosing teachers sits with `class:assignTeacher` in the Classes area.

## Business rules

1. A subject has a code and a name. The code is 1–5 letters, stored upper-case, and unique per school across active and retired subjects [grading: Curriculum].
2. Subjects are referenced by id everywhere (levels, electives, teachers, later scores), never by name or code text [grading: Curriculum].
3. A subject sits on a class level at most once, as core or elective, with a `sequence` that orders the level list and later the report card [grading: Curriculum].
4. Core subjects apply to every student at the level. An elective applies only to students who take it this session, recorded through their enrolment [grading: Curriculum].
5. One subject teacher per arm, subject and term. Assigning again replaces the previous teacher for that term [grading: Curriculum]. **Remove teacher** deletes the current term's row; no scores exist at F2, so no history is lost.
6. Subject teachers are set for the current term only. Past terms are read-only; future terms are not addressable until current.
7. The teacher must be a candidate for the arm's campus: holds `class:read` and works on that campus or holds `campus:readAll` [D-006]. Anyone else is refused (422).
8. The subject must be on the arm's level list and not retired. Otherwise the assignment is refused (422).
9. Any active (not retired) arm in the viewer's campus and class scope can be listed and assigned, whether or not students are placed yet. The prototype hides arms with no students this term (SUB-6).
10. A subject-teacher row for the current term adds the arm to that member's class scope. The member then sees the arm and its students [overview: Class scope].
11. Assigning needs `class:assignTeacher`, not a `subject:*` permission [overview: Permission list, `class` row].
12. The Subject teachers tab and its API list only arms in the viewer's campus scope and class scope.
13. Elective takers are listed only for students the viewer can see.
14. Retiring a subject sets `retired_at` and `retired_by`. It is refused (409) while the subject is on any level list. A retired subject is never deleted, still shows in the catalogue as "Archived", and cannot be added to a level or assigned; past assignments keep pointing at it. **Restore** clears `retired_at`.
15. No endpoint deletes a subject, a level list entry with history, or a subject-teacher row from a past term [risk-001].
16. The subject code never changes after creation; the name can (`subject:update`).
17. **Level lists (M4.2)** are replaced as a whole with `subject:update`: each subject once, active only, `sequence` 1..n in the order given. Removing an elective from a level removes this session's `student_subject` rows for it at that level.
18. **Electives (M4.2)** are chosen per subject and session with `subject:update`, only for students the viewer can see whose enrolment's level has the subject as an elective (422 otherwise).
19. **Copy from last term** fills only arms and subjects with no teacher this term, from the previous term's rows, skipping a subject no longer on the level or retired, and a teacher who is no longer a candidate for the arm's campus (rule 7). It never overwrites a row.

## Data

All tables are in [data-model-grading.md, Curriculum (F2)](../brainstorming/data-model-grading.md#curriculum-f2). Each has `id`, `organization_id`, `created_at`, `updated_at`; FKs to `organization` are `ON DELETE RESTRICT`.

| Table             | Notes for this slice                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subject`         | `UNIQUE (organization_id, code)`; `CHECK (code ~ '^[A-Z]{1,5}$')`                                                                                       |
| `level_subject`   | `UNIQUE (class_level_id, subject_id)`. Composite FKs `(class_level_id, organization_id)` and `(subject_id, organization_id)` so a row can't mix schools |
| `student_subject` | Electives only. `UNIQUE (enrollment_id, subject_id)` (not stated in the doc; flagged)                                                                   |
| `subject_teacher` | `UNIQUE (class_arm_id, subject_id, term_id)`. Composite FKs to arm, subject, term and member, all within the organization                               |

Migration `create_curriculum_tables`: the four tables, the constraints above, and indexes on `(organization_id, term_id, user_id)` (class-scope lookups) and `(organization_id, class_arm_id, term_id)`.

New, flagged (not in the data-model docs):

- `subject.retired_by` (who retired it).
- `subject_teacher.assigned_by` (who assigned): the prototype's activity log names who assigned.
- The letters-only `CHECK` on `subject.code`.

Seed (M0.2 dev seed, from `seedSubjects`):

- Subjects MTH, ENG, BSC, SST, CVE, FRE, PHY, LIT, QR, and AGR retired on 2025-07-20.
- JSS 1–3: five core subjects plus French as elective 6. Primary 4: MTH, ENG, QR core. SS 1: MTH and ENG core; PHY and LIT elective.
- French electives for Ada, Zainab, Ifeoma and Ruth in 2025/2026 and 2026/2027.
- Nine first-term subject teachers.

## API

Contract types in `@eduvault/api-contract` under `contract.subjects`, `contract.levelSubjects` and `contract.subjectTeachers`. Every handler carries `@OrganizationAuth(resource, action)`.

| Method | Path                                             | Permission            | Request                                                                                 | Response                                                                                             | Errors                                                                                                                                   |
| ------ | ------------------------------------------------ | --------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/subjects`                                      | `subject:read`        | `?includeRetired=true` (default true)                                                   | `Subject[]` with `levelCodes: string[]`                                                              | 403                                                                                                                                      |
| POST   | `/subjects`                                      | `subject:create`      | `{ code, name }`                                                                        | `Subject`                                                                                            | 403; 409 code taken (including by a retired subject); 422 code not 1–5 letters or name blank                                             |
| PATCH  | `/subjects/:id`                                  | `subject:update`      | `{ name?, retired?: boolean }` (code is fixed)                                          | `Subject`                                                                                            | 403; 404 other school; 409 retiring a subject still on a level list                                                                      |
| GET    | `/level-subjects`                                | `subject:read`        | `?classLevelId=`                                                                        | `LevelSubject[]` (`classLevelId`, `subjectId`, `kind`, `sequence`)                                   | 403                                                                                                                                      |
| PUT    | `/class-levels/:levelId/subjects`                | `subject:update`      | `[{ subjectId, kind, sequence }]` (replaces the list; M4.2)                             | `LevelSubject[]`                                                                                     | 403; 404 level; 422 retired subject or duplicate                                                                                         |
| GET    | `/electives`                                     | `subject:read`        | `?sessionId=` (default current)                                                         | `[{ subjectId, studentIds[] }]`, students filtered to the viewer's scope                             | 403                                                                                                                                      |
| PUT    | `/electives/:subjectId`                          | `subject:update`      | `{ sessionId, studentIds[] }` (M4.2; sets the takers among students the viewer can see) | `{ subjectId, studentIds[] }`                                                                        | 403; 404 subject or a student out of scope; 422 subject not an elective at a student's level                                             |
| GET    | `/subject-teachers`                              | `subject:read`        | `?termId=` (default current)                                                            | `[{ classArmId, campusId, subjects: [{ subjectId, userId \| null }] }]` for the viewer's scoped arms | 403                                                                                                                                      |
| GET    | `/class-arms/:armId/teacher-candidates`          | `class:assignTeacher` | none                                                                                    | `[{ userId, name }]`                                                                                 | 403; 404 arm out of scope                                                                                                                |
| DELETE | `/class-arms/:armId/subject-teachers/:subjectId` | `class:assignTeacher` | none (current term implied)                                                             | 204                                                                                                  | 403; 404 arm out of scope or no teacher this term                                                                                        |
| POST   | `/subject-teachers/copy-from-previous-term`      | `class:assignTeacher` | none                                                                                    | `{ copied, skipped: [{ classArmId, subjectId, reason }] }`, over the viewer's scoped arms            | 403; 409 no previous term                                                                                                                |
| PUT    | `/class-arms/:armId/subject-teachers/:subjectId` | `class:assignTeacher` | `{ userId }` (current term implied)                                                     | `SubjectTeacher`                                                                                     | 403; 404 arm or subject out of scope or other school; 409 arm retired; 422 not a candidate, subject not on the level, or subject retired |

The candidate list endpoint ships with class-teacher assignment in M2.3; this module reuses it.

## Acceptance criteria

1. Given an administrator, when they open `/subjects`, then they see the three tabs with counts, and the Catalogue lists every subject including AGR as "Archived" with tooltip "Retired 20 Jul 2025".
2. Given a bursar without `subject:read`, when they request `/subjects` or `GET /subjects`, then the nav link is absent and the API answers 403.
3. Given an administrator, when they add code "agr" and any name, then the API answers 409 and the sheet shows "A subject with code AGR already exists. Codes are unique per school."
4. Given an administrator, when they add code "GEO" and name "Geography", then the subject is stored as `GEO`, the Catalogue shows it with "Not on any level", and the toast reads "Added **Geography**. Add it to a class level to use it." with a "By level" action.
5. Given code "AB1" or "ABCDEF", when submitted, then the API answers 422.
6. Given the seed, when anyone with `subject:read` opens By level, then JSS 1, JSS 2, JSS 3, Primary 4 and SS 1 cards show their subjects in sequence with Core and Elective badges.
7. Given Emeka Obi (Teacher role; subject teacher of Mathematics in JSS 2 Gold and JSS 3 Gold), when he opens Electives taken this session, then French lists only takers placed in arms in his class scope.
8. Given Emeka Obi, when he opens Subject teachers, then only the arms in his class scope are listed, and arms where he teaches are open, with a "You" badge on his rows.
9. Given a teacher with no class-teacher or subject-teacher rows this term, when they open Subject teachers, then they see "No classes assigned to you".
10. Given an administrator, when they assign a candidate to Mathematics in JSS 2 Silver, then any existing row for that arm, subject and term is replaced, the toast reads "`{name}` now teaches Mathematics in JSS 2 Silver.", and the teacher's class scope now includes JSS 2 Silver.
11. Given a member who lacks `class:read`, or is on another campus without `campus:readAll`, when they are submitted as teacher, then the API answers 422 and nothing changes.
12. Given a Lekki-only administrator without `campus:readAll`, when they `PUT` a subject teacher on an Ikeja arm, then the API answers 404.
13. Given a user of another school, when they `PUT` on this school's arm or subject id, then the API answers 404.
14. Given a retired subject, when it is assigned to an arm, then the API answers 422.
15. Given a super admin acting without a reason, when they open the screen, then "Add subject", "Assign" and "Change" are hidden, and any write answers 403.
16. Given French is on the JSS 1 list, when an administrator retires it, then the API answers 409 and the toast reads "Take French off every class level first."; given AGR (retired), when they press Restore, then it shows as Active.
17. Given an administrator renames ENG to "English Studies", then the catalogue shows the new name and the code stays `ENG`.
18. Given Mathematics in JSS 2 Silver has a teacher, when an administrator presses Remove teacher, then the row reads "Unassigned" and the teacher no longer sees JSS 2 Silver unless another row gives it to them.
19. Given second term is current and first term had nine subject teachers, one of whom has since left the campus, when an administrator copies from last term, then eight rows are created, one is reported as skipped, and no row assigned this term is changed.
20. (M4.2) Given an administrator saves JSS 2 with Agricultural Science added as Elective 7, then By level shows it seventh with an Elective badge; adding AGR while retired answers 422.
21. (M4.2) Given an administrator ticks Ada and Zainab under French, then both take French this session, and a student of a level where French is core answers 422.
22. Given the Catalogue holds 12 subjects, then page 1 lists 10, active ones by name before AGR.

## Tests

- Unit (`nx run web-admin:test`):
  - Code normalisation and validation (trim, upper-case, letters only).
  - Count badges ("2 unassigned" vs "6 subjects").
  - "Taught at" overflow badge.
  - Assign dialog default (current teacher, else first candidate).
- Unit (`nx run policy:test`): `class:assignTeacher` gates the assign route; `subject:create` gates the create route.
- Integration (`api:test-integration`):
  - Isolation per table and route [tenancy-002]: `subject`, `level_subject`, `student_subject`, `subject_teacher`. School B can't read, create against or assign on school A's rows (404).
  - Campus scope: Lekki-only admin gets 404 on an Ikeja arm.
  - Class scope: a teacher sees only their arms in `GET /subject-teachers`; elective takers are filtered.
  - Uniqueness: duplicate code (409, including against a retired subject); duplicate `(arm, subject, term)` resolves to replace.
  - Candidate rule [D-006]: a non-candidate gets 422; a `campus:readAll` holder from another campus is accepted.
  - Class scope effect: after an assignment, the teacher's `GET /students` includes the arm's students [testing-002].
- E2E (opt-in, `eduvault-e2e`):
  - Admin adds a subject and sees it in the Catalogue.
  - Admin assigns a subject teacher; the teacher signs in and sees the class under Classes and the "You" badge.
  - Foreign-school user gets 404 on the assign route.

## Open decisions

| #     | Question                                                                                                                                                                         | Options                                                                                                                                                                                                                                                    | Recommendation                                                                                                                 | Confidence                                                                                           | Decided             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------- |
| SUB-1 | How do subjects get onto a class level (core or elective, order)? The prototype has no UI; its own toast says "Add it to a class level to use it".                               | (a) An "Edit subjects" action on each By level card (add, remove, core/elective, drag to order), gated `subject:update`; (b) seed and API only for M4.1, UI later; (c) edit from the class-level settings page                                             | (a), shipped as its own slice (M4.2)                                                                                           | Medium: without it a new subject is unusable, but the prototype gives no design                      | Adopted; slice M4.2 |
| SUB-2 | How are a student's electives chosen for a session, and with which permission?                                                                                                   | (a) On the By level "Electives taken this session" card, per subject, a "Choose students" picker of students at levels where it is an elective; (b) on the student profile; (c) on class detail roster. Permission: `subject:update` or `enrollment:place` | (a) with `subject:update`, students limited to the viewer's scope; in M4.2 with SUB-1                                          | Low: no prototype design; the gate is a guess                                                        | Adopted; slice M4.2 |
| SUB-3 | Retiring a subject: there is no UI, though `subject:update` exists and the seed has a retired subject.                                                                           | (a) "Retire" row action on the Catalogue (`subject:update`), refused (409) while the subject is on any level list; (b) retire allowed anytime, and it drops off level lists from the next session; (c) no retire in F2                                     | (a), plus "Restore" for a retired subject; past assignments and later results keep pointing at it                              | Medium: matches "retired, never deleted"; blocking while on a level list avoids half-taught subjects | Adopted             |
| SUB-4 | Renaming a subject: no UI either.                                                                                                                                                | (a) "Edit" row action for the name only (`subject:update`); the code is immutable; (b) name and code editable                                                                                                                                              | (a). Report cards copy the name at publish, so a rename doesn't rewrite history                                                | High: the grading snapshot already copies names                                                      | Adopted             |
| SUB-5 | Removing a subject teacher without naming a replacement                                                                                                                          | (a) "Remove" option in the Assign dialog (`class:assignTeacher`); (b) only replace                                                                                                                                                                         | (a), which deletes only the current-term row (no scores exist at F2)                                                           | Medium: needed when a teacher leaves; deleting a current-term assignment loses no history            | Adopted             |
| SUB-6 | Can an arm with no students placed this term get subject teachers? The prototype hides such arms.                                                                                | (a) Hide and refuse (409); (b) list all active arms in scope                                                                                                                                                                                               | (b): timetables are set before students are placed at the start of a term                                                      | Medium: the hide looks incidental to the class-scope filter, not intended                            | Adopted             |
| SUB-7 | At a new term, do subject teachers carry over?                                                                                                                                   | (a) Nothing carries; every arm starts unassigned; (b) copy the previous term's rows when a term is set current; (c) a "Copy from last term" action on the tab                                                                                              | (c), gated `class:assignTeacher`, copying only rows whose subject is still on the level and whose teacher is still a candidate | Medium: (a) forces re-entry each term; (b) silently grants class scope                               | Adopted             |
| SUB-8 | Catalogue order and size                                                                                                                                                         | (a) Insertion order, no paging (prototype); (b) by name, paged at 10 like other tables                                                                                                                                                                     | (b) by name, with active subjects before retired ones                                                                          | High: catalogues stay small, but order should be predictable                                         | Adopted             |
| SUB-9 | Should the role editor's Subjects area keep the description "Add subjects and choose who teaches them"? Choosing teachers is gated by `class:assignTeacher` in the Classes area. | (a) Change it to "Add and change subjects"; (b) move `class:assignTeacher` into Subjects                                                                                                                                                                   | (a)                                                                                                                            | High: `assignTeacher` covers class teachers too [overview: Permission list]                          | Adopted             |

## Prototype gaps noticed

- No UI for `level_subject` or `student_subject`, though the add-subject toast and its "By level" action point the user there (SUB-1, SUB-2).
- `subject:update` is in the permission list and starter roles but is used by nothing on screen (SUB-3, SUB-4).
- The role editor describes the Subjects area as "Add subjects and choose who teaches them", but assigning uses `class:assignTeacher` (SUB-9).
- The code field only limits length to 5 and upper-cases. It accepts digits and symbols, though the data model says letters.
- The Assign dialog has no empty-candidates message (the class-teacher dialog does).
- The Subject teachers tab hides arms with no students this term, so they can't be pre-staffed (SUB-6).
- "Electives taken this session" counts subjects that are an elective on any level, but lists takers across all levels for that subject.
- The Catalogue count and the "`{n}` subjects." description include retired subjects.
- No term picker on Subject teachers, so past terms' assignments can't be viewed.
- `subjectsForArm` takes a term but ignores it; the level list is not versioned by session, so changing a level list changes past terms' view (accept for F2; F3 freezes cards at publish).

## Dependencies

None of these exist in code yet; today's migrations hold only `campus`, `school_account`, `fee_schedule` and `student`.

- M1.1: `subject:*` and `class:assignTeacher` in `libs/policy`, the guard, `/me/permissions`, nav gating.
- M2.1: sessions and terms (current term).
- M2.3: class levels, arms, class teachers, class scope, and the teacher-candidate endpoint.
- M2.4: enrolment and placement, for "students placed this term" and electives through the enrolment.
- M0.2: dev seed with the subjects data above.

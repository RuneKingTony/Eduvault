# PRD: School years and terms

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M2.1` (years, terms, holidays, make current including next year's first term, the no-current-term state); `M2.5` (placement roll-forward on make current, and the link from next year's first term to Start new school year) (see [roadmap](README.md))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md) (Foundation model: `academic_session`, `term`, `school_holiday`), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md), [technical reference](../technical-reference.md) decisions [D-001, D-005, D-006, D-017, D-023, D-029, D-035](../technical-reference.md#decision-log). Sibling PRDs: [31 classes](31-classes.md), [32 campuses](32-campuses.md), [33 school settings](33-school-settings.md), [40 students](40-students.md)

## Summary

A school year ("session") is the frame every term-bound record hangs off: charges, payments, placements, class teachers and, later, results. Staff with `session:*` create a year (three terms are generated for them), correct term dates, add and remove holidays in current and future terms, choose which term is current, and can delete a year that hasn't started and holds nothing. Moving into the next school year goes through its first term's "Make current", which first points staff to Start new school year so every student has a class in the new year. Today Eduvault has no calendar at all; this slice adds it and defines what the app does before a school has any year.

## Who uses it

| Persona (seed)                              | Permission(s)                                                            | What they can do here                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Funmi Adeyemi, owner                        | every permission                                                         | Everything on this page                                                                                                      |
| Tunde Bakare, administrator (starter role)  | `session:create`, `session:read`, `session:update`, `session:setCurrent` | Everything on this page                                                                                                      |
| Grace Nwosu, principal (starter role)       | none of `session:*`                                                      | No access: the Settings entry for this page is hidden, the route redirects; the dashboard term card shows no "Calendar" link |
| Chika Eze / Yemi Alade, bursar              | none of `session:*`                                                      | No access                                                                                                                    |
| Emeka Obi, teacher                          | none of `session:*`                                                      | No access                                                                                                                    |
| Kemi Lawson, member with no roles           | none                                                                     | No access                                                                                                                    |
| Super admin acting in the school            | read-only (every `read`) until a reason is given                         | Sees the page; every write control is hidden. With a reason header, full access                                              |
| Any member, students and guardians (portal) | signed in to the school                                                  | Read the current term and the derived "days off" feed used by the shell, dashboard and portal (see API)                      |

Scopes: school years, terms and holidays are school-wide (no `campus_id`). Another school's year, term or holiday answers 404 [tenancy-001]. In the school without the permission answers 403.

## Screens

### School years and terms

- Route `/calendar`, web-admin. Not in the side nav (`nav: false`); it lives in the Settings frame under **School structure → School years and terms** (first item of that group, [D-035](../technical-reference.md#decision-log)). Phase label F0. Gate `session:read`.
- Also reached from: the school switcher menu at the top of the side nav ("School years and terms", shown only with `session:read`), and the dashboard term card's "Calendar" button (shown only with `session:read`).
- Header:
  - Title "School years and terms".
  - Description "Each school year and its terms."
  - Info tooltip "Charges and payments belong to a term. One term is current at a time."
  - Action "New school year" (primary, plus icon), gate `session:create`, opens the New school year dialog.
- Body: one collapsible card per school year, newest first (by start date), 10 per page with the standard pager ("Showing 1 to 10 of N", Previous / numbers / Next).
  - Card title: the year name (`2026/2027`), calendar icon. Card description: "7 Sep 2026 – 23 Jul 2027".
  - Open by default for the year that holds the current term and for the year that starts next; the others start collapsed.
  - Card actions:
    - "Add holiday" (ghost, small, plus icon), gate `session:update`. Shown only while the year has not ended (`ends_on >= today`). Opens the Add a holiday dialog with that year's current term, or else its first term not yet ended, preselected. If none is left: toast "This school year has already ended." (danger).
    - An overflow menu "More" (ellipsis, icon only) with one item "Delete school year" (trash icon, destructive), gate `session:update`. The item is disabled with a tooltip giving the reason when deletion isn't allowed (see rules 12–14).
  - Card table (no pagination needed, three rows):

    | Column       | Content                                                                                                                                                                                                                                                                                                                                                                                         |
    | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Term         | Term name in medium weight ("First term")                                                                                                                                                                                                                                                                                                                                                       |
    | Dates        | "7 Sep 2026 – 11 Dec 2026"                                                                                                                                                                                                                                                                                                                                                                      |
    | School days  | Number, right-aligned: weekdays in the term minus its holidays                                                                                                                                                                                                                                                                                                                                  |
    | Holidays     | "3 days" / "1 day", with a tooltip listing each "1 Oct 2026 Independence Day · 29 Oct 2026 Mid-term break · …"; "—" when none. For a term not yet ended and a holder of `session:update`, the count is a button that opens the Holidays in {term} dialog                                                                                                                                        |
    | (no heading) | The current term shows a "Current" status badge. A "Make current" button (ghost, extra small, gate `session:setCurrent`) shows on the other terms of the year that holds the current term, and on the first term of the school year that starts next (rule 6). Then a row menu with "Edit dates" (pencil icon, gate `session:update`) on terms not yet ended. Terms of other years show nothing |

- Empty state (no school years): a card "School years" with icon, empty state title "No school years yet", text "Create the first school year to set up its terms.", and a small primary "New school year" button (gate `session:create`).
- "Make current" on another term of the current year (no confirmation): sets that term current, unsets the previous one, and rolls placements forward (rule 18). Toast (success): "Second term, 2026/2027 is now the current term." The finance screens' remembered term filter resets to the new current term.
- "Make current" on the first term of the year that starts next opens the dialog below.

#### Make current of next year's first term (dialog)

Moving into a new school year needs every student to have a class in it first. Placements don't roll forward across years (rule 18), so this dialog points to Start new school year ([40-students](40-students.md#start-new-school-year-dialog), [D-029](../technical-reference.md#decision-log)).

- Title "Make First term, 2027/2028 current?" (calendar icon). Description "2027/2028 begins, and Third term, 2026/2027 stops being the current term."
- When some students are still waiting to be moved (rule 19): warning callout "{n} students are not in a 2027/2028 class yet. Start 2027/2028 first, or they will have no class this term."
  - With `enrollment:place`: a button "Start 2027/2028 first" (outline, icon `calendar-plus`) in the callout. It closes this dialog and opens Students with the Start new school year dialog (`/students?dialog=start-year`).
  - Without it, the callout adds "Ask someone who can place students to start 2027/2028."
- When nobody is waiting: info callout "Every student is in a 2027/2028 class."
- Buttons "Cancel" (ghost) and "Make current" (primary, gate `session:setCurrent`), labelled "Make current anyway" while students are waiting.
- On success: toast (success) "First term, 2027/2028 is now the current term." Students who were still waiting can be moved afterwards: Start new school year stays offered for them while this term is current ([40](40-students.md) S-23).

#### New school year (dialog)

- Title "New school year". Description "Three terms are created for you, with breaks between them. You can add holidays afterwards."
- Fields:

  | Field  | Type                                                 | Required | Default                                                                                               | Hint                                         |
  | ------ | ---------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
  | Year   | text, pattern `\d{4}/\d{4}`, placeholder "2028/2029" | yes      | `Y/Y+1`, where Y is the end year of the latest year; with no year yet, Y is the current calendar year | "Two years in a row, for example 2028/2029." |
  | Starts | date                                                 | yes      | First Monday on or after 6 September of Y                                                             |                                              |
  | Ends   | date                                                 | yes      | Last Friday on or before 28 July of Y+1                                                               |                                              |

- Buttons "Cancel" (ghost) and "Create school year" (primary, plus icon, gate `session:create`).
- Validation, in this order, each an inline form error in the dialog (the prototype uses danger toasts):
  1. "Write the year as two years in a row, for example 2028/2029." (not `YYYY/YYYY`, or the second year isn't the first plus one)
  2. "2028/2029 already exists."
  3. "Choose valid dates: the end must be after the start."
  4. "A school year needs at least 12 weeks." (fewer than 84 days from start to end)
  5. "These dates overlap another school year."
- On success: the year and its three terms are created (rule 4), the dialog closes, toast (success) "**2028/2029** created with three terms." For a school's first year, its first term becomes current (rule 16) and the toast adds " First term is now the current term."

#### Edit dates (dialog)

- Opened from a term's row menu. Title "Edit {term name}, {year}". Description "Terms stay in order, inside the school year, without overlapping."
- Fields: "Starts" (date, required) and "Ends" (date, required), pre-filled.
- Buttons "Cancel" (ghost) and "Save dates" (primary, gate `session:update`).
- Validation (all new copy), inline:
  - "Choose valid dates: the end must be after the start."
  - "Keep the term inside {year}: {year start} – {year end}."
  - "These dates overlap {other term}."
  - "{date} is a holiday in this term that would fall outside it. Remove the holiday first."
  - "This term has already ended, so its dates can’t change." (409)
- On success: toast (success) "Dates saved. {term name}, {year} now has {n} school days."

#### Add a holiday (dialog)

- Title "Add a holiday". Description "Days open = weekdays in the term minus holidays."
- Fields:

  | Field | Type                                                                                                 | Required | Default                                                      | Hint                                        |
  | ----- | ---------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------ | ------------------------------------------- |
  | Term  | select of every term (any year) that has not ended, by start date, labelled "2026/2027 · First term" | yes      | The term chosen when the dialog opened                       | "Only current and future terms are listed." |
  | Date  | date                                                                                                 | yes      | Seven days after the later of today and the term's start     |                                             |
  | Name  | text                                                                                                 | yes      | empty (the prototype pre-fills "Inter-house sports" as demo) |                                             |

- Buttons "Cancel" (ghost) and "Add holiday" (primary, gate `session:update`).
- Validation: "Choose a term for the holiday." (no term); "Cannot add a holiday to a past term. Choose a current or future term." (term ended before today). New copy for checks the prototype lacks, marked **new**: "Choose a date inside {term name}: {start} – {end}." (date outside the term), "{date} is a weekend. Holidays are school days off." (Saturday or Sunday), "{date} is already a holiday: {name}." (duplicate).
- On success: toast (success) "Holiday added. First term, 2026/2027 now has 66 school days."

#### Holidays in {term} (dialog)

- Opened from a term's holiday count. Title "Holidays in {term name}, {year}".
- One row per holiday by date: "{date} · {name}", with an icon button "Remove" (x icon, ghost), gate `session:update`. Holidays can be removed, not renamed; a rename is remove plus add.
- Footer: "Add holiday" (ghost, plus icon) opening Add a holiday for this term, and "Close" (primary).
- Removing has no confirmation. Toast (success) "Holiday removed. {term name}, {year} now has {n} school days." A term that ended meanwhile answers 409 "This term has already ended, so its holidays can’t change."

#### Delete {year}? (dialog)

- Title "Delete 2027/2028?" with a trash icon. Description "6 Sep 2027 – 28 Jul 2028".
- Body: "This removes the school year, its three terms and any holidays in them. It cannot be undone." and an info callout "It has no students, charges or payments, so nothing else is affected."
- Buttons "Cancel" (ghost) and "Delete school year" (destructive, trash icon, gate `session:update`).
- On success: toast (success) "2027/2028 deleted." If the reason to refuse appears between opening and confirming, the refusal message is shown as a danger toast and nothing is deleted.

#### States

- Loading: card skeletons. Error: `ErrorMessage`.
- Denied (no `session:read`): the Settings item and the switcher item are hidden; a direct visit redirects to the person's default page (the prototype's "You don’t have access to this page" panel is demo tooling).
- Read-only (acting super admin without a reason, or a role with `session:read` only): the page renders with no "New school year", "Add holiday", "Make current", "Edit dates", holiday removal or delete controls.
- Not found: no detail route on this page.

### No current term (shell and every term-bound screen)

Before a school has any year there is no current term (rule 16). `GET /calendar/current` returns `term: null`, and every screen that shows or needs a current term renders a set-up callout in place of its term-bound content:

- With `session:create`: "Create the first school year" (info), with a button "New school year" that opens `/calendar` with the dialog open.
- Without it: "Your school hasn’t set up its school year yet." (info).

The dashboard (M2.6), classes (M2.3), students and admission (M2.4) and finance (M3) all use this one state; screens that don't depend on a term still render.

### Derived "days off" (used by other screens)

Not a screen of its own, but its rules belong here. The dashboard term card ("Week 5 of 14", "22 of 67 school days" on 7 Oct 2026, and the upcoming list) and the portal's holiday cards read one derived list:

- Holidays from today on, consecutive same-name days merged into one entry ("Mid-term break, Thu – Fri · 2 days off"); two days merge when they share a name and are at most 3 calendar days apart, so a Friday and the following Monday merge.
- Breaks between consecutive terms (across years), from the day after a term ends to the day before the next starts, with "Resumes {date}". Named by the earlier term's sequence: 1 → "Christmas break", 2 → "Easter break", 3 → "End-of-term break" (OD-30-6).

## Business rules

1. A school year's name is `YYYY/YYYY` with the second year one more than the first, and is unique per school.
2. A school year runs at least 84 days (12 weeks) from start to end, the end after the start.
3. School years of one school never overlap (inclusive dates).
4. Creating a school year creates exactly three terms, sequences 1–3, named "First term", "Second term", "Third term", dated by the term-splitting rule:
   - `total` = days from start to end; `third` = ⌊total / 3⌋; `gap` = clamp(round(third × 0.18), 7, 21).
   - Term 1 starts on the first Monday on or after the year's start.
   - Term i (i = 2, 3) starts on the first Monday on or after start + (i − 1) × third + ⌈gap / 2⌉.
   - Term i (i = 1, 2) ends on the last Friday on or before start + i × third − ⌊gap / 2⌋.
   - Term 3 ends on the last Friday on or before the year's end.
   - The year's own start and end are stored as entered, not snapped.
5. Exactly one term per school is current once the school has any year (partial unique index). With no year there is no current term (rule 16).
6. "Make current" moves the current flag in one transaction; the old term loses it. It is offered for the other terms of the year holding the current term, and for the first term of the school year that starts next ([D-017](../technical-reference.md#decision-log)). Any other term answers 409 "Only a term of this school year, or the first term of the next one, can be made current." Backwards jumps into an earlier year are not offered.
7. School days of a term = Monday–Friday dates from its start to its end, minus that term's holidays. "School days so far" counts up to today.
8. A holiday is one row per date. It can be added or removed only in a term that has not ended (`ends_on >= today`).
9. A holiday date falls inside its term and on a weekday (**new**, prototype doesn't check).
10. A date is a holiday at most once per school (**new** constraint).
11. Breaks are derived from term dates and never stored.
12. A school year that has started (`starts_on <= today`) can't be deleted: "A school year that has already started cannot be deleted."
13. A school year with any enrolment, placement, charge, payment allocation, fee line, class teacher assignment or other record pointing at it or its terms can't be deleted: "This school year has students, charges or payments, so it cannot be deleted." Only the year, its terms and their holidays are removed; every other reference is `ON DELETE NO ACTION`, so the database refuses too.
14. A school year that holds the current term can't be deleted: "The current term is in this school year, so it cannot be deleted." (**new**; reachable when next year's first term is made current before it starts).
15. Deleting is `session:update`; there is no `session:delete` (overview permission list).
16. A school with no year has no current term. Every screen that shows a current term handles `null` with the set-up callout above. Creating the first school year makes its first term current in the same transaction ([D-017](../technical-reference.md#decision-log)).
17. "Today" is the Africa/Lagos date from the one shared helper `schoolToday(ctx)` ([D-023](../technical-reference.md#decision-log)).
18. **Placement roll-forward (M2.5).** Making a term current copies, in the same transaction, each `active` enrolment's latest placement into that term when the enrolment has none for it ([40-students](40-students.md) S-31, [D-017](../technical-reference.md#decision-log)). Enrolments belong to one school year, so this never crosses years: next year's first term gets its placements from Start new school year ([D-029](../technical-reference.md#decision-log)).
19. **Students waiting for the new year.** For the "Make current" dialog of next year's first term, the waiting count is the school's Active students with an `active` enrolment in the year holding the current term and no enrolment in the next year ([40](40-students.md) S-24, without campus scope). Making the term current is never blocked by it.
20. **Edit dates.** Only a term that has not ended can change. Its start stays on or after the year's start and its end on or before the year's end; terms keep their order and don't overlap; no holiday of the term may fall outside the new dates. School days, breaks and the days-off list follow at once.

## Data

- Tables as in [overview: Foundation model](../brainstorming/data-model-overview.md#foundation-model): `academic_session`, `term`, `school_holiday`. All carry `organization_id`, `created_at`, `updated_at`.
- Constraints to add beyond the overview:
  - `academic_session`: `CHECK (ends_on - starts_on >= 84)`; overlap refused with an exclusion constraint `EXCLUDE USING gist (organization_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)` (needs `btree_gist`), or a service check if the extension is unwanted.
  - `term`: `organization_id` (not only through `session_id`) so the partial unique index `UNIQUE (organization_id) WHERE is_current` works; `CHECK (starts_on <= ends_on)`; `session_id` FK `ON DELETE CASCADE`.
  - `school_holiday`: `organization_id`; `UNIQUE (organization_id, date)` (**new**); `term_id` FK `ON DELETE CASCADE`.
  - Every other table that references `academic_session` or `term` uses the default `ON DELETE NO ACTION`: it refuses deleting a lone year that something points at, but lets a whole-school delete cascade through (`RESTRICT` would fail mid-cascade). Money, student and result tables keep `RESTRICT` on `organization`, so a school with records can't be deleted anyway.
  - `academic_session`, `term` and `school_holiday` reference `organization` with `ON DELETE CASCADE`: they are configuration, removed with an empty school ([33](33-school-settings.md) rule 18).
- Migration: one dbmate migration creating the three tables. No backfill (no schools have calendars).
- Permissions: add `session: ['create', 'read', 'update', 'setCurrent']` to `libs/policy/statements.ts`; grant to `owner` (all) and the `administrator` starter role (all four).

## API

New module `apps/api/src/app/modules/calendar`. Contract in `@eduvault/api-contract` under `contract.schoolYears`, `contract.terms`, `contract.holidays`, `contract.calendar`.

| Method | Path                      | Permission                                                         | Request                       | Response                                                                                                                                                                                                                                    | Errors                                                                                                                 |
| ------ | ------------------------- | ------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/school-years`           | `session:read`                                                     | `?page`                       | `{ items: SchoolYear[], total }`; each with `terms: Term[]` (`schoolDays`, `holidayCount`, `holidays[]`, `isCurrent`, `canMakeCurrent`, `ended`), `deletable: { ok, reason }`, and on the year that starts next `studentsWaiting` (rule 19) | 403                                                                                                                    |
| GET    | `/school-years/:id`       | `session:read`                                                     |                               | `SchoolYear`                                                                                                                                                                                                                                | 404 (other school)                                                                                                     |
| POST   | `/school-years`           | `session:create`                                                   | `{ name, startsOn, endsOn }`  | `SchoolYear` with three terms                                                                                                                                                                                                               | 400 (rules 1–2, message per rule), 409 (name exists; overlap), 403                                                     |
| DELETE | `/school-years/:id`       | `session:update`                                                   |                               | `{ id }`                                                                                                                                                                                                                                    | 404, 409 (rules 12–14, message per rule), 403                                                                          |
| POST   | `/terms/:id/make-current` | `session:setCurrent`                                               |                               | `Term`, plus `rolledForward` (placements copied, rule 18)                                                                                                                                                                                   | 404, 409 (term not offered, rule 6), 403                                                                               |
| PATCH  | `/terms/:id`              | `session:update`                                                   | `{ startsOn?, endsOn? }`      | `Term`                                                                                                                                                                                                                                      | 400 (rule 20: order, overlap with sibling terms, outside the year, a holiday left outside), 404, 409 (term ended), 403 |
| POST   | `/terms/:id/holidays`     | `session:update`                                                   | `{ date, name }`              | `Holiday`                                                                                                                                                                                                                                   | 400 (past term, outside term, weekend), 409 (date taken), 404, 403                                                     |
| DELETE | `/holidays/:id`           | `session:update`                                                   |                               | `{ id }`                                                                                                                                                                                                                                    | 409 (term ended), 404, 403                                                                                             |
| GET    | `/calendar/current`       | signed in to the school (`@OrganizationAuth()` with no permission) |                               | `{ term: Term \| null, schoolYear: SchoolYear \| null, schoolDays, schoolDaysSoFar }`                                                                                                                                                       | —                                                                                                                      |
| GET    | `/calendar/days-off`      | signed in to the school (staff and portal)                         | `?limit` (default 4, max 200) | `[{ kind: 'holiday' \| 'break', name, start, end, days, resume? }]`                                                                                                                                                                         | —                                                                                                                      |

- `GET /calendar/current` and `/calendar/days-off` are deliberately ungated: the shell, the dashboard and the portal need the current term for people without `session:read`.
- `POST /terms/:id/make-current` calls the `student` module's placement service for the roll-forward (rule 18) inside its transaction. Start new school year itself is `POST /students/new-school-year` in [40-students](40-students.md#api).

## Acceptance criteria

- **Create.** Given Tunde and no year overlapping, when he creates "2027/2028" from 6 Sep 2027 to 28 Jul 2028, then three terms exist with dates from rule 4 (6 Sep – 10 Dec 2027, 3 Jan – 31 Mar 2028, 24 Apr – 28 Jul 2028), none current if a current term already exists, and the toast reads "**2027/2028** created with three terms."
- **Name format.** Given any user with `session:create`, when the year is "2027/2029" or "27/28", then the API answers 400 and the dialog shows "Write the year as two years in a row, for example 2028/2029."
- **Duplicate.** Given 2026/2027 exists, when someone creates "2026/2027", then 409 and "2026/2027 already exists."
- **Too short.** Given a start and end 83 days apart, then 400 and "A school year needs at least 12 weeks."
- **Overlap.** Given 2026/2027 ends 23 Jul 2027, when a year starts 1 Jul 2027, then 409 and "These dates overlap another school year."
- **First year.** Given a school with no year, when the first year is created, then its first term becomes current.
- **No year yet.** Given a school with no year, then `GET /calendar/current` returns `term: null`, the dashboard shows "Create the first school year" to Tunde and "Your school hasn’t set up its school year yet." to Emeka.
- **Make current.** Given First term is current, when Tunde makes Second term current, then exactly one term is current, active enrolments without a Second term placement get one copied from First term, and the toast reads "Second term, 2026/2027 is now the current term."
- **Make current, next year.** Given Third term 2026/2027 is current and 2027/2028 exists, then First term 2027/2028 shows "Make current" and its Second and Third terms don't; `POST /terms/{Second term 2027/2028}/make-current` answers 409.
- **Make current, students waiting.** Given 357 students have no 2027/2028 enrolment, when Tunde presses "Make current" on First term 2027/2028, then the dialog warns "357 students are not in a 2027/2028 class yet. …", offers "Start 2027/2028 first" (which opens Students with the Start dialog), and labels the confirm "Make current anyway". Given a member with `session:setCurrent` but not `enrollment:place`, then the callout asks them to have someone start the year and has no Start button.
- **Make current, everyone moved.** Given Start 2027/2028 has run for every student, then the dialog shows "Every student is in a 2027/2028 class.", and after confirming, Ada's class this term is JSS 3 Gold and no placement was copied across years.
- **Make current, denied.** Given Emeka (no `session:setCurrent`), when he calls `POST /terms/:id/make-current`, then 403.
- **Edit dates.** Given Second term 2026/2027 hasn't ended, when Tunde moves its start a week later, then its school days drop and the toast states the new count. Given dates overlapping Third term, then 400 with "These dates overlap Third term." Given an ended term, then the row has no "Edit dates" and `PATCH` answers 409.
- **Holiday.** Given First term 2026/2027 has 67 school days, when a holiday is added on a weekday inside it, then it has 66 and the toast states the new count.
- **Holiday removed.** Given that holiday, when Tunde removes it, then the term has 67 school days again and the toast reads "Holiday removed. First term, 2026/2027 now has 67 school days." Removing a holiday in an ended term answers 409.
- **Holiday, past term.** Given Third term 2025/2026 has ended, when a holiday is added to it, then 400 and "Cannot add a holiday to a past term. Choose a current or future term."
- **Holiday, outside or weekend.** Given a date outside the term or on a Saturday, then 400 with the new copy.
- **Delete, started.** Given 2026/2027 started, then the menu item is disabled with "A school year that has already started cannot be deleted." and `DELETE` answers 409.
- **Delete, has records.** Given 2027/2028 hasn't started but has one enrolment, then 409 with "This school year has students, charges or payments, so it cannot be deleted."
- **Delete, holds the current term.** Given First term 2027/2028 was made current before 6 Sep 2027, then deleting 2027/2028 answers 409 with rule 14's message.
- **Delete, empty future year.** Given 2027/2028 hasn't started and holds nothing, when Tunde confirms, then the year, its three terms and its holidays are gone and the toast reads "2027/2028 deleted."
- **Read-only.** Given an acting super admin with no reason, when the page loads, then no write control renders and every write answers 403.
- **Isolation.** Given a year in school B, when a member of school A reads, deletes, edits, or adds or removes a holiday in it or its terms, then 404.
- **Days off.** Given holidays on Thu 29 and Fri 30 Oct named "Mid-term break", then `/calendar/days-off` returns one entry of 2 days; and after First term ends on 11 Dec it returns "Christmas break" with `resume` 11 Jan 2027.

## Tests

- Unit (`nx run api:test`): the term-splitting function (rule 4) against the seed years and edge lengths (84 days, 400 days); school-day counting; the days-off merge (same name ≤ 3 days apart; different names stay separate) and break naming; which terms may be made current (rule 6); the edit-dates checks (rule 20). (`nx run web-admin:test`): the page renders write controls only with the right permissions; the delete item shows the reason tooltip; the next-year make-current dialog's callout per waiting count and permission.
- Integration (`api:test-integration`):
  - Isolation for `academic_session`, `term`, `school_holiday` and every route above: another school's ids answer 404 [tenancy-002].
  - 403 for each write without its permission; read-only acting super admin refused.
  - Overlap and duplicate refused by the database, not only the service (insert directly and expect the constraint).
  - One current term per school under two concurrent `make-current` calls.
  - Creating the first year makes its first term current; creating a second doesn't move it.
  - Make current of next year's first term is allowed; any other next-year term answers 409.
  - Roll-forward copies placements within the year, skips withdrawn and completed enrolments and enrolments that already have one, and copies nothing into the next year.
  - Delete refused with a referencing enrolment (FK RESTRICT surfaces as 409), and while the year holds the current term.
- E2E (opt-in, `eduvault-e2e`): owner creates a year, adds and removes a holiday and sees the school-day count change, makes Second term current and sees the dashboard term card change; presses "Make current" on next year's first term and follows "Start {year} first"; teacher persona can't reach `/calendar`.

## Open decisions

| #       | Question                                                                                                                                                                                                                                                                      | Recommendation                                                                                                                                                                                                                                 | Confidence                                                                                             | Decided                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-30-1 | "Make current" is only offered inside the year that already holds the current term, so a school can never move into a new year. What else can be made current? Options: (a) prototype as is; (b) also the first term of the next year; (c) any term of a year that isn't over | (b): any term of the current year plus the first term of the year that starts next. It's the one step every school takes each September, and it keeps backwards jumps out                                                                      | High: without it the calendar dead-ends after one year                                                 | [D-017](../technical-reference.md#decision-log): (b); next year's first term points to Start new school year first ([D-029](../technical-reference.md#decision-log)) |
| OD-30-2 | What does the app do before a school has any year (no current term)? Options: (a) every term-bound screen shows a set-up prompt; (b) creating the first year makes its first term current automatically; (c) both                                                             | (c): the API returns `term: null`; the shell and dashboard show "Create the first school year" (to `session:create` holders) or "Your school hasn’t set up its school year yet" (others); creating the first year makes its first term current | Medium: the prototype crashes in this state (38 unguarded `currentTerm()` calls), so any answer is new | [D-017](../technical-reference.md#decision-log): (c), defined in M2.1                                                                                                |
| OD-30-3 | The data model says term dates are editable, the prototype has no way to edit them, and the generated dates rarely match a real calendar. Ship "Edit dates" per term in v1?                                                                                                   | Yes: an "Edit dates" row action (`session:update`) on terms not yet ended; terms stay in order, inside the year, non-overlapping; a holiday left outside its term blocks the edit                                                              | Medium: generated dates are a guess; schools will need to correct them before charging                 | Adopted                                                                                                                                                              |
| OD-30-4 | Holidays can be added but not removed or renamed. Allow removing a holiday in a term not yet ended?                                                                                                                                                                           | Yes, remove only (no edit), `session:update`                                                                                                                                                                                                   | Medium: typos and cancelled events are common; edit is remove plus add                                 | Adopted                                                                                                                                                              |
| OD-30-5 | One holiday is one date; a two-day mid-term break means adding twice. Add a date range to the dialog?                                                                                                                                                                         | Not in v1; keep the prototype's single date. Revisit if schools complain                                                                                                                                                                       | Medium: the prototype is the source of truth and the model already merges consecutive days for display | Adopted                                                                                                                                                              |
| OD-30-6 | Break names come from the term sequence ("Christmas break", "Easter break", "End-of-term break"), which assumes three terms and a Christian calendar                                                                                                                          | Keep for v1 (three terms are fixed by the data model); name them "Break after First term" if a school ever runs a different shape                                                                                                              | Low: copy question for the product owner                                                               | Adopted                                                                                                                                                              |
| OD-30-7 | What is "today" for started, ended and past-term checks? Server UTC, a fixed Africa/Lagos, or a per-school time zone?                                                                                                                                                         | Fixed `Africa/Lagos` in v1, one helper `schoolToday(ctx)` so a per-school zone can replace it                                                                                                                                                  | Medium: every pilot school is in Nigeria; UTC flips the date at 1am local                              | [D-023](../technical-reference.md#decision-log): Africa/Lagos through one helper; no per-school zone                                                                 |
| OD-30-8 | Class teachers are per session, but a year can't be prepared before it is current (class teachers, fee lines). Should screens let staff pick a future year?                                                                                                                   | Out of scope for M2.1; record as a follow-up for M2.3 and M3.2                                                                                                                                                                                 | Low: depends on how schools prepare September                                                          | Adopted. Students are the exception: Start new school year places them ahead ([D-029](../technical-reference.md#decision-log))                                       |

## Prototype gaps noticed

- `currentTerm()` is assumed to exist everywhere (38 call sites, one guard), so a new school with no year breaks every screen (OD-30-2). `nextSessionDefaults()` also crashes with no years.
- "Make current" can't move to another year (OD-30-1), and nothing moves students into the new year (Start new school year, [40](40-students.md#start-new-school-year-dialog)).
- No term-date editing, despite "dates staff can change" in the data model (OD-30-3); no holiday removal (OD-30-4).
- Holiday dialog doesn't check that the date is inside the term, a weekday, or not already a holiday. Its default name "Inter-house sports" and default date are demo values.
- `sessionRecords` counts payments by date range rather than by the year's terms; the build counts real references (rule 13).
- Delete is offered on the current year too; it's only stopped because that year has started.
- The New school year dialog's defaults assume the latest year ended in July, and have no value with no year.
- Validation is all toasts; the build shows field errors in the dialog.

## Dependencies

- M1.1 (permission list, guard, `/me/permissions`, nav gating) for `session:*` and the Settings frame.
- M0.1 for the Settings frame layout, collapsible card, dialog, pager and date inputs in `libs/ui`.
- M0.2 dev seed: Greenfield's two years, six terms and eleven holidays.
- Consumers that must handle `term: null` (OD-30-2): dashboard (M2.6), classes (M2.3), students and admission (M2.4), finance (M3).
- M2.5: the roll-forward (rule 18) and Start new school year ([40-students](40-students.md)), which the next-year make-current dialog links to. Before M2.5 ships, that dialog shows no callout.

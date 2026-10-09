# PRD: School fees and other fees

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M3.2` (see [roadmap](README.md)); the preview's "Already charged" badge, discount lines and pending-discount callout read charges and `student_discount`, both shipped in `M3.3`, and stay empty until then (see [Dependencies](#dependencies))
- Related: [data-model-finance.md, Fees and charging](../brainstorming/data-model-finance.md#fees-and-charging), [data-model-overview.md, Rules every table follows](../brainstorming/data-model-overview.md#rules-every-table-follows), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-005](../technical-reference.md#decision-log), [D-017](../technical-reference.md#decision-log), [D-024](../technical-reference.md#decision-log), [D-040](../technical-reference.md#decision-log); sibling PRDs [51-charge-students.md](51-charge-students.md), [52-charges.md](52-charges.md)

## Summary

The fee schedule: what each class level pays each term, broken into fee types (Tuition, PTA fee, School bus, …), with optional campus overrides, a "who it applies to" rule and opt-in fees. The bursar sets it on two screens, **School fees** (tuition) and **Other fees** (every other fee type), and checks the result for one student before charging. It replaces today's flat `fee_schedule` (one name and amount per campus) and its `/fees` pages. Changing a fee never changes a charge already sent.

## Who uses it

| Persona                                      | Permission(s)                                | What they can do here                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner (Funmi Adeyemi)                        | all                                          | Everything, every campus                                                                                                                                         |
| Bursar (Chika Eze, Lekki; Yemi Alade, Ikeja) | `feeLine:create`, `read`, `update`, `retire` | Add, change and retire their campus's fee lines (every-campus lines need `campus:readAll`, rule 12); add fee types; preview a student. Sees own campus overrides |
| Administrator (Tunde Bakare)                 | `feeLine:read`                               | Sees both screens and the preview; no write controls                                                                                                             |
| Principal (custom role)                      | none of `feeLine:*`                          | School fees and Other fees sub-tabs are hidden                                                                                                                   |
| Teacher, member with no roles                | none                                         | Not in nav; the route redirects                                                                                                                                  |
| Student, guardian                            | `feeLine:readOwn`                            | Not here; the portal's fee view is M3.7                                                                                                                          |
| Acting super admin, no reason                | read permissions only                        | Read-only: every write control hidden; writes answer 403                                                                                                         |

Scopes: **campus scope only** (finance is never class-scoped). A fee line with `campus_id` null ("Every campus") is visible to anyone holding `feeLine:read`. A campus line is visible only to members whose campus scope includes that campus. A campus line outside scope answers 404; in scope without the permission answers 403 [tenancy-001]. The preview's student list is limited to students in finance scope (the student's current-term campus is in campus scope).

## Screens

### Fees sub-tabs (shared frame)

- The Finance nav section has one item for this group: **Fees** (nav order 1), whose root screen is Who owes (`statement`, gate `invoice:read` or `payment:read`). School fees, Other fees, Charge students, Charges and charge detail are `nav: false` children of it; the Fees nav item stays highlighted on all of them.
- Every screen in the group renders a tab strip above its header, in this order: **Who owes**, **Charge students**, **Charges**, **School fees**, **Other fees**. A tab shows only when the viewer passes that screen's gate. Charge detail highlights **Charges**; a charge round highlights **Charge students**.
- Phase label F1.

### School fees

- Route `/finance/school-fees` (web-admin), nav: Finance › Fees › School fees tab. Gate `feeLine:read`.
- Header: title **School fees**; description "The main fee each class pays every term."; info tip "Parents see what each naira is for. Changing a fee never changes charges already sent."
- Header actions, in order:
  - **Term** select (aria-label "Term"): the current term and the next term (the next term of the same school year, or, from the last term of a year, the first term of the next school year once it exists), labelled `<Term name>, <School year>` (for example "First term, 2026/2027"). Default: the current term. The choice is shared with Other fees.
  - **Add a fee** (primary, plus icon), gate `feeLine:create`. Opens the add sheet.
- Cards, in order:
  1. **Fee grid** card, icon tags, title `School fees · <term>`, description `<n> fee(s) across <m> level(s).` (n = live tuition lines in the term, m = levels that have one). Flush table:
     - Columns: **Level**; one column per fee type shown (here only **Tuition**); **Typical total** with info tip "School fees plus the other fees every student pays. Optional fees and new-student-only fees are left out."
     - Rows: only levels that have at least one live (not retired) tuition line in the term, in level sequence. Paged 10 per page.
     - Cell: the every-campus amount, or "—" when there is none; after it a badge **Optional** (tip "Billed only to students who opted in") when the every-campus line is optional, and a badge **New students only** or **Returning students only** (tip: the applies-to label) when it is not "Everyone". Under it, one small muted line per campus override: `<Campus> ₦<amount>`, tip "Campus override: replaces the every-campus amount there". A cell with neither base nor override shows "—".
     - **Typical total** for a level = sum of every live, every-campus, non-optional line of the level in the term **across all fee types** (not only tuition) whose `applies_to` is not `new`. Campus overrides are ignored.
  2. A two-column row (main + side):
     - **All fees** card, collapsible, open by default, count badge = rows, description "Edit an amount or retire a fee." Flush table, see [All fees table](#all-fees-table).
     - **Preview for one student** card, icon receipt-text, description "Exactly what the next round of charges would be." See [Preview](#preview-for-one-student).
- Empty: when the term has no tuition lines, the grid has no rows and the All fees table shows the empty state "No school fees for this term" (icon tags).

### Other fees

- Route `/finance/other-fees`, Finance › Fees › Other fees tab. Gate `feeLine:read`.
- Header: title **Other fees**; description "Fees on top of school fees, grouped by type."; same info tip and the same Term select and **Add a fee** action as School fees.
- **Fee type chips** below the header: a tab list (aria-label "Fee type") with **All other fees** first, then one tab per fee type under Fee income except Tuition (4010) and the hidden "Other charges" (4060), in code order. Selecting a chip filters the grid and the list to that fee type. Beside the chips: **New fee type** (small ghost button, plus icon), gate `feeLine:create`.
- Cards (stacked, no preview):
  1. **Fee grid** card, title `<fee type name>` or `Other fees` (for All other fees) `· <term>`, same description pattern. Columns: **Level**, then one column per fee type in the selection (all non-tuition fee types for All other fees; just the chosen one otherwise). No Typical total. Rows: levels with at least one live line of a shown fee type. Same cell rules as School fees.
  2. **All fees** card, same as School fees but over non-tuition lines (filtered by the chip). Empty state "No other fees for this term".

### All fees table

Used on both screens.

| Column     | Content                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Line       | Fee name; below it, small muted: the level name, plus ` · <fee type>` when the fee type is not Tuition                                                                                                                                  |
| Campus     | Campus badge (map-pin icon) for a campus line; muted "Every campus" otherwise                                                                                                                                                           |
| Applies to | "Everyone", "New students only" or "Returning only"; plus an **Optional** badge when optional                                                                                                                                           |
| Amount     | Naira, right-aligned                                                                                                                                                                                                                    |
| Status     | **Active**, or **Retired** with tip `Retired <date>. Kept for history.`                                                                                                                                                                 |
| (actions)  | Live lines only: icon buttons **Edit amount** (pencil, gate `feeLine:update`) and **Retire line** (archive, gate `feeLine:retire`). On an every-campus line, only for members holding `campus:readAll` (rule 12). None on retired lines |

Rows include retired lines. Sort: level sequence, then fee type code. Paged 10. Only lines visible in the viewer's campus scope are listed.

### Add a fee (sheet)

- Title **New school fee** (School fees) or **New fee** (Other fees). Description `For <term>. It applies from the next round of charges.` The term is the one selected in the header.
- Fields:

| Field        | Control                                                                                                    | Required | Default                                                                                   | Hint                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Level        | select, every class level                                                                                  | yes      | first level (prototype hardcodes JSS 2)                                                   |                                                                       |
| Fee type     | select, every fee type under Fee income except hidden ones (Tuition included)                              | yes      | Tuition on School fees; the selected chip, else the first non-tuition type, on Other fees |                                                                       |
| Name         | text, placeholder "e.g. Excursion to the museum"                                                           | yes      | empty                                                                                     | "Parents see this name on the charge."                                |
| Amount (₦)   | text, decimal keypad, placeholder "15,000"                                                                 | yes      | empty                                                                                     |                                                                       |
| Applies to   | select: Everyone, New students only, Returning only                                                        | yes      | Everyone                                                                                  |                                                                       |
| Campus       | select: "Every campus" (only for members holding `campus:readAll`), then each campus in the viewer's scope | no       | Every campus with `campus:readAll`, else the first campus in scope                        | "A campus line overrides the every-campus line of the same category." |
| Optional fee | checkbox; label **Optional fee**, sub-text "Bus, boarding: billed only to students who opted in."          | no       | unchecked                                                                                 |                                                                       |

- Buttons: **Cancel**, **Add a fee** (primary, plus icon).
- Validation: amount missing, zero or unparseable → "Enter an amount." Name blank → required. Duplicate live line (same term, level, campus and fee type) → 409, message "There is already a <fee type> fee for <level> on <campus or every campus> this term. Change its amount instead." (new copy; [D-040](../technical-reference.md#decision-log)).
- On success: the sheet closes; toast (success) `Added <name>. It applies from the next round of charges.` with action **Charge students** (to Charge students) when the viewer holds `invoice:bill`.

### Change a fee (dialog)

- Opened by **Edit amount**. Title `Change <name>`; description `<level> · <term>`.
- One field **Amount (₦)**, required, prefilled with the current amount in naira; hint "Applies from the next round of charges. Charges already sent keep the old amount."
- Buttons: **Cancel**, **Save amount** (primary).
- Validation: "Enter an amount." for empty, zero or unparseable (the prototype silently does nothing; see gaps).
- Success toast: `<name> is now ₦<amount>. Charges already sent keep the old amount.`, plus " A prepared round still uses the old amount." when a draft round exists for the term ([51](51-charge-students.md#business-rules) rule 13).
- Only the amount changes. Name, level, fee type, campus, applies-to and optional are fixed after creation; to change them, retire the line and add a new one.

### Retire a fee (dialog)

- Opened by **Retire line**. Title `Retire <name>?`; description `<level> · ₦<amount>`.
- Body: "It stops appearing on new charges from the next round." and an info callout "Charges already sent don’t change. The fee itself is kept for history, never deleted."
- Buttons: **Cancel**, **Retire line** (destructive, archive icon, gate `feeLine:retire`).
- Success toast: `<name> retired. It is kept for history.` There is no un-retire.

### New fee type (dialog)

- Opened by **New fee type** on Other fees. Title **New fee type**; description "For example Sports levy or Exam fee. Add the amounts afterwards."
- One field **Name**, required, placeholder "e.g. Sports levy".
- Buttons: **Cancel**, **Add fee type** (primary).
- Creates a ledger account under Fee income (4000): code = highest existing child code + 10, type income, parent 4000. It appears at once as a chip, a grid column on All other fees, and an option in the Fee type select.
- Success toast: `<name> added as a fee type.` Without permission: "You need permission to add categories." (unreachable in the UI because the button is gated).
- The ledger's own **Add category** on Money categories (M3.1, `ledger:manageAccounts`) creates the same kind of row.

### Preview for one student

On School fees only (side column).

- Picker: a search input (search icon, placeholder "Search name, admission no. or class", aria-label "Search students") over the candidates, and a select (aria-label "Preview student") of matches labelled `<name> · <admission no.>`, sorted by label. With a query, a tiny line: `<k> of <n> students match`, or "No student matches that search" (the select is then hidden).
- Candidates: students in finance scope whom charging would include ([51](51-charge-students.md#business-rules) rule 1: an `active` enrolment in the selected term's school year and lifecycle Active). Default: the first candidate (the prototype defaults to Ada Okeke). When the query excludes the selected student, the first match is used.
- Under the picker, badges: class arm for the term (or level when unplaced); campus (map-pin) for the term; **New student** or **Returning student**; and **Already charged** (success, check icon, tip `Charged as <CHG number or "a draft">. Charging again skips this student.`) when the student has a non-cancelled term charge for the term, else **Not billed yet** (warning).
- Table: **Line** (description; badge **Opted in** for an optional line; campus badge with tip "Campus override" for a campus line) and **Amount** (negative amounts muted). Footer row **Total**. Empty: "No fee lines apply".
- The lines are exactly what [51-charge-students](51-charge-students.md) would put on a new charge for this student and term today: the applicable fee lines plus approved discount lines (business rules 6–9 below and rule 51-BR-8).
- When the student has a discount waiting for approval: warning callout `Pending discount not applied yet: <reason>, <reason>. It applies once a boss approves it.`
- Empty: no candidates → empty state "No students in your scope" (users icon).
- The preview reflects the current schedule, even for a student already charged; it is not the sent charge.

### Opt-ins (no screen in the prototype)

The prototype applies optional fees only to students who opted in (seed: Ada, Chidi, Tobi and Femi take the School bus) but has **no screen to opt a student in or out**. M3.2 adds an **Optional fees** card on the student profile's **Fees** tab ([D-024](../technical-reference.md#decision-log)): it lists the optional fee types for the student's level and current term with a switch each, gate `feeLine:update`, toast "`<student first name>` now takes `<fee type>` from the next round of charges." / "... no longer takes ...".

### States (both screens)

- Loading: skeleton grid and table.
- Error: `ErrorMessage` (`role="alert"`) in place of the cards.
- Denied (403): the sub-tab and command-menu actions are hidden; the route's `beforeLoad` redirects (per M1.1). The prototype's demo state "Mr Obi opens School fees without feeLine:read" shows this redirect.
- Not found (404): an id outside campus scope in an edit, retire or preview call answers 404.
- Read-only (acting super admin without a reason): Add a fee, New fee type, Edit amount and Retire line are hidden.

### Entry points elsewhere

- Command menu: **Add a fee we charge** (gate `feeLine:create`) opens School fees with the add sheet open.

## Business rules

1. A fee line belongs to one term, one class level and one fee type (a child of Fee income), and optionally one campus. Amount is a positive integer in minor units.
2. At most one **live** line per (term, level, fee type, campus-or-every-campus). A second one answers 409 ([D-040](../technical-reference.md#decision-log)).
3. Visibility: every-campus lines are visible to anyone with `feeLine:read`; a campus line only to members whose campus scope includes it.
4. Changing an amount or retiring a line never changes a charge already sent or already prepared; invoice lines are copied when a charge is prepared and frozen ([52-charges](52-charges.md) rule 1).
5. Retiring sets `retired_at`. Retired lines are never deleted, never applied to new charges, still listed in All fees and excluded from the grid, Typical total and preview.
6. **Applicable lines** for a student and term (used by preview and by charging):
   1. The student must have an enrolment in the term's school year; its class level selects the lines.
   2. The student's campus is the campus of their placement for that term; with no placement, the student's home campus.
   3. Keep live lines of that term and level whose campus is null or equal to the student's campus.
   4. Drop `applies_to = new` lines when the enrolment is not new, and `applies_to = returning` lines when it is new (`student_enrollment.is_new_student`).
   5. Drop optional lines the student has not opted into (rule 10).
   6. Then, per fee type, keep one line: the campus line if one survived steps 3–5, else the every-campus line. Eligibility filters run **before** the override, so a campus override that doesn't apply to this student lets the every-campus line through.
7. Typical total = sum over live every-campus lines of the level and term that are not optional and not `applies_to = new`, across all fee types.
8. Fee types: Tuition (4010) is "School fees"; every other child of Fee income is "Other fees". "Other charges" (4060) and Refunds owed (2100) are kept in the books but never listed as fee types (data model, Accounts).
9. A new fee type is a `ledger_account` under Fee income with code = highest child code + 10, type income. Allowed with `feeLine:create` (this endpoint) or `ledger:manageAccounts` (the M3.1 endpoint). Names are unique among live fee types, case-insensitive (new).
10. An optional line applies only when the student's enrolment for that school year has an opt-in for the line's fee type ([D-024](../technical-reference.md#decision-log)). Opt-ins carry across the terms of the school year.
11. Only the current and next term (rule in the Term select) can be picked on these screens. Past terms' fees are read-only ([D-040](../technical-reference.md#decision-log)): writes to a term that has ended answer 400 "This term has ended. Fees for it can’t change." (new copy); reads for any term stay available through the API.
12. Adding, changing or retiring an **every-campus** line needs `campus:readAll` as well as the `feeLine:*` permission, because it changes what every campus is charged. The service checks it (403); a campus-scoped bursar adds campus overrides instead.

## Data

Tables (see [data-model-finance.md, Fees and charging](../brainstorming/data-model-finance.md#fees-and-charging)):

- **New `fee_line`** as in the data model, plus:
  - Partial unique index `(organization_id, term_id, class_level_id, ledger_account_id, COALESCE(campus_id, '')) WHERE retired_at IS NULL` (**new constraint**, rule 2).
  - `CHECK (amount_minor > 0)`.
  - `applies_to` as `TEXT CHECK (applies_to IN ('all','new','returning'))`.
  - Composite FK `(campus_id, organization_id)` to `campus`; FKs to `term`, `class_level` and `ledger_account` with `ON DELETE RESTRICT`.
  - A trigger or service check that `ledger_account_id` is a child of the `fee_income` system account.
- **New `student_fee_option`**. **Change from the data model:** key it by `(enrollment_id, ledger_account_id)` (fee type) instead of `fee_line_id`, `UNIQUE (enrollment_id, ledger_account_id)`, plus `created_by`. Reason: fee lines are per term, so an opt-in to a line would lapse every term, and the campus override is a different row from the every-campus line. The prototype keys opt-ins by fee name for the same reason ([D-024](../technical-reference.md#decision-log)).
- `ledger_account` (from M3.1): rows added by New fee type.
- **Drop `fee_schedule`**: its rows have no term, level or fee type, so they can't be migrated.

Migrations: `create_fee_line`, `create_student_fee_option`, `drop_fee_schedule`. Then `pnpm drift:fix`.

Policy (`libs/policy`): replace `feeSchedule` with `feeLine: ['create','read','readOwn','update','retire']`. Grant: owner all; bursar `create, read, update, retire`; administrator `read`; student and guardian `readOwn`. Remove `feeSchedule` from `roles.ts`. The grant is the same for every bursar; the service refuses writes to every-campus lines from members without `campus:readAll` (403, rule 12).

Remove: `apps/api/src/app/modules/fee-schedule`, `contract.feeSchedules` and its schemas, `apps/web-admin/src/pages/fees-page.tsx` and its `/fees` route (replaced by the screens above). The portal's `fees-page.tsx` and `/fees` route are removed in M3.2 and replaced by the portal Fees screen in M3.7.

## API

New module `apps/api/src/app/modules/fee-line`. Contract `contract.feeLines`, `contract.feeTypes` in `@eduvault/api-contract`.

| Method | Path                                          | Permission       | Request                                                                                                  | Response                                                                                                                                         | Errors                                                                                                                                                                                                         |
| ------ | --------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/fee-lines`                                  | `feeLine:read`   | query `termId` (required), `group` (`school` \| `other`), `feeTypeId?`, `includeRetired?` (default true) | `FeeLine[]` (visible lines only)                                                                                                                 | 403; 404 term not in school                                                                                                                                                                                    |
| GET    | `/fee-lines/grid`                             | `feeLine:read`   | query `termId`, `group`, `feeTypeId?`                                                                    | `{ feeTypes, rows: [{ level, cells: [{ feeTypeId, base, overrides[] }], typicalTotalMinor? }] }`                                                 | 403; 404 term                                                                                                                                                                                                  |
| POST   | `/fee-lines`                                  | `feeLine:create` | `{ termId, classLevelId, feeTypeId, campusId \| null, name, amountMinor, appliesTo, isOptional }`        | `FeeLine`                                                                                                                                        | 400 amount ≤ 0, name blank, fee type not under Fee income, term ended; 403 (also an every-campus line without `campus:readAll`); 404 campus out of scope, level or term not in school; 409 duplicate live line |
| PATCH  | `/fee-lines/:id`                              | `feeLine:update` | `{ amountMinor }`                                                                                        | `FeeLine`                                                                                                                                        | 400 amount ≤ 0, term ended; 403 (also an every-campus line without `campus:readAll`); 404 not visible; 409 line retired                                                                                        |
| POST   | `/fee-lines/:id/retire`                       | `feeLine:retire` | none                                                                                                     | `FeeLine`                                                                                                                                        | 403 (also an every-campus line without `campus:readAll`); 404; 409 already retired                                                                                                                             |
| GET    | `/fee-lines/preview`                          | `feeLine:read`   | query `termId`, `studentId`                                                                              | `{ student: { arm, campus, isNew }, charged: { status, number \| null } \| null, lines: PreviewLine[], totalMinor, pendingDiscounts: string[] }` | 403; 404 student not in finance scope or no enrolment in the term's year                                                                                                                                       |
| GET    | `/fee-types`                                  | `feeLine:read`   | none                                                                                                     | `FeeType[]` (`id, code, name`), hidden ones excluded                                                                                             | 403                                                                                                                                                                                                            |
| POST   | `/fee-types`                                  | `feeLine:create` | `{ name }`                                                                                               | `FeeType`                                                                                                                                        | 400 blank; 403; 409 name already used                                                                                                                                                                          |
| GET    | `/students/:studentId/fee-options`            | `feeLine:read`   | query `sessionId?` (default current)                                                                     | `[{ feeTypeId, name, optedIn }]` for optional fee types of the student's level                                                                   | 403; 404 student out of scope                                                                                                                                                                                  |
| PUT    | `/students/:studentId/fee-options/:feeTypeId` | `feeLine:update` | `{ optedIn: boolean, sessionId? }`                                                                       | `{ feeTypeId, optedIn }`                                                                                                                         | 400 fee type has no optional line for the level; 403; 404                                                                                                                                                      |

All writes run in the request's school and campus scope; the student search for the preview reuses the students list endpoint (M2.4) filtered to finance scope.

## Acceptance criteria

1. Given the Lekki bursar, when she opens School fees for First term, then she sees every-campus tuition lines and Lekki overrides, and not Ikeja overrides.
2. Given JSS 2 tuition ₦180,000 every campus and an Ikeja override ₦165,000, when the grid renders, then the JSS 2 Tuition cell shows "₦180,000" and below it "Ikeja ₦165,000".
3. Given JSS 2 has Tuition ₦180,000, PTA ₦10,000, School bus ₦45,000 optional, Development levy ₦25,000 new-only, Excursion ₦8,000 optional, when School fees renders, then JSS 2's Typical total is ₦190,000.
4. Given a live JSS 2 Tuition line on every campus for First term, when someone adds another JSS 2 Tuition line on every campus for First term, then the API answers 409 and nothing is saved.
5. Given a fee line, when the bursar saves a new amount, then the toast reads "<name> is now ₦<amount>. Charges already sent keep the old amount." and every sent or prepared charge keeps its old line amount.
6. Given a retired line, when a charge is prepared, then the line is not on it; and the line still shows in All fees as Retired with no actions.
7. Given a returning Ikeja student and an Ikeja Tuition override marked "New students only", when the preview runs, then the every-campus Tuition applies.
8. Given School bus is optional and Ada opted in, Kelechi did not, when each is previewed, then Ada's lines include School bus with an "Opted in" badge and Kelechi's don't.
9. Given an opt-in to School bus for 2026/2027, when Second term is previewed, then School bus still applies without opting in again.
10. Given Halima has a 50% scholarship waiting for approval, when she is previewed, then the warning reads "Pending discount not applied yet: Academic scholarship, top of JSS 1. It applies once a boss approves it." and no discount line shows.
11. Given the bursar adds the fee type "Sports levy" when the highest Fee income child is 4080, then a ledger account 4090 "Sports levy" (income, parent 4000) exists and appears as a chip.
12. Given a member with `feeLine:read` only, when they open School fees, then Add a fee, New fee type, Edit amount and Retire line are absent, and a direct POST answers 403.
13. Given a teacher without `feeLine:read`, when they navigate to `/finance/school-fees`, then they are redirected and the School fees tab is not shown.
14. Given school A's fee line id, when a school B owner calls PATCH on it, then 404.
15. Given an Ikeja override line, when the Lekki bursar calls PATCH or retire on it, then 404.
16. Given the add form with amount "abc", when submitted, then "Enter an amount." and nothing is saved.
17. Given the Lekki bursar without `campus:readAll`, when she opens Add a fee, then the Campus select doesn't offer "Every campus" and every-campus lines have no Edit amount or Retire line; a direct POST, PATCH or retire on an every-campus line answers 403.
18. Given the current term is Third term, 2026/2027 and First term, 2027/2028 exists, when the Term select opens, then it offers both.

## Tests

- Unit (`nx run api:test`): the applicable-lines function (rule 6, every branch: campus match, override after eligibility, new/returning, optional with and without opt-in, retired); Typical total; fee-type code allocation. (`nx run web-admin:test`): grid cell rendering (base, badges, overrides, "—"); add-form amount parsing ("₦15,000" → 1500000).
- Integration (`api:test-integration`) [tenancy-002] [testing-002]:
  - Isolation for `fee_line` and `student_fee_option`: cross-school 404 on every route; cross-campus 404 for campus lines; every-campus lines visible to a campus-scoped member.
  - 403 for each write without its permission; 403 for acting read-only.
  - Partial unique index: duplicate live line 409; same combination allowed after retiring.
  - `CHECK (amount_minor > 0)`; fee type outside Fee income rejected.
  - Preview equals the lines the M3.3 prepare writes for the same student and term.
- E2E (opt-in, `eduvault-e2e`): bursar adds a Lekki Excursion levy for JSS 2 on Other fees (a Lekki line, rule 12), sees it in the grid and the chip filter, changes its amount, retires it; admin sees the screens read-only; teacher is redirected.

## Open decisions

| #   | Question                                                                                                                                                            | Recommendation                                                                                                                                                                                                                                                                                                                           | Confidence                                                                                 | Decided                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1   | Can there be two live lines with the same term, level, fee type and campus? The prototype allows it, but the grid shows only the first and charging keeps only one. | Partial unique index on live lines; 409 with the copy above. Options: allow and sum them; allow and show all.                                                                                                                                                                                                                            | High: today a duplicate silently disappears from charges.                                  | [D-040](../technical-reference.md#decision-log): unique among live lines; 409    |
| 2   | Can a campus-scoped bursar add, change or retire an every-campus line, which changes what other campuses are charged? The prototype lets Chika (Lekki) do it.       | Restrict every-campus writes to members holding `campus:readAll`, checked in the service (the guard still checks `feeLine:*`); campus-scoped bursars add campus overrides. Option: keep the prototype (any `feeLine:*` holder). Adopting it changes the dev seed's Chika flows and means the starter Bursar can't set every-campus fees. | Medium: protects other campuses, but differs from the prototype's main bursar flow.        | Adopted                                                                          |
| 3   | What does an opt-in point at? The data model says `fee_line_id`; the prototype keys by fee name.                                                                    | `(enrollment_id, ledger_account_id)`: one opt-in per fee type per school year, honoured by the campus override too. Options: per fee line (re-opt every term); per student forever.                                                                                                                                                      | Medium: matches the prototype's behaviour across terms; a per-term opt-out isn't modelled. | [D-024](../technical-reference.md#decision-log): keyed by enrolment and fee type |
| 4   | Where do staff opt a student in or out? The prototype has no control.                                                                                               | Student profile, Fees tab, an "Optional fees" card (gate `feeLine:update`), shipped in M3.2. Options: a step in admission; a bulk list per fee type on Other fees.                                                                                                                                                                       | Medium: per-student is the common case; bulk can follow.                                   | [D-024](../technical-reference.md#decision-log): set on the student's Fees tab   |
| 5   | Does withdrawing a student cancel their opt-ins? (Data model "Still open".)                                                                                         | No; leaving already stops charging. Opt-ins die with the school year.                                                                                                                                                                                                                                                                    | Medium                                                                                     | Adopted                                                                          |
| 6   | Are fee-type names unique?                                                                                                                                          | Yes, case-insensitive among live fee types; 409.                                                                                                                                                                                                                                                                                         | High                                                                                       | Adopted                                                                          |
| 7   | Can past terms' fees be changed or viewed? The term picker offers only current and next.                                                                            | Writes allowed for the current and future terms only; reads for any term via the API, the picker stays current + next.                                                                                                                                                                                                                   | Medium                                                                                     | [D-040](../technical-reference.md#decision-log): past terms' fees are read-only  |
| 8   | What happens to existing `fee_schedule` rows and the portal `/fees` page?                                                                                           | Drop the table (no term, level or type to migrate); remove the portal page until M3.7.                                                                                                                                                                                                                                                   | High: no production data yet.                                                              | Adopted                                                                          |
| 9   | Is there a "Copy fees from last term"? The prototype seeds identical terms, so every term would otherwise be re-keyed line by line.                                 | Add later as a single action on School fees (copy live lines from the previous term into an empty term). Not in M3.2.                                                                                                                                                                                                                    | Medium                                                                                     | Adopted                                                                          |
| 10  | Can name, applies-to, optional or campus be edited after creation?                                                                                                  | No (prototype edits amount only); retire and re-add.                                                                                                                                                                                                                                                                                     | High                                                                                       | Adopted                                                                          |
| 11  | When the next term starts in a new school year (third term now), the picker offers only the current term.                                                           | Offer the first term of the next school year once it exists.                                                                                                                                                                                                                                                                             | Medium                                                                                     | Adopted                                                                          |

## Prototype gaps noticed

- Add sheet defaults are seed hardcodes: Level `jss2`, Other-fees Fee type `4020`; preview defaults to `st-ada`.
- Edit with an empty or zero amount silently does nothing; add shows "Enter an amount." Use the same message for both.
- No duplicate check on fee lines (see #1) and no name check on fee types (see #6).
- Fee-type code allocation (max child + 10) would reach 4500 (Store sales) after 42 new types; the API must refuse a code that collides and pick the next free one.
- The preview's candidates are students with an active enrolment, but charging also skips inactive students; the build uses the same filter as charging so it never shows a student who won't be charged.
- The preview's discount lines use the bare reason; the charge adds "(5% of tuition)". Use the charge's wording in both.
- Charge descriptions strip " (Ikeja)" from the override's name (`.replace(' (Ikeja)', '')`), a seed hack. Invoice line description = the fee line's name as entered; the override in the seed should be named "Tuition".
- Typical total ignores campus overrides, so an Ikeja student's typical total is overstated. Acceptable for a "typical" figure; say so in the tip if confirmed.
- A member with `feeLine:read` but neither `invoice:read` nor `payment:read` has no nav entry, because the Fees nav root is Who owes. Nav root should pass when any child tab passes.
- Opt-ins have no UI (see #4).
- A changed amount doesn't warn that a prepared (unsent) round still uses the old amount; 51 adds the warning (its Open decision #6).

## Dependencies

- M2.1 terms and school years; M2.3 class levels and arms; M2.4 enrolments, placements (`is_new_student`) and the student list.
- M3.1 `ledger_account` with the Fee income system account and its seeded fee types.
- M1.1 policy, guard, nav gating and the 403/404 contract; the Fees sub-tab frame is shared with M3.3 and M3.4.
- The preview's "Already charged" badge reads invoices (M3.3); its discount lines and pending-discount callout read `student_discount`, which M3.3 creates and applies (see [51-charge-students](51-charge-students.md#dependencies)).

# PRD: Staff dashboard

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53` (script lines 1520–1702, helpers 1127–1200)
- Milestone and slice: `M2.6` first cut, then one card or task per later slice (see [Card-to-slice map](#card-to-slice-map)): `M2.7`, `M3.1`, `M3.3`, `M3.4`, `M3.5`, `M3.6`, `M4.1`, `M4.3`, `M4.4`, `M4.5` (see [roadmap](README.md)). The `activity_event` table it reads lands with `M2.4` ([D-016](../technical-reference.md#decision-log))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md) (student lifecycle, class scope, calendar), [data-model-finance.md](../brainstorming/data-model-finance.md#reports-all-derived) (dashboard figures), [data-model-inventory.md](../brainstorming/data-model-inventory.md#reports-all-derived) (store figures, low-stock task), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (scopes), [technical reference](../technical-reference.md) decisions [D-001, D-005, D-006, D-010, D-016, D-017, D-023, D-026, D-029, D-036, D-045](../technical-reference.md#decision-log)

## Summary

The dashboard is the staff home page in `web-admin`. It tells each member what needs them today, where the term stands, and the figures their permissions let them see: money charged, received and owed; the roll; the store; the school's accounts. Teachers who only see their own classes get a separate classroom-first view. Nothing on it is a new record; every figure is derived from other modules, so the page grows as each pillar ships.

## Who uses it

| Persona (seed)                  | Permission(s) that shape the page                                                                                                                                                                                       | What they see                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Owner (Funmi)                   | every permission                                                                                                                                                                                                        | Finance stats, every task, roll with owed column, term, store and school account cards, activity                      |
| Administrator (Tunde)           | `invoice:read`, `payment:read`, `student:read`, `student:archive`, `student:markAway`, `enrollment:place`, `class:assignTeacher`, `class:readAll`, `member:update`, `announcement:update`, `store:read`, `session:read` | Finance stats, roll with owed column, lifecycle, placement, class-teacher, role and draft tasks, term and store cards |
| Bursar (Chika, Lekki)           | `invoice:read`, `invoice:bill`, `payment:read`, `student:read`, `store:read`, `store:receive`, `moneyAccount:read`                                                                                                      | Finance stats for Lekki, charging tasks, low-stock task, roll with owed column, store and school account cards        |
| Principal (Grace, starter role) | `class:readAll`, `invoice:read`, `payment:read`, `adjustment:approve`, `leave:approve`, `announcement:update`, `store:read`, `moneyAccount:read`                                                                        | Finance stats, approvals and draft tasks, roll, term, store and school account cards                                  |
| Teacher (Emeka)                 | `class:read` without `class:readAll`, no `invoice:read` or `payment:read`                                                                                                                                               | Teacher view: my students, my classes, term, next holiday, tasks, announcements                                       |
| Member with no roles (Kemi)     | none                                                                                                                                                                                                                    | "No access yet" state only                                                                                            |
| Super admin acting read-only    | every `:read` and `:readAll`                                                                                                                                                                                            | The full staff view with read data; every task needs a write permission, so no tasks show                             |

Scopes applied: every figure, list and task honours campus scope, and there is no campus filter on the page (OD-70-9); student-based figures for non-finance readers also honour class scope; finance figures are campus-scoped, never class-scoped ([class scope](../brainstorming/data-model-overview.md#class-scope)). The dashboard itself has no 403 and no 404: cards the member can't see are left out.

## Screens

### Dashboard

- Route `/` in `web-admin`; nav section **Overview**, first item, label "Dashboard"; phase F0; gate: signed in with an active school (no permission).
- Breadcrumb: "Overview › Dashboard".

#### Which view renders

Evaluated in this order:

1. The member holds no permission at all → **No access yet** state.
2. The member holds neither `invoice:read` nor `payment:read`, and is class-scoped (`class:read` without `class:readAll`) → **Teacher view**. This applies even when they are assigned no classes yet.
3. Otherwise → **Staff view**.

#### No access yet

- Header title "Welcome, {first name}", description "{school name} · {term name} {session name}" (no comma; see gaps).
- One card with an empty state: icon key, title "No access yet", text "You’re on the staff list, but you can’t see anything until the owner gives you a role. This page fills in once they do.", button "See my access" which opens the **My access** sheet ([10-app-shell-and-navigation](10-app-shell-and-navigation.md), M1.1).

#### Staff view

- Header title "{greeting}, {first name}" where greeting is "Good morning" before 12:00, "Good afternoon" before 17:00, otherwise "Good evening", in Africa/Lagos time through the shared time helper ([D-023](../technical-reference.md#decision-log)). Description "{school name} · {term name}, {session name}". No header actions.
- **Stat row** (each stat is a link):
  - When the member holds `invoice:read` or `payment:read`, up to three stats: "Charged this term" needs `invoice:read`, "Received" needs `payment:read`, and "Still owed" needs either:

    | Label             | Value                                                           | Sub-line           | Opens                          |
    | ----------------- | --------------------------------------------------------------- | ------------------ | ------------------------------ |
    | Charged this term | sum of sent charges for the current term, store sales excluded  | "{n} charges sent" | Charges (`/finance/invoices`)  |
    | Received          | sum of recorded payments in the term, store sales excluded (R8) | "{n} payments"     | Payments (`/finance/payments`) |
    | Still owed        | sum of positive student balances, store sales excluded (R9)     | "{n} students owe" | Who owes (`/finance/accounts`) |

  - Otherwise, when the member holds `student:read`, one stat: label "Students", value = active students in scope, sub-line "Across all campuses" (campus scope all) or "{campus names} campus". Opens Students.
  - Otherwise no stat row.
- **Two columns** (stacked on phones): left two-thirds, right one-third. Cards render only when their rule passes; order is fixed.
  - Left: **Needs you today**, **Students and what they owe** / **Students by status**.
  - Right: **My classes** (staff variant), **Term**, **Store**, **School account**.
- **Recent activity** card spanning the page, collapsed by default.

#### Teacher view

- Same header as the staff view.
- **Stat row**, four stats:

  | Label        | Value                                          | Sub-line                                                                     | Opens    |
  | ------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
  | My students  | active students placed in my classes this term | "Across {n} class(es)"                                                       | Students |
  | My classes   | number of arms in class scope                  | "{n} as class teacher"                                                       | Classes  |
  | This term    | "Week {w}"                                     | "of {weeks} · ends {term end date}", with a progress bar of school days done | —        |
  | Next holiday | "Today", "Tomorrow", "{n} days" or "—"         | "{name} · {start date}" or "None this term"                                  | —        |

- Left column: **My classes** (teacher variant), **Upcoming holidays**.
- Right column: **Needs you today** when there is at least one task; otherwise a success callout "**All caught up.** Nothing needs you today." Then **Announcements**.
- **Recent activity** card, collapsed by default.

#### Card: Needs you today

- Icon list-checks; count badge with the number of tasks (hidden when zero). Each task is a full-width row: tone icon, bold title, muted sub-line, and a small button with the label and an arrow. The whole row opens the target.
- Empty state: icon check-check (success tone), title "All caught up", text "Nothing needs you right now. New requests and reminders show up here."
- Tasks, in this order. Each appears only when its permission is held and its count is above zero. Counts use the member's scopes.

| #   | Permission                                                                    | Title (as written)                                                                      | Sub-line                                                              | Button → target                                                               | Tone    | Slice                      |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------- | -------------------------- |
| T1  | an approval permission the item needs (`adjustment:approve`, `leave:approve`) | "{n} request(s) waiting for your approval"                                              | first two items as "{kind}: {title}" joined by " · "                  | "Review" → Approvals                                                          | warn    | M3.5 (leave items M3.6)    |
| T2  | `invoice:bill`                                                                | "Charges prepared for {term name, session}, not sent yet" (one task per prepared round) | "{n} students · {total}. Check them, then send."                      | "Check and send" → that charge round                                          | warn    | M3.3                       |
| T3  | `invoice:bill`                                                                | "{n} student(s) not charged for {term name, lower case} yet"                            | first three names, then " and {k} more"                               | "Charge students" → Charge students                                           | default | M3.3                       |
| T4  | `student:archive`                                                             | "{n} student(s) due to be marked Left"                                                  | "Away for over a term: {names}"                                       | "Review" → Students, Inactive tab                                             | danger  | M2.6 (rule from M2.5)      |
| T5  | `student:markAway`                                                            | "{n} student(s) not seen in school recently"                                            | "{name} (since {date})", comma-separated                              | "Open" → the student if one, else Students                                    | default | M2.6                       |
| T6  | `enrollment:place`                                                            | "{n} student(s) not in a class"                                                         | names                                                                 | "Open" → the student if one, else Students; "Start {year}" in the case of R15 | default | M2.6 ("Start {year}" M2.5) |
| T7  | `class:assignTeacher`                                                         | "{n} class(es) without a class teacher"                                                 | class names                                                           | "Assign" → the class if one, else Classes                                     | default | M2.6                       |
| T8  | `store:receive`                                                               | "{n} store item(s) running low"                                                         | first three item names, then " and {k} more"                          | "Store" → Store                                                               | default | M4.3                       |
| T9  | `member:update`                                                               | "{name} has no role yet" (one task per member)                                          | "They can sign in but can’t see anything until you give them a role." | "Give a role" → that member                                                   | default | M2.6 (data from M1.3)      |
| T10 | `announcement:update`                                                         | "{n} announcement draft(s) not published"                                               | draft titles, comma-separated                                         | "Open" → Announcements                                                        | default | M2.7                       |

Definitions behind each count are in [Business rules](#business-rules) R10–R19.

#### Card: Students and what they owe / Students by status (roll)

- Shown when the member holds `student:read` and is not class-scoped.
- Title "Students and what they owe" when the member holds `invoice:read` or `payment:read`, otherwise "Students by status". Icon graduation-cap. Action "Students" → Students.
- Description: finance reader "New intakes are part of Active. Nobody is deleted, so balances stay counted."; otherwise "New intakes are part of Active."
- Table columns: Status (label in bold, muted sub-line), Students (number), Owed (number, finance readers only; "—" when zero). Each row opens Students on that tab.

  | Row                      | Sub-line                                                                       |
  | ------------------------ | ------------------------------------------------------------------------------ |
  | Active                   | "On the roll and billed"                                                       |
  | ↳ New intakes (indented) | "Admitted in {session name}"                                                   |
  | Inactive                 | "{n} due to be marked Left"                                                    |
  | Left                     | "{n} this term" (left with `archived_at` on or after the current term's start) |
  | Graduated                | "Finished the final class"                                                     |

- Footer note for finance readers when former students owe: "{amount} of what is owed is from students no longer at the school."
- Owed per row is the sum of positive balances only.

#### Card: My classes (staff variant)

- Shown only in the staff view for a member who is class-scoped and also a finance reader (a teacher who is also a bursar). Icon school.
- One row per arm in class scope: arm name; "{n} student(s) · You are the class teacher" or "{n} student(s) · You teach a subject"; chevron. Row opens the class.

#### Card: My classes (teacher variant)

- Icon school; count badge; action "All classes" → Classes.
- One row per arm in class scope: arm name in bold, badge "Class teacher" (brand) when the member is a class teacher of it this session, one outline badge per subject the member teaches in it this term (M4.1); sub-line "{n} student(s) · {campus} campus"; up to five student avatars and "+{k}" (desktop only); chevron. Row opens the class.
- Empty state: icon school, "No classes yet", "Classes you teach show up here."

#### Card: Term

- Title "{term name} · {session short name}", for example "First term · 26/27". Icon calendar-days. Action "Calendar" → Calendar, only with `session:read`.
- Body: "Week {w}" with "of {weeks}" in small type; "{done} of {total} school days"; progress bar; term start date at left, end date at right.
- Below a divider, a scrolling list of upcoming holidays and breaks (all of them), the first highlighted as next. Each row: a date chip (month abbreviation, day), the name in bold, a sub-line, and a relative time.
  - Holiday sub-line: "{Dow} – {Dow} · {n} days off" for a run of days, "{Dow} · 1 day off" for one day.
  - Break sub-line: "Resumes {date}".
  - Relative time: "Today", "Tomorrow", "in {n} days" (under 14 days), "in {n} weeks" (under 70 days, rounded), otherwise "in {n} months" (days / 30, rounded).

#### Card: Upcoming holidays (teacher view)

- Icon calendar; action "Calendar" → Calendar when the member can open it (`session:read`).
- The same scrolling list as the Term card but with the portal's sub-line copy: break "School resumes {date}", holiday "{Dow} – {Dow} · no school" (or "{Dow} · no school"). Empty state "No holidays ahead".

#### Card: Store

- Shown with `store:read`. Title "Store", icon store, action "Store" → Store. Content and the Show costs masking of profit and stock value are owned by [61-store](61-store.md) ("Dashboard surfaces", STO-12). These figures are the only place store sales count on the dashboard ([D-026](../technical-reference.md#decision-log)).
- Four tiles:

  | Tile             | Value                                             | Sub-line              |
  | ---------------- | ------------------------------------------------- | --------------------- |
  | Sold this term   | sum of store sales this term on campuses in scope | "{n} students served" |
  | Profit this term | sales minus cost                                  | "Sales minus cost"    |
  | Items sold       | sum of quantities sold this term                  | "This term"           |
  | Stock value      | stock on hand × cost price on campuses in scope   | "At cost price"       |

#### Card: School account

- Shown with `moneyAccount:read`. Title "School account", icon landmark. Action "Accounts" → Money accounts when the member can open it.
- Big figure: total balance of the money accounts the member can see. A campus-scoped member doesn't see school-wide accounts here ([D-045](../technical-reference.md#decision-log)). Under it "Everything received so far", or "In the accounts you can see" when some accounts are hidden.
- Divider, then one row per visible account: kind icon (bank, cash, POS), name, sub-line "{campus}" or "Whole school", plus " · ending {last4}" when known, balance on the right. When none: "No accounts to show."
- Footer when hidden: "{n} school-wide account(s) not shown for your campus."

#### Card: Announcements (teacher view)

- Icon bell; action "All" → Announcements, only when the member can open that page (`announcement:read`). The card itself needs no permission: it reads the feed open to any member ([71-announcements](71-announcements.md) R15).
- Up to four published announcements the member's campus scope can see, pinned first, then newest first. Row: bell icon (warn tone when pinned), title, sub-line "{date} · {tag}" plus " · Pinned" when pinned. Not expandable.
- Empty state: "No announcements".

#### Card: Recent activity

- Collapsible, closed by default; title "Recent activity", icon history, count badge.
- Rows are filtered by campus scope and by a read permission per pillar (R26). Each row: time (monospace), one pillar badge (Foundation, Finance, Access, Platform, with icons), and the sentence, for example "Announcement “PTA meeting” published by Tunde Bakare." Ten rows per page with the shared pager ("Showing 1 to 10 of {n}", Previous, numbers, Next).
- Empty state: "No activity yet".

#### States

- Loading: each card shows its own skeleton; the header renders at once.
- Error: a failing card shows `ErrorMessage` inside the card; the rest of the page still renders.
- No current term ([D-017](../technical-reference.md#decision-log), the rule M2.1 defines in [30-school-years-and-terms](30-school-years-and-terms.md)): the stat row, Term card, roll card and term-based tasks (T2, T3, T6) are replaced by one set-up callout. Holders of `session:create` see "Create the first school year" with a button to School years and terms; everyone else sees "Your school hasn’t set up its school year yet". The tasks card and Recent activity still render. The teacher view shows the same callout in place of its stats and holidays card.
- Acting super admin, read-only: the page renders with read data. The header name is the super admin's own first name. Task buttons still navigate; writes on the target pages stay locked by the acting banner.

#### Copy that matters

Quoted above. Plurals follow the prototype: "student"/"students", "class"/"classes", "request"/"requests", "draft"/"drafts", "item"/"items", "account"/"accounts".

## Business rules

Calendar and term

1. **R1** The current term is the school's one term marked current. All "this term" figures use it.
2. **R2** School days are the term's weekdays minus its holidays. "Done" counts school days from the term start up to and including today, capped at the term end.
3. **R3** Week = ceil(done / 5), floored at 1, in both views; weeks = ceil(total / 5). Weeks count school days in fives, so a holiday shifts later weeks (OD-70-8).
4. **R4** Upcoming holidays and breaks are the derived "days off" list of [30-school-years-and-terms](30-school-years-and-terms.md#derived-days-off-used-by-other-screens): holidays from today, same-name days at most 3 days apart merged.
5. **R5** Breaks between terms (across years) come from the same list, with "resumes" = the next term's start; names per that PRD (OD-30-6).
6. **R6** Next holiday = the first entry of R4 and R5 combined.

Finance figures (campus-scoped, never class-scoped)

7. **R7** "Charged this term" = sum of sent (not prepared, not cancelled) term charges for the current term whose student is in campus scope; count = number of those charges. Store-sale charges are excluded ([D-026](../technical-reference.md#decision-log)).
8. **R8** "Received" = sum of recorded payments (including those with a cancellation waiting) dated on or after the earlier of the term start and the first sent charge for the term, and on or before the term end, and visible to the member (a payment is visible when any student it is allocated to is in campus scope). Store-sale payments are excluded ([D-026](../technical-reference.md#decision-log)).
9. **R9** "Still owed" = sum of positive balances of students in campus scope, leaving out store-sale charges and their payments ([D-026](../technical-reference.md#decision-log)); count = students with a positive balance. Balances are derived from the journal, never stored.

Tasks

10. **R10 (T1)** Approval items waiting, in campus scope (items without a campus are visible to every approver), that the member may approve and did not create. The member's own requests are never counted ([D-036](../technical-reference.md#decision-log)).
11. **R11 (T2)** One task per charge round still prepared (draft) in campus scope.
12. **R12 (T3)** Active students in campus scope with an enrolment for the current session and no sent or prepared term charge for the current term (cancelled charges don't count).
13. **R13 (T4)** Inactive students whose "due to be marked Left" date has passed: not seen since + 35 days + 98 days ≤ today ([student lifecycle](../brainstorming/data-model-overview.md#student-lifecycle)).
14. **R14 (T5)** Active students with a "not seen since" date (not yet inactive).
15. **R15 (T6)** Active students with no placement in the current term. When any of them has no enrolment in the current school year and the "Start new school year" action in [40-students](40-students.md#start-new-school-year-dialog) is offered, the button reads "Start {year}" and opens Students with that dialog open (gate `enrollment:place`, [D-029](../technical-reference.md#decision-log)). Otherwise the button is "Open".
16. **R16 (T7)** Arms not archived, on a campus in scope, with at least one student placed this term and no class teacher for the current session.
17. **R17 (T8)** Store items whose stock state is low or out on the campuses in scope ([inventory](../brainstorming/data-model-inventory.md#items-and-stores)).
18. **R18 (T9)** One task per member whose only role is `member`, limited to members on a campus in scope (see gaps).
19. **R19 (T10)** Announcement drafts whose audience is in campus scope (everyone, or a campus in scope).
20. **R20** Student-based counts for a member without a finance permission use the visible student set: campus scope, then class scope when it binds. Tasks T4–T6 use the same set.

Cards and views

21. **R21** View selection follows [Which view renders](#which-view-renders); a card is omitted, not disabled, when its permission is missing.
22. **R22** The roll card's groups are mutually exclusive except "New intakes", which is a subset of Active (active students whose current enrolment is marked new).
23. **R23** Store figures count sales dated within the current term on campuses in scope; profit = sales − frozen cost of the lines sold.
24. **R24** School account total = sum of balances of money accounts the member can see. Without `campus:readAll`, school-wide accounts (null campus) are hidden and counted in the footer ([D-045](../technical-reference.md#decision-log)).
25. **R25** Teacher "My students" = active students placed this term in arms of the member's class scope.
26. **R26** Recent activity shows `activity_event` rows newest first ([D-016](../technical-reference.md#decision-log)). A row shows when its campus is in the member's campus scope (null campus = school-wide, shown to all) and the member holds its pillar's read permission: finance events need `invoice:read` or `payment:read`, access events need `member:read`, foundation events need the read permission of their subject (for example `student:read`), and platform events show to every member. Student events also honour class scope (R20). The count is the filtered total.

## Data

No table of its own except the activity log. Reads:

- Calendar: `academic_session`, `term`, `holiday` ([overview](../brainstorming/data-model-overview.md#foundation-model)).
- Roll and tasks: `student`, `student_enrollment`, `enrollment_placement`, `class_arm`, `class_teacher`, `subject_teacher`, `member`.
- Finance: `invoice`, `billing_run`, `payment`, `payment_allocation`, `journal_line`, `money_account` ([finance](../brainstorming/data-model-finance.md#model)).
- Store: `item`, `stock_movement`, `store_sale`, `store_sale_line` ([inventory](../brainstorming/data-model-inventory.md#store-model-f2)).
- Announcements: `announcement`.

**New table (not in the data-model docs):** `activity_event` for Recent activity, the same feed [40-students](40-students.md) STU-10 writes to. Proposed columns: `id`, `organization_id`, `campus_id` (nullable = school-wide), `pillar` (foundation, finance, access, platform), `kind` (for example `announcement.published`), `actor_user_id`, `subject_type` and `subject_id` (so a student's record can show its own entries), `text` (the sentence as written at the time, so later renames don't rewrite history), `data` (JSONB with the ids and amounts behind it), `occurred_at`. Append-only, never updated or deleted. Written in the same transaction as the change it records. Indexes `(organization_id, occurred_at DESC)` and `(organization_id, subject_type, subject_id)`. Named to avoid confusion with the platform `audit_log` (permissions doc phase 3). The migration lands with M2.4, whose lifecycle and admission actions write the first rows ([D-016](../technical-reference.md#decision-log)); M2.6 adds the read endpoint and the card, and each later slice adds its own `kind` values.

Indexes the summary queries need (added by the owning slices): `student (organization_id, not_seen_since)`, `invoice (organization_id, term_id, status)`, `payment (organization_id, received_on)`.

## API

All under the `dashboard` module unless noted. "Member of the active school" routes use `@OrganizationAuth()` with no permission, as [30-school-years-and-terms](30-school-years-and-terms.md) and [22-staff-leave](22-staff-leave.md) do. Every endpoint filters by `ctx.organizationId` and the scopes.

| Method | Path                    | Permission                                                                                       | Request | Response                                                                                                                                                                                                      | Errors |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| GET    | `/dashboard/tasks`      | member of active school                                                                          | —       | `[{ kind, count, title, subtitle, target: {route, params}, action, tone }]`, computed only for held permissions                                                                                               | —      |
| GET    | `/dashboard/roll`       | `student:read`                                                                                   | —       | `{ groups: [{key, count, owedMinor?}], dueLeft, leftThisTerm, formerOwedMinor? }`; owed fields only with `invoice:read` or `payment:read`                                                                     | 403    |
| GET    | `/dashboard/finance`    | `invoice:read` or `payment:read` (any-of guard, [D-012](../technical-reference.md#decision-log)) | —       | `{ chargedMinor?, chargeCount?, receivedMinor?, paymentCount?, owedMinor, owingStudents, currency }`: `charged*` only with `invoice:read`, `received*` only with `payment:read`; store sales excluded (D-026) | 403    |
| GET    | `/dashboard/my-classes` | `class:read`                                                                                     | —       | `[{ armId, name, campusName, studentCount, isClassTeacher, subjects: [name], sampleStudents: [{id, name}] }]`                                                                                                 | 403    |
| GET    | `/dashboard/store`      | `store:read`                                                                                     | —       | `{ soldMinor, salesCount, profitMinor, itemsSold, stockValueMinor }`                                                                                                                                          | 403    |
| GET    | `/dashboard/money`      | `moneyAccount:read`                                                                              | —       | `{ totalMinor, accounts: [{id, name, kind, campusName?, last4?, balanceMinor}], hiddenSchoolWide }`                                                                                                           | 403    |
| GET    | `/activity`             | member of active school                                                                          | `?page` | `{ items: [{occurredAt, pillar, text}], total }`, filtered per R26                                                                                                                                            | —      |

- The Term card, the teacher "This term" and "Next holiday" stats and the Upcoming holidays card read `GET /calendar/current` and `GET /calendar/days-off?limit=200` from [30-school-years-and-terms](30-school-years-and-terms.md#api); week numbers are computed from `schoolDays` and `schoolDaysSoFar`.
- The staff stat "Students" reuses `GET /dashboard/roll` (Active count).
- The teacher Announcements card uses `GET /announcements/feed` from [71-announcements](71-announcements.md).
- Contract types live in `@eduvault/api-contract` under `dashboard.*` and `activity.*`. Money fields are `*Minor` integers with the school currency.

## Acceptance criteria

1. Given Kemi holds only `member`, when she opens `/`, then she sees "Welcome, Kemi", the "No access yet" card and a "See my access" button, and no other card.
2. Given Emeka holds `class:read` without `class:readAll` and no finance read, when he opens `/`, then he sees the teacher view with four stats, My classes listing JSS 3 Gold with a "Class teacher" badge, and Upcoming holidays.
3. Given a teacher with `class:read` and no assigned arms, when they open `/`, then the teacher view shows "My classes 0" and the empty state "No classes yet".
4. Given Chika (bursar, Lekki), when she opens `/`, then Charged, Received and Still owed count only Lekki students and payments allocated to them, and no Ikeja student is counted.
5. Given a prepared charge round for First term, when a member with `invoice:bill` opens `/`, then the task "Charges prepared for First term, 2026/2027, not sent yet" shows and "Check and send" opens that round.
6. Given today is 7 Oct 2026, Kunle (Ikeja) not seen since 22 May 2026 (due to be marked Left on 2 Oct) and Uche (Lekki) not seen since 10 Jul 2026 (due on 20 Nov), when a member with `student:archive` on both campuses opens `/`, then "1 student due to be marked Left" shows with "Away for over a term: Kunle Ogun", and Uche is not counted until 20 Nov 2026.
7. Given Musa is active and not seen since 21 Sep 2026 (under 35 days), when a Lekki member with `student:markAway` opens `/`, then "1 student not seen in school recently" shows with "Musa Garba (since 21 Sep 2026)", and "Open" goes to Musa's page. Inactive students (Uche) are not in this count.
8. Given JSS 2 Emerald (Ikeja) has placed students and no class teacher this session, when an Ikeja-scoped member with `class:assignTeacher` opens `/`, then JSS 2 Emerald is listed in "{n} classes without a class teacher"; a Lekki-only member's task never lists it. A class teacher from last session (JSS 1 Gold) does not count for this session.
9. Given Kemi has no role, when a member with `member:update` on her campus opens `/`, then "Kemi Lawson has no role yet" shows with "Give a role".
10. Given a member who created an approval item and holds `adjustment:approve`, when they open `/`, then that item is not counted in T1.
11. Given a member with `student:read`, without finance read, when they open `/`, then the roll card title is "Students by status" and has no Owed column.
12. Given a student who left this term still owes money, when a finance reader opens `/`, then the roll's Left row shows "1 this term" and the footer note names the amount owed by former students.
13. Given the holidays 29 and 30 Oct named "Mid-term break", when the Term card renders, then they show as one entry "Thu – Fri · 2 days off".
14. Given today is the term's first school day, when the Term card renders, then it shows "Week 1".
15. Given a Lekki-only bursar with `moneyAccount:read` and one school-wide account, when they open `/`, then the School account card hides it, says "In the accounts you can see" and "1 school-wide account not shown for your campus."
16. Given a member without `store:read`, when they open `/`, then no Store card renders, and `GET /dashboard/store` answers 403.
17. Given school A's data, when a member of school B calls any `/dashboard/*` route, then no figure includes school A rows.
18. Given a super admin acting read-only, when they open `/`, then the page renders with read data and no write action succeeds from it.
19. Given First term 2027/2028 was made current before the "Start new school year" action ran, so 312 active students have no 2027/2028 enrolment, when a member with `enrollment:place` opens `/`, then T6 reads "312 students not in a class" with the button "Start 2027/2028", which opens Students with the Start 2027/2028 dialog open.
20. Given a school with no current term, when a member with `session:create` opens `/`, then the stat row, Term card and roll card are replaced by "Create the first school year"; a member without it sees "Your school hasn’t set up its school year yet".
21. Given a store sale of ₦12,000 paid this term, when a finance reader opens `/`, then Charged, Received and Still owed don't include it, and the Store card's "Sold this term" does.
22. Given a payment dated after the current term's end, then "Received" doesn't include it.
23. Given a teacher without `invoice:read` or `payment:read`, when a charge round is sent, then no finance event appears in their Recent activity.

## Tests

- Unit (`nx run api:test`): task builders per permission; view selection. (`nx run web-admin:test` and `libs/ui`): week numbering from school days and the relative-time buckets. Holiday merging and break naming are tested in M2.1. (`nx run web-admin:test`): view selection from a fake permission map; each card hidden without its permission; plural copy.
- Integration (`api:test-integration`):
  - Isolation for every `/dashboard/*` route and `/activity`: a second school's rows never count; a second campus's rows don't count for a campus-scoped member [tenancy-002].
  - `activity_event` isolation: cross-school and cross-campus rows are not returned.
  - 403 for `/dashboard/roll`, `/finance`, `/my-classes`, `/store`, `/money` without the permission; `/dashboard/tasks` returns an empty list for a member with no roles.
  - Finance totals against real journal rows: charged, received and owed match the Who owes report for the same scope [testing-002].
  - T1 excludes the member's own requests.
  - Recent activity: finance events hidden from a member without finance read; another campus's events hidden from a campus-scoped member.
  - `/dashboard/finance` returns `charged*` only with `invoice:read` and `received*` only with `payment:read`; store sales and payments after the term end are excluded.
- E2E (required, `eduvault-e2e`): sign in as owner, teacher, bursar and a no-role member and screenshot `/`; follow one task from each persona to its target page.

## Open decisions

| #       | Question                                                                                                                              | Options                                                                                                                                                                                                                                                                                              | Recommendation                                                                                                                                  | Confidence                                                                                         | Decided                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| OD-70-1 | How is Recent activity stored and who sees which events? The prototype keeps an in-memory list and shows every event to every member. | (a) new append-only `activity_event` table, filtered by campus scope and by a read permission per pillar (finance events only to `invoice:read`/`payment:read` holders, access events to `member:read`); (b) derive from `created_at`/`updated_at` across tables; (c) leave the card out until later | (a), shipped in M2.6 with the foundation kinds; each slice adds its kinds                                                                       | Medium: (b) can't show withdrawals or role changes; unfiltered events would leak money to teachers | [D-016](../technical-reference.md#decision-log): `activity_event`, filtered by campus and pillar permission, lands with M2.4 |
| OD-70-2 | One aggregate endpoint or one per card?                                                                                               | (a) one `GET /dashboard` computing visible sections; (b) per-card endpoints as above                                                                                                                                                                                                                 | (b): each slice adds its endpoint and isolation test without touching the others, and each card fails on its own                                | Medium: (a) is one round trip but every slice edits the same service                               | Adopted                                                                                                                      |
| OD-70-3 | Finance stats gate: shown with `invoice:read` **or** `payment:read`, but "Charged" needs invoices and "Received" payments.            | (a) one endpoint needing either, returning only the parts the member may see; (b) split into two stats endpoints                                                                                                                                                                                     | (a), returning `charged*` only with `invoice:read` and `received*` only with `payment:read`; "Still owed" with either                           | Medium: keeps the row but stops a payment-only role seeing charges                                 | Adopted                                                                                                                      |
| OD-70-4 | "Received" has a start but no end date, so it creeps past the term end.                                                               | (a) cap at the term end; (b) keep open-ended                                                                                                                                                                                                                                                         | (a) cap at the term end date                                                                                                                    | High: "this term" in every other figure means the term's dates                                     | Adopted                                                                                                                      |
| OD-70-5 | Does "Received" include store-sale payments? The prototype's payments list includes them.                                             | (a) include; (b) exclude, since the store card reports sales                                                                                                                                                                                                                                         | (b) exclude store payments from "Received"                                                                                                      | Medium: the stat sits beside "Charged this term", which is school fees                             | [D-026](../technical-reference.md#decision-log): Charged, Received and Still owed exclude store sales                        |
| OD-70-6 | What renders when the school has no current term?                                                                                     | See OD-30-2 in [30-school-years-and-terms](30-school-years-and-terms.md)                                                                                                                                                                                                                             | Follow OD-30-2: the stat row, Term card, roll and term-based tasks are replaced by its set-up callout; the tasks card and activity still render | High: one rule for every term-bound screen                                                         | [D-017](../technical-reference.md#decision-log): follows OD-30-2; M2.1 defines the no-current-term state                     |
| OD-70-7 | Who sees the teacher Announcements card? The `teacher` role has no `announcement:read`.                                               | (a) any member can read published announcements in campus scope through a feed endpoint; (b) require `announcement:read`                                                                                                                                                                             | (a), the same feed as the portal                                                                                                                | Medium: announcements are public to families already                                               | Adopted                                                                                                                      |
| OD-70-8 | Week numbering counts school days in fives, so a week with a holiday shifts later weeks.                                              | (a) keep, as the M2.1 PRD's example ("Week 5 of 14") does; (b) calendar weeks since the term start                                                                                                                                                                                                   | (a), floored at 1                                                                                                                               | Medium: matches M2.1; revisit if schools find the numbers odd                                      | Adopted                                                                                                                      |
| OD-70-9 | Should the dashboard show a campus filter for members who see several campuses?                                                       | (a) no, totals cover the scope; (b) a campus switch                                                                                                                                                                                                                                                  | (a) for M2.6                                                                                                                                    | Medium: the prototype has none; the shell's campus menu is navigation only                         | Adopted                                                                                                                      |

## Prototype gaps noticed

- The super admin's name is hardcoded as "Jude".
- The greeting uses the browser clock; the build uses Africa/Lagos (D-023).
- No-access header drops the comma ("{term} {session}") that the other headers use.
- The staff Term card can show "Week 0" on the term's first day; the teacher view floors at 1.
- The "My students" label in the staff-view stat is unreachable: a class-scoped non-finance member always gets the teacher view.
- "Still owed" uses the visible student set (class scope included) while "Charged" uses the finance set (campus only). Both should use campus scope (R9).
- Store tile "{n} students served" counts sales, not distinct students.
- The Store card shows profit and stock value regardless of the store's "Show costs" switch; [61-store](61-store.md) STO-12 masks them.
- School account footer says "school-wide" but counts every hidden account, including other campuses' accounts.
- T9 lists every role-less member in the school, ignoring campus scope.
- Recent activity shows every event to everyone, including finance events to teachers, and its count is the whole log (fixed by R26).
- The pin action on announcements writes no activity event, while publish and withdraw do.
- The teacher Announcements card filters only by campus scope, with no permission.
- No loading, error or "no current term" states exist in the prototype (D-017).

## Dependencies

- M1.1 (permission list, guard, `/me/permissions`, nav gating, My access sheet) and `@OrganizationAuth()` with no permission.
- M2.1 calendar and the no-current-term state, M2.3 classes and class teachers, M2.4 students, placements and `activity_event`, M2.5 lifecycle rules and the "Start new school year" action (for M2.6).
- Each later card depends on its slice; see the map below.

### Card-to-slice map

| Card or task                                                        | Slice that adds it                                       | Notes                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Header, greeting, No access yet                                     | M2.6                                                     |                                                                                             |
| Staff view layout, Term card, Upcoming holidays (teacher)           | M2.6                                                     | Needs M2.1                                                                                  |
| "Students" stat, roll card without Owed                             | M2.6                                                     | Needs M2.4, M2.5                                                                            |
| Teacher view, My classes (both variants) with "Class teacher" badge | M2.6                                                     | Needs M2.3                                                                                  |
| Tasks T4, T5, T6, T7, T9                                            | M2.6                                                     | T6's "Start {year}" button needs M2.5's action                                              |
| Recent activity card and `/activity`                                | M2.6                                                     | `activity_event` itself lands with M2.4 (D-016); each later slice registers its event kinds |
| School account card                                                 | M3.1                                                     |                                                                                             |
| Tasks T2, T3; "Charged this term" stat                              | M3.3                                                     | Stat row first appears here                                                                 |
| "Received", "Still owed", roll Owed column and footer               | M3.4                                                     |                                                                                             |
| Task T1 (corrections, cancellations, store write-offs)              | M3.5                                                     | Store write-off items join at M4.5                                                          |
| Task T1 leave items                                                 | M3.6                                                     |                                                                                             |
| Task T10, teacher Announcements card                                | M2.7                                                     |                                                                                             |
| Subject badges on teacher class rows                                | M4.1                                                     |                                                                                             |
| Store card, task T8                                                 | M4.3 (stock value, T8), M4.4 (sales, profit, items sold) |                                                                                             |

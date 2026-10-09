# Data model: overview

- Status: brainstorm (not yet an ADR)
- Date: 2026-10-09
- Source of truth: the Eduvault brand prototype (claude.ai artifact `1hsDyr1KdUaYD2hnuA9sfY`). Where this doc and the prototype disagreed, the prototype won; where the prototype is silent, the earlier design is kept and marked as a later phase.
- Pillar docs: [finance](data-model-finance.md), [grading](data-model-grading.md), [inventory](data-model-inventory.md)
- Amends, once accepted: [permissions-and-custom-roles.md](permissions-and-custom-roles.md) (permission list including `team:read` and `student:markAway`/`archive`, class model, phases 4a/4b, and its note that admission numbers share one sequence across schools: they are now per school); [ADR 0005](../adr/0005-tenancy.md) (`fee_schedule` replaced by `fee_line`)

## Goal

Describe what Eduvault holds for its pillars (financial recording, the campus store, student grading and wider inventory) and the shared foundation they stand on. This is the target model; delivery is phased (see [Phases](#phases)).

## How the pillars fit together: one term in Ada's life

1. **Foundation.** 2026/2027 is a _school year_ (session) with three _terms_. Ada Okeke (GF-0123) has one _enrolment_ for the year (level JSS 2) and a _placement_ each term (JSS 2 Gold, Lekki campus). If she moves to Ikeja for second term, first term's records still say Gold, Lekki. Her mother, Ngozi Okeke, is a _guardian_ linked to Ada and two siblings, with her own portal login, and is ticked as the guardian who pays fees.
2. **Finance.** The bursar runs **Charge students** for first term. Fee lines for JSS 2 (tuition, PTA fee, the bus if opted in) become Ada's charge, with her 5% sibling discount as a negative line. Running it twice never charges twice. Ngozi pays ₦300,000 by transfer for all three children: one receipt, one journal entry, split across them (Ada's share ₦180,000), with the proof of transfer attached. Ada's balance is the sum of her journal lines, never a stored number. Cancelling a payment, reducing a fee, cancelling a balance or a refund waits for a second person, unless the school has switched that approval off.
3. **Store.** Ada buys her three JSS 2 textbooks (₦12,700) at the Lekki campus store and pays by POS. One action charges her, records the payment and takes the books out of Lekki's stock, so her balance doesn't move. A stock count that finds a missing tie waits for someone with `adjustment:approve` before it is written off.
4. **Grading (later phase).** Mr Obi teaches Maths to JSS 2 Gold, so only he enters Maths scores for that class. Publishing freezes Ada's report card; the portal shows only her own card, and, if the school turns on the fee hold, only once her balance is under the threshold.

## Decisions taken (foundation and cross-cutting)

| Question                             | Answer                                                                                                                                                                  | Rejected, and why                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Academic calendar                    | `academic_session` and `term` tables per school; a new school year is created with three terms whose dates staff can change; one current term                           | Fixed 3-term enum (no dates); generic dated periods (vague "current term" and annual averages)                       |
| Classes and membership               | `class_level` (school-wide) + `class_arm` (per campus, called a "class" in the UI) + `student_enrollment` per session                                                   | Class column on student (loses history); free-form groups (too loose for positions and fee pricing)                  |
| Arm or campus change mid-session     | Enrolment stays one row per session; `enrollment_placement` records arm and campus per term                                                                             | Close and reopen enrolment (breaks one-per-session); overwrite arm (term 1 card shows the wrong arm)                 |
| Class teachers                       | Several per arm and session, each with a role (lead, assistant, uniform)                                                                                                | One class teacher per arm (schools run assistant and uniform teachers)                                               |
| Who is billed                        | `guardian` + `guardian_student`; each student has their own account; a guardian sees a combined family statement                                                        | Family account (awkward for split families); guardian columns on student (no guardian login, no sibling view)        |
| Student lifecycle                    | Derived from dates: Active, Inactive (35 days after "not seen since"), Left, Graduated. Leaving and graduating are recorded by staff; nothing is archived automatically | A stored status column (drifts from the dates); automatic archiving (the prototype only prompts staff)               |
| Admission numbers                    | Per school, prefixed with the school's short name (`GF-0123`)                                                                                                           | One sequence shared across schools (the earlier glossary's wording; the prototype numbers per school)                |
| Approval of corrections              | A school setting per kind (refund, write-off, fee reduction, discount, payment cancellation), on by default; payments never wait                                        | Always on (the earlier design; the prototype makes it the school's choice); always off (weak against internal fraud) |
| Order of delivery                    | Foundation, finance, store and subjects, grading, then the rest of inventory                                                                                            | Grading first (only if a pilot school's pain is report cards); no phasing                                            |
| History at go-live                   | Opening balances per student, opening stock per campus store, later: asset list import and past report cards imported read-only                                         | Full migration from the old app (no live schools need moving); start at zero (debts lost)                            |
| Can unpaid fees block a report card? | A school setting (grading phase): off, or hold portal visibility above a balance threshold                                                                              | Never block (schools will ask for it); block on any debt (a ₦500 levy would block a card)                            |

## Rules every table follows

- Every school-scoped table has `organization_id` (FK to `organization`) and filters by the active school. Campus references are composite `(campus_id, organization_id)` FKs to `campus (team_id, organization_id)`, as in today's migration.
- **Null `campus_id` means different things**, by table:
  - On configuration (`fee_line`, `item`, `assessment_component`) it means "applies to every campus" and is visible to anyone in the school.
  - On `announcement` it means "everyone in the school".
  - On money records (`journal_line`, `money_account`) it means "school-wide". Without `campus.readAll`, school-wide money accounts are hidden from the money-accounts list, but a campus bursar can still record a payment into one, and a payment is visible when any student it is allocated to is in their campus scope.
  - An approval item with no campus is visible to every approver.
- Money is `BIGINT` minor units (`amount_minor`), never floats. One currency per school (`school_account.currency`).
- Money, results and students are never deleted [risk-001]. There are no delete endpoints for them, and their FKs use `ON DELETE RESTRICT`, not today's `CASCADE` from `organization`, so deleting a school can't silently erase its books. A school with students or money records can't be deleted.
- Every movement of money or stock carries a `reference` unique per school, so a retried request applies at most once.
- Document numbers come from a per-school `document_sequence (organization_id, kind, year, next_value)` with a prefix. Gaps are allowed.

  | Kind             | Format           |
  | ---------------- | ---------------- |
  | Charge (invoice) | `CHG-2026-00042` |
  | Receipt          | `RCT-2026-00088` |
  | Charge round     | `BR-2026-0001`   |
  | Adjustment       | `ADJ-2026-0001`  |
  | Store sale       | `ISS-2026-0001`  |
  | Store delivery   | `DEL-2026-0001`  |
  | Stock count      | `CNT-2026-0001`  |

- Records that can need approval carry `status`, `created_by`, `approved_by`, `approved_at`, `rejected_by`, `rejection_reason`, with a check that `approved_by <> created_by`. When the school has switched a kind's approval off, the record is approved on creation with `approved_by` null, never set to its creator. Declining needs a reason.
- Out-of-scope rows answer 404 [tenancy-001]. Each new table or route gets an isolation test in `api:test-integration` [tenancy-002].

## Foundation model

Every table also has `id`, `organization_id`, `created_at` and `updated_at` unless noted.

| Table                  | Key columns                                                                                                                                                                                                         | Constraints and notes                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic_session`     | `name` ('2026/2027'), `starts_on`, `ends_on`                                                                                                                                                                        | `UNIQUE (organization_id, name)`. Name is `YYYY/YYYY+1`; at least 12 weeks long; no overlap with another year. Can be removed only before it starts and while it has no charges, payments or enrolments                            |
| `term`                 | `session_id`, `sequence` (1..n), `name` ('First term'), `starts_on`, `ends_on`, `is_current`                                                                                                                        | `UNIQUE (session_id, sequence)`; partial unique: one `is_current` per school. Created three at a time (First, Second, Third term), Monday to Friday, with editable dates. "Fee period" and every result key off `term_id`          |
| `school_holiday`       | `term_id`, `date`, `name`                                                                                                                                                                                           | One row per day; consecutive days with the same name show as one holiday. Added only to the current or a future term. School days = weekdays in the term minus holidays. Breaks between terms are derived, not stored              |
| `class_level`          | `code` ('JSS2'), `name` ('JSS 2'), `sequence`, `next_level_id` (null = final year), `grade_scale_id`                                                                                                                | `UNIQUE (organization_id, code)`. School-wide: every campus uses the same levels. `grade_scale_id` is used from the grading phase                                                                                                  |
| `class_arm`            | `class_level_id`, `campus_id`, `name` ('Gold'), `retired_at`                                                                                                                                                        | `UNIQUE (class_level_id, campus_id, name)`. Carries over each school year. Retired ("archived" in the UI), never deleted                                                                                                           |
| `class_arm_teacher`    | `class_arm_id`, `session_id`, `user_id`, `role` (lead, assistant, uniform)                                                                                                                                          | `UNIQUE (class_arm_id, session_id, user_id)`. Several per arm. Feeds class scope                                                                                                                                                   |
| `student_enrollment`   | `student_id`, `session_id`, `class_level_id`, `status` (active, withdrawn, completed), `is_new_student`                                                                                                             | `UNIQUE (student_id, session_id)`. `is_new_student` is true in the student's first session at the school (drives `fee_line.applies_to`; shown as "New intakes"). Recording a leaving sets `withdrawn`; graduating sets `completed` |
| `enrollment_placement` | `enrollment_id`, `term_id`, `class_arm_id`, `campus_id`                                                                                                                                                             | `UNIQUE (enrollment_id, term_id)`. The arm's campus is the student's campus for that term. "Move for next term" adds the next term's placement to an arm of the same level on any campus                                           |
| `guardian`             | `full_name`, `phone`, `email` (nullable), `username` (nullable), `address`, `photo_key`, `user_id`                                                                                                                  | `UNIQUE (organization_id, user_id)`. Every guardian has a portal login: with an email they get a set-password link; without one, a username (`okeke-family`) and a temporary password changed at first sign-in                     |
| `guardian_student`     | `guardian_id`, `student_id`, `relationship` (mother, father, guardian), `pays_fees`                                                                                                                                 | `UNIQUE (guardian_id, student_id)`. Several guardians may pay fees; if none is ticked when guardians are added, the first one pays. At most `school_setting.max_guardians` per student                                             |
| `staff_leave`          | `user_id`, `type`, `starts_on`, `ends_on`, `reason`, `cover`, `status` (submitted, approved, rejected, cancelled), `decided_by`, `decided_at`, `rejection_reason`                                                   | Starts today or later; at least one weekday. Days = weekdays in the range. The requester can withdraw it while submitted. Approved by someone holding `leave:approve`, never the requester                                         |
| `announcement`         | `title` (≤ 80 chars), `body`, `tag` (general, academics, event, fees), `campus_id` (null = everyone), `status` (draft, published, withdrawn), `pinned`, `published_on`, `created_by`                                | No delete. Withdrawing or saving as a draft unpins. The portal shows published announcements for everyone or the student's campus, pinned first                                                                                    |
| `school_setting`       | `max_guardians` (1–6, default 4), `require_guardian` (default true), per-kind approval switches, enabled payment methods, `receipt_footer`, `signoff`, `result_fee_hold_enabled`, `result_fee_hold_threshold_minor` | One row per school. Finance settings are in [finance](data-model-finance.md#settings); the fee-hold columns arrive with grading                                                                                                    |

Changes to `student`: add `first_name`, `last_name`, `gender` (F, M), `date_of_birth`, `admitted_on`, `user_id` (portal login, username `greenfield-0123`), the "not seen since" fields (`not_seen_since`, `not_seen_by`, `not_seen_note`), and the leaving fields (`exit_kind` (left, graduated), `exit_reason`, `exit_note`, `last_day`, `graduated_session_id`, `archived_at`, `archived_by`). `admission_number` stays unique per school. `student.campus_id` stays as the home campus; the term placement is authoritative for anything term-bound.

School profile fields (`slug`, `city`, `address`, `phone`, `email`, `logo_key`) sit on `school_account`; campus `address` on `campus`.

### Student lifecycle

The state is derived, never stored:

| State                 | Rule                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Active                | Not archived and not inactive. "New intake" is an active student whose enrolment is new                                     |
| Inactive              | 35 days ("5 weeks") or more since `not_seen_since`. Not charged for new terms                                               |
| Due to be marked Left | 98 days after becoming inactive. A dashboard task prompts staff; nothing changes by itself                                  |
| Left                  | `exit_kind = 'left'`, recorded with a reason (did not return, relocated, transferred, fees, expelled, other) and a last day |
| Graduated             | `exit_kind = 'graduated'`                                                                                                   |

- **Mark not seen since** (`student:markAway`) takes a date on or before today. **Back in school** clears it; the student is charged again from the next charge round.
- **Record leaving** (`student:archive`) withdraws the current enrolment. Anything still owed stays on "Who owes" under leavers.
- **Graduate class** (`student:archive`) is offered only for a final-year level. Every student is ticked; staff untick anyone repeating. It completes the enrolment.
- **Admitting** is four steps (student, class, guardian, review) and creates the student, the current-session enrolment (`is_new_student`), the current-term placement and any guardians. A student admitted mid-term is charged on their own.

### Class scope

This fills the class scope the permissions doc left for phase 4b. It binds only members who hold `class.read` without `class.readAll`: they see students placed, in the current term, in arms where they are a class teacher this session (any role) or teach a subject this term (`subject_teacher`). A member with no class permission at all is not class-scoped, so a bursar sees every student on their campuses. Finance screens are campus-scoped, never class-scoped.

## Cross-pillar touchpoints

| From            | To        | What happens                                                                                                                                     |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation      | All       | `term_id` is the period for charges, payments, scores and report cards; the term placement decides the campus on every journal line              |
| Foundation      | Finance   | Only active students with an active enrolment are charged; inactive students are skipped                                                         |
| Store sale      | Finance   | One transaction: a `store` charge (Dr Fees receivable / Cr Store sales), its cost (Dr Cost of store items sold / Cr Store stock) and the payment |
| Store delivery  | Finance   | Dr Store stock / Cr the money account it was paid from, posted at once                                                                           |
| Stock count     | Approvals | A difference waits for `adjustment:approve` as a "Store write-off", then posts at cost to Store stock losses                                     |
| Finance balance | Grading   | Fee hold (grading phase): the portal hides a published report card while the balance is above the threshold                                      |
| Foundation      | Grading   | Promotion (grading phase) confirms next session's `student_enrollment` rows                                                                      |

## Onboarding a school mid-life

Eduvault starts fresh: no school is moving over from the earlier school-management-system. A school that already has history brings in:

- **Debts and credits:** one opening entry per student, reference `OPEN-<student_id>`: Dr Fees receivable (student) / Cr Opening balance (a debt), or the reverse (a credit).
- **Store stock:** an opening delivery per campus store, reference `OPEN-STORE-<campus>`: Dr Store stock / Cr Opening balance, with `opening` stock movements.
- **Later phases:** a CSV import of assets and library books into `item_unit`; past report cards imported as `report_card` rows with `source = 'import'`, already published and read-only.

## Permission list

These amend the permissions doc's "Later additions" table. Each resource lands with its feature, as that doc requires. Sensitive permissions are marked with ⚑.

### In the prototype (F0–F2)

| Pillar            | Resource       | Actions                                                  | Notes                                                                                                       |
| ----------------- | -------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| People and access | `team`         | **read**, create, update, delete                         | Adds `read` to the permissions doc's phase 1                                                                |
| Foundation        | `session`      | create, read, update, setCurrent                         | `update` also removes a school year that hasn't started and has nothing in it                               |
| Foundation        | `class`        | create, read, readAll ⚑, update, assignTeacher           | No `delete` (arms are retired). `assignTeacher` covers class teachers and subject teachers                  |
| Foundation        | `student`      | create, read, readOwn, update, **markAway**, **archive** | `markAway` records "not seen since"; `archive` records leaving and graduation                               |
| Foundation        | `enrollment`   | create, read, place                                      | `promote` moves to the grading phase's `promotion` resource                                                 |
| Foundation        | `guardian`     | create, read, update, link                               |                                                                                                             |
| Foundation        | `subject`      | create, read, update                                     | Lives with the foundation; replaces `exam`                                                                  |
| Foundation        | `announcement` | create, read, update                                     | New. No delete; `update` covers edit, pin, publish and withdraw                                             |
| Foundation        | `leave`        | **approve**                                              | New. Owner and principal by default; nobody approves their own leave                                        |
| Finance           | `ledger`       | read, manageAccounts ⚑                                   | "Money categories"                                                                                          |
| Finance           | `moneyAccount` | create, read, update                                     | "Bank and POS accounts"                                                                                     |
| Finance           | `feeLine`      | create, read, readOwn, update, retire                    | Replaces `feeSchedule`. `create` also adds a fee type (a category under fee income)                         |
| Finance           | `invoice`      | bill, read, readOwn                                      | `bill` runs "Charge students"                                                                               |
| Finance           | `payment`      | record, read, readOwn, **void** ⚑                        | `void` asks to cancel a payment; `adjustment:approve` approves it                                           |
| Finance           | `adjustment`   | create, read, **approve** ⚑                              | Approves fee reductions, discounts, cancelled balances, refunds, payment cancellations and store write-offs |
| Finance           | `store`        | read, receive, issue, count                              | New. `receive` also adds items; `issue` sells to a student                                                  |

Class and subject teachers are picked from members on the arm's campus who hold `class:read` (or `campus:readAll`), not by role name. Two ownership guardrails stay tied to role names on purpose: a person holds at most one of owner, administrator or principal, and handing over the school removes administrator or principal from the new owner.

### Later phases

| Phase | Resource      | Actions                                            |
| ----- | ------------- | -------------------------------------------------- |
| F1b   | `expense`     | create, read, **approve**                          |
| F3    | `assessment`  | create, read, update                               |
| F3    | `score`       | record, submit, read                               |
| F3    | `result`      | **approve**, **publish**, **amend**, read, readOwn |
| F3    | `attendance`  | record, read, readOwn                              |
| F3    | `promotion`   | read, decide, confirm                              |
| F4    | `stock`       | transfer                                           |
| F4    | `requisition` | create, read, **approve**, issue                   |
| F4    | `asset`       | assign, read, dispose                              |
| F4    | `library`     | lend, return, read, readOwn                        |

Every `approve` is separate from the action it approves, and the database refuses self-approval.

## Phases

| #   | Phase                                                                                                                                                                                                                                                       | Relation to the permissions doc                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| F0  | Foundation: school years, terms, holidays, class levels and arms, class teachers, admission, enrolment and placement, student lifecycle and graduation, guardians, `school_setting`, opening balances                                                       | Delivers the class model of its phase 4b and the guardian tables of 4a |
| F1  | Finance: money categories, money accounts, journal, fee lines, discounts, charge rounds, charges, payments with split allocation and proof, corrections and approval rules, payment rules, reports. Also the Approvals queue, announcements and staff leave | `feeSchedule` becomes `feeLine`                                        |
| F1b | Expenses and suppliers                                                                                                                                                                                                                                      | New resource                                                           |
| F2  | Store (uniforms and textbooks per campus: items, deliveries, sales, stock counts) and the subject catalogue with subject teachers                                                                                                                           | New resources                                                          |
| F3  | Grading: assessment components, score sheets and workflow, grade scales, attendance, traits and comments, report-card snapshot, fee hold, promotion                                                                                                         | Replaces its `exam` and `result` rows                                  |
| F4  | Rest of inventory: named stores and transfers, consumables and requisitions, asset units, library loans                                                                                                                                                     | New resources                                                          |

F0 depends on the permissions doc's phase 1 (custom roles), because each new resource needs the new guard. Replacing `fee_schedule` also replaces the `fee-schedule` API module and both `fees-page.tsx` files. The portal's own screens (My children, Home, Fees, Purchases) land with the permissions doc's phase 4a.

## Assumptions

Agreed defaults rather than grilled decisions:

1. One currency per school; amounts in minor units.
2. Per-school document number sequences with prefixes; not gapless.
3. Approval is `status` + `approved_by` on each record, approver ≠ creator; a switched-off approval leaves `approved_by` null.
4. One `supplier` table shared by expenses and store deliveries, arriving with expenses; until then a delivery records the supplier's name.
5. Class scope as described above.
6. New permission resources per pillar, as listed above.
7. An online gateway arrives later through `payment_intent`, feeding the same payment and journal path.
8. `fee_schedule` is replaced by `fee_line`; there is no production data to migrate.
9. Out of scope: asset depreciation, payroll, SMS and email notifications, timetabling.
10. School-wide money accounts follow the visibility rule under [Rules every table follows](#rules-every-table-follows).
11. A late attendance mark counts as present on the report card.
12. A result amendment needs `result:amend` and a reason, not a second person's approval.

## Still open

- **Admitting** is gated only by `student:create`, though it also creates the enrolment, placement and guardians.
- **Leave days** don't subtract school holidays today.
- **Withdrawing mid-session:** whether a withdrawn student's unbilled optional lines are cancelled automatically or by the bursar.
- Pillar-specific open questions are listed in each pillar doc.

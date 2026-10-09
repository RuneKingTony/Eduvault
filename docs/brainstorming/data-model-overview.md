# Data model: overview

- Status: brainstorm (not yet an ADR)
- Date: 2026-10-09
- Source of truth: the Eduvault brand prototype (claude.ai artifact `1hsDyr1KdUaYD2hnuA9sfY`). Where this doc and the prototype disagreed, the prototype won; where the prototype is silent, the earlier design is kept and marked as a later phase. Later decisions are in the [decision log](../technical-reference.md#decision-log) (D-009 to D-048) and the module PRDs in [docs/prd](../prd/README.md).
- Pillar docs: [finance](data-model-finance.md), [grading](data-model-grading.md), [inventory](data-model-inventory.md)
- Amends, once accepted: [permissions-and-custom-roles.md](permissions-and-custom-roles.md) (permission list including `team:read`, `leave:approve` and `student:markAway`/`archive`, without `invitation`, `student:delete` and `feeSchedule`; Principal as a starter role; class model, phases 4a/4b, and its note that admission numbers share one sequence across schools: they are now per school); [ADR 0005](../adr/0005-tenancy.md) (`fee_schedule` replaced by `fee_line`)

## Goal

Describe what Eduvault holds for its pillars (financial recording, the campus store, student grading and wider inventory) and the shared foundation they stand on. This is the target model; delivery is phased (see [Phases](#phases)).

## How the pillars fit together: one term in Ada's life

1. **Foundation.** 2026/2027 is a _school year_ (session) with three _terms_. Ada Okeke (GF-0123) has one _enrolment_ for the year (level JSS 2) and a _placement_ each term (JSS 2 Gold, Lekki campus). If she moves to Ikeja for second term, first term's records still say Gold, Lekki. Her mother, Ngozi Okeke, is a _guardian_ linked to Ada and two siblings, with her own portal login, and is ticked as the guardian who pays fees.
2. **Finance.** The bursar runs **Charge students** for first term. Fee lines for JSS 2 (tuition, PTA fee, the bus if opted in) become Ada's charge, with her 5% sibling discount as a negative line. Running it twice never charges twice. Ngozi pays ₦300,000 by transfer for all three children: one receipt, one journal entry, split across them (Ada's share ₦180,000), with the proof of transfer attached. Ada's balance is the sum of her journal lines, never a stored number. Cancelling a payment, reducing a fee, cancelling a balance or a refund waits for a second person, unless the school has switched that approval off.
3. **Store.** Ada buys her three JSS 2 textbooks (₦12,700) at the Lekki campus store and pays by POS. One action charges her, records the payment and takes the books out of Lekki's stock, so her balance doesn't move. A stock count that finds a missing tie waits for someone with `adjustment:approve` before it is written off.
4. **Grading (later phase).** Mr Obi teaches Maths to JSS 2 Gold, so only he enters Maths scores for that class. Publishing freezes Ada's report card; the portal shows only her own card, and, if the school turns on the fee hold, only once her balance is under the threshold.

## Decisions taken (foundation and cross-cutting)

| Question                             | Answer                                                                                                                                                                          | Rejected, and why                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Academic calendar                    | `academic_session` and `term` tables per school; a new school year is created with three terms whose dates staff can change; one current term                                   | Fixed 3-term enum (no dates); generic dated periods (vague "current term" and annual averages)                       |
| Classes and membership               | `class_level` (school-wide) + `class_arm` (per campus, called a "class" in the UI) + `student_enrollment` per session                                                           | Class column on student (loses history); free-form groups (too loose for positions and fee pricing)                  |
| Arm or campus change mid-session     | Enrolment stays one row per session; `enrollment_placement` records arm and campus per term; making a term current rolls placements forward (D-017)                             | Close and reopen enrolment (breaks one-per-session); overwrite arm (term 1 card shows the wrong arm)                 |
| Class teachers                       | Several per arm and session, each with a role (lead, assistant, uniform); at most one lead                                                                                      | One class teacher per arm (schools run assistant and uniform teachers); several leads ("the class teacher" is one)   |
| Who is billed                        | `guardian` + `guardian_student`; each student has their own account; a guardian sees a combined family statement                                                                | Family account (awkward for split families); guardian columns on student (no guardian login, no sibling view)        |
| Student lifecycle                    | Derived from dates: Active, Inactive (35 days after "not seen since"), Left, Graduated. Leaving and graduating are recorded by staff; nothing is archived automatically         | A stored status column (drifts from the dates); automatic archiving (the prototype only prompts staff)               |
| Moving into a new school year        | "Start new school year", a bulk action that moves active students up a level, until the grading phase's promotion replaces it (D-029)                                           | Admitting everyone again; waiting for promotion (schools roll over before grading ships)                             |
| Admission numbers                    | Per school, prefixed with `school_account.admission_prefix` (`GF-0123`), set when the school is created (D-019)                                                                 | One sequence shared across schools (the earlier glossary's wording; the prototype numbers per school)                |
| Approval of corrections              | A school setting per kind (refund, write-off, fee reduction, discount, payment cancellation), on by default; payments never wait                                                | Always on (the earlier design; the prototype makes it the school's choice); always off (weak against internal fraud) |
| Files                                | A `FileStore` interface over Postgres (`file_object`, `file_blob`) now, S3-compatible later with an ADR; uploads go through `/files` first and records hold `*_file_id` (D-028) | Files on the record itself; object storage before hosting is chosen                                                  |
| Order of delivery                    | Foundation, finance, store and subjects, grading, then the rest of inventory, cut into milestones M0–M7 of vertical slices (D-009)                                              | Grading first (only if a pilot school's pain is report cards); no phasing                                            |
| History at go-live                   | Opening balances per student, opening balances per money account, opening stock per campus store, later: asset list import and past report cards imported read-only             | Full migration from the old app (no live schools need moving); start at zero (debts lost)                            |
| Can unpaid fees block a report card? | A school setting (grading phase): off, or hold portal visibility above a balance threshold                                                                                      | Never block (schools will ask for it); block on any debt (a ₦500 levy would block a card)                            |

## Rules every table follows

- Every school-scoped table has `organization_id` (FK to `organization`) and filters by the active school. Campus references are composite `(campus_id, organization_id)` FKs to `campus (team_id, organization_id)`, as in today's migration.
- **Null `campus_id` means different things**, by table:
  - On configuration (`fee_line`, `item`, `assessment_component`) it means "applies to every campus" and is visible to anyone in the school.
  - On `announcement` and `activity_event` it means "everyone in the school".
  - On money records (`journal_line`, `money_account`) it means "school-wide". Without `campus:readAll`, school-wide money accounts are hidden from the money-accounts list, but a campus bursar can still record a payment into one (D-045), and a payment is visible when any student it is allocated to is in their campus scope.
  - An approval item with no campus is visible to every approver.
- Money is `BIGINT` minor units (`amount_minor`), never floats. One currency per school (`school_account.currency`).
- "Today" and every timestamp shown use Africa/Lagos through one helper; there is no per-school time zone (D-023).
- Money, results and students are never deleted [risk-001]. There are no delete endpoints for them, and their FKs use `ON DELETE RESTRICT`, not today's `CASCADE` from `organization`, so deleting a school can't silently erase its books. A school with students or money records can't be deleted.
- Every movement of money or stock carries a `reference` unique per school, so a retried request applies at most once. The same reference with the same request returns the earlier record (`replayed: true`); the same reference with a different request answers 409 (D-033).
- Document numbers come from a per-school `document_sequence (organization_id, kind, year, next_value)` with a prefix. The year is the year the number is allocated (D-033). Gaps are allowed.

  | Kind             | Format           |
  | ---------------- | ---------------- |
  | Charge (invoice) | `CHG-2026-00042` |
  | Receipt          | `RCT-2026-00088` |
  | Charge round     | `BR-2026-0001`   |
  | Adjustment       | `ADJ-2026-0001`  |
  | Store sale       | `ISS-2026-0001`  |
  | Store delivery   | `DEL-2026-0001`  |
  | Stock count      | `CNT-2026-0001`  |

- **One approval shape (D-025).** Every record that can need approval (`student_discount`, `adjustment`, `payment_void`, `staff_leave`, `stock_count`, later `expense` and `requisition`) carries `status`, `created_by`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`, with database checks that `approved_by <> created_by` and `rejected_by <> created_by`; a breach answers 409 (D-013). Declining needs a reason. When the school has switched a kind's approval off, the record is approved on creation with `approved_by` null, never set to its creator (D-007); requests already waiting when a kind is switched off stay waiting (D-027).
- Files are never stored on the record: a record holds a `*_file_id` to `file_object`, and the file is served through `/files` after the owning record's own permission and scope checks (D-028).
- Out-of-scope rows answer 404 [tenancy-001]. Each new table or route gets an isolation test in `api:test-integration` [tenancy-002].

## Foundation model

Every table also has `id`, `organization_id`, `created_at` and `updated_at` unless noted.

| Table                  | Key columns                                                                                                                                                                                                        | Constraints and notes                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `school_account`       | `name`, `currency`, `city`, `address`, `phone`, `email`, `logo_file_id`, `admission_prefix`, `suspended_at`, `suspended_by`, `updated_by`                                                                          | One row per school, created with the school. The URL name is Better Auth's `organization.slug` (unique, can't change; student usernames use it), not a column here. `admission_prefix` is 2–6 upper-case letters (`GF`), set when the school is created (D-019). Suspending sets `suspended_at` and `suspended_by`; members then get 403 `SchoolSuspended` (D-037). Currency can't change |
| `school_setting`       | See [School settings](#school-settings)                                                                                                                                                                            | One row per school, created with the school                                                                                                                                                                                                                                                                                                                                               |
| `academic_session`     | `name` ('2026/2027'), `starts_on`, `ends_on`                                                                                                                                                                       | `UNIQUE (organization_id, name)`. Name is `YYYY/YYYY+1`; at least 12 weeks long; no overlap with another year. Can be removed only before it starts and while it has no charges, payments or enrolments                                                                                                                                                                                   |
| `term`                 | `organization_id`, `session_id`, `sequence` (1..n), `name` ('First term'), `starts_on`, `ends_on`, `is_current`                                                                                                    | Carries its own `organization_id` so the partial unique `(organization_id) WHERE is_current` gives one current term per school. `UNIQUE (session_id, sequence)`. Created three at a time (First, Second, Third term), Monday to Friday, with editable dates. Make current also accepts next year's first term (D-017). "Fee period" and every result key off `term_id`                    |
| `school_holiday`       | `organization_id`, `term_id`, `date`, `name`                                                                                                                                                                       | `UNIQUE (organization_id, date)`; the date is a weekday inside its term. One row per day; consecutive days with the same name show as one holiday. Added only to the current or a future term. School days = weekdays in the term minus holidays. Breaks between terms are derived, not stored                                                                                            |
| `class_level`          | `code` ('JSS2'), `name` ('JSS 2'), `sequence`, `next_level_id` (null = final year), `grade_scale_id`                                                                                                               | `UNIQUE (organization_id, code)`. School-wide: every campus uses the same levels. A new school gets a default ladder (D-011). `grade_scale_id` is used from the grading phase                                                                                                                                                                                                             |
| `class_arm`            | `class_level_id`, `campus_id`, `name` ('Gold'), `retired_at`, `retired_by`                                                                                                                                         | `UNIQUE (class_level_id, campus_id, name)`. Carries over each school year. Retired ("archived" in the UI), never deleted, and only when no student is placed in it for the current or a later term                                                                                                                                                                                        |
| `class_arm_teacher`    | `class_arm_id`, `session_id`, `user_id`, `role` (lead, assistant, uniform)                                                                                                                                         | `UNIQUE (class_arm_id, session_id, user_id)`; partial unique `(class_arm_id, session_id) WHERE role = 'lead'`: one lead class teacher per class and year, any number of assistants and uniform teachers. Feeds class scope                                                                                                                                                                |
| `student_enrollment`   | `student_id`, `session_id`, `class_level_id`, `status` (active, withdrawn, completed), `is_new_student`                                                                                                            | `UNIQUE (student_id, session_id)`. `is_new_student` is true in the student's first session at the school (drives `fee_line.applies_to`; shown as "New intakes"). Recording a leaving sets `withdrawn`; graduating sets `completed`                                                                                                                                                        |
| `enrollment_placement` | `enrollment_id`, `term_id`, `class_arm_id`, `campus_id`                                                                                                                                                            | `UNIQUE (enrollment_id, term_id)`. The arm's campus is the student's campus for that term. "Move for next term" adds the next term's placement to an arm of the same level on any campus. Making a term current copies each active enrolment's latest placement into it unless one exists (D-017)                                                                                         |
| `guardian`             | `full_name`, `phone`, `email` (nullable), `address`, `photo_file_id`, `user_id`                                                                                                                                    | `UNIQUE (organization_id, user_id)`. Every guardian has a portal login, created at admission (D-015): with an email they get a set-password link; without one, a username (`okeke-family`, held on `user.username`) and a temporary password changed at first sign-in                                                                                                                     |
| `guardian_student`     | `guardian_id`, `student_id`, `relationship` (mother, father, guardian), `pays_fees`, `created_by`                                                                                                                  | `UNIQUE (guardian_id, student_id)`. Several guardians may pay fees; if none is ticked when guardians are added, the first one pays. Every linked guardian sees the child's fees and purchases in the portal, paying or not (D-030). At most `school_setting.max_guardians` per student                                                                                                    |
| `staff_leave`          | `type` (annual, sick, personal, study, parental), `starts_on`, `ends_on`, `reason`, `cover`, `status` (submitted, approved, rejected, cancelled), the approval columns (`created_by` is the requester)             | Starts today or later; at least one day. Days = weekdays in the range minus school holidays; a request overlapping the requester's own submitted or approved leave is refused (D-039). The requester can withdraw it while submitted. Approved by someone holding `leave:approve`, never the requester (D-025)                                                                            |
| `announcement`         | `title` (≤ 80 chars), `body`, `tag` (general, academics, event, fees), `campus_id` (null = everyone), `status` (draft, published, withdrawn), `pinned`, `published_on`, `withdrawn_at`, `created_by`, `updated_by` | No delete. Withdrawing or saving as a draft unpins. The portal shows published announcements for everyone or the student's campus, pinned first                                                                                                                                                                                                                                           |
| `activity_event`       | `campus_id` (null = school-wide), `pillar` (foundation, finance, access, platform), `kind` (`announcement.published`), `actor_user_id`, `subject_type`, `subject_id`, `text`, `data` (JSONB), `occurred_at`        | Append-only, never updated or deleted, written in the same transaction as the change it records. `text` is the sentence as written at the time, so a rename doesn't rewrite history. Feeds Recent activity, filtered by campus and by the permission for each pillar; lands with M2.4 (D-016). Separate from the platform `audit_log`                                                     |
| `file_object`          | `kind` (`payment_proof`, `school_logo`, `guardian_photo`), `storage_key`, `content_type`, `byte_size`, `sha256`, `original_name`, `uploaded_by`, `uploaded_at`                                                     | One row per upload, behind the `FileStore` interface (D-028). Type checked by content, not extension. Visible only through its owning record; another school's or an out-of-scope file answers 404. A payment proof is never deleted or replaced; a logo or photo may be                                                                                                                  |
| `file_blob`            | `file_id`, `organization_id`, `bytes` (`BYTEA`)                                                                                                                                                                    | The Postgres driver's storage, one row per `file_object`. Replaced by an S3-compatible driver later, with an ADR (D-028)                                                                                                                                                                                                                                                                  |

Changes to `student`: add `first_name`, `last_name`, `gender` (F, M), `date_of_birth`, `admitted_on`, `created_by`, `user_id` (portal login, username `greenfield-0123`, created at admission, D-015), the "not seen since" fields (`not_seen_since`, `not_seen_by`, `not_seen_note`), and the leaving fields (`exit_kind` (left, graduated), `exit_reason`, `exit_note`, `last_day`, `graduated_session_id`, `archived_at`, `archived_by`). `admission_number` stays unique per school. `student.campus_id` stays as the home campus; the term placement is authoritative for anything term-bound.

Campus `address` sits on `campus`. Each `*_key` column in the earlier drafts (`logo_key`, `photo_key`, `proof_key`) is now a `*_file_id` FK to `file_object` (D-028).

### School settings

`school_setting` columns, added slice by slice:

| Slice | Columns                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2.2  | `max_guardians SMALLINT NOT NULL DEFAULT 4 CHECK (max_guardians BETWEEN 1 AND 6)`, `require_guardian BOOLEAN NOT NULL DEFAULT true`, `updated_by`                                                                   |
| M3.4  | `pay_cash`, `pay_transfer`, `pay_pos`, each `BOOLEAN NOT NULL DEFAULT true`, with `CHECK (pay_cash OR pay_transfer OR pay_pos)`; `receipt_footer TEXT NOT NULL DEFAULT 'Thank you for your payment.'` (≤ 120 chars) |
| M3.5  | `approve_refund`, `approve_write_off`, `approve_credit_note`, `approve_discount`, `approve_payment_void`, each `BOOLEAN NOT NULL DEFAULT true`                                                                      |
| M6    | `result_fee_hold_enabled`, `result_fee_hold_threshold_minor` (grading)                                                                                                                                              |

"Not active yet" settings rows are hidden in production; the automatic sibling discount, number and date formats and automatic deletion don't ship (D-021). `signoff` is not in v1. The finance meaning of these columns is in [finance](data-model-finance.md#settings).

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
- **Start new school year** (D-029, M2.5) is a bulk action at the end of a year. It moves each active student to the next level and the class of the same name, with repeaters unticked and final-year students graduating. It creates next year's enrolments and first-term placements. The grading phase's promotion replaces it.
- **Admitting** is four steps (student, class, guardian, review) and creates the student with their portal login, the current-session enrolment (`is_new_student`), the current-term placement and any guardians with theirs (D-015). It needs `student:create` and `guardian:link`, plus `guardian:create` for a new guardian (D-018). A student admitted mid-term is charged on their own.
- Every lifecycle action writes an `activity_event` (D-016).

### Class scope

This fills the class scope the permissions doc left for phase 4b. It binds only members who hold `class:read` without `class:readAll`: they see students placed, in the current term, in arms where they are a class teacher this session (any role) or teach a subject this term (`subject_teacher`). Guardians are narrowed the same way, through the students in scope (D-048). A member with no class permission at all is not class-scoped, so a bursar sees every student on their campuses. Finance screens are campus-scoped, never class-scoped.

## Cross-pillar touchpoints

| From            | To        | What happens                                                                                                                                     |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation      | All       | `term_id` is the period for charges, payments, scores and report cards; the term placement decides the campus on every journal line              |
| Foundation      | Finance   | Only active students with an active enrolment are charged; inactive students are skipped                                                         |
| Store sale      | Finance   | One transaction: a `store` charge (Dr Fees receivable / Cr Store sales), its cost (Dr Cost of store items sold / Cr Store stock) and the payment |
| Store delivery  | Finance   | Dr Store stock / Cr the money account it was paid from, posted at once                                                                           |
| Stock count     | Approvals | A difference waits for `adjustment:approve` as a "Store write-off", then posts at moving average cost to Store stock losses (D-031)              |
| All pillars     | Dashboard | Changes write `activity_event` rows for Recent activity (D-016)                                                                                  |
| Finance balance | Grading   | Fee hold (grading phase): the portal hides a published report card while the balance is above the threshold                                      |
| Foundation      | Grading   | Promotion (grading phase) confirms next session's `student_enrollment` rows, replacing Start new school year (D-029)                             |

## Onboarding a school mid-life

Eduvault starts fresh: no school is moving over from the earlier school-management-system. A school that already has history brings in:

- **Debts and credits:** one opening entry per student, reference `OPEN-<student_id>`: Dr Fees receivable (student) / Cr Opening balance (a debt), or the reverse (a credit).
- **Money in the bank:** one opening entry per money account, reference `OPEN-MA-<money_account_id>`: Dr the money account / Cr Opening balance, so the cash book matches the bank statement.
- **Store stock:** an opening delivery per campus store, reference `OPEN-STORE-<campus>`: Dr Store stock / Cr Opening balance, with `opening` stock movements.
- **Later phases:** a CSV import of assets and library books into `item_unit`; past report cards imported as `report_card` rows with `source = 'import'`, already published and read-only.

## Permission list

These amend the permissions doc's "Later additions" table. Each resource lands with its feature, as that doc requires. Sensitive permissions (the `SENSITIVE` set in `libs/policy`, from the prototype) are marked with ⚑. A route may accept any of several permissions (Who owes needs `invoice:read` or `payment:read`, D-012).

### In the prototype (F0–F2, milestones M1–M4)

| Pillar            | Resource        | Actions                                                  | Notes                                                                                                       |
| ----------------- | --------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| People and access | `organization`  | update, delete ⚑                                         | `update` hands the school over; `delete` is the danger zone. Normally only the owner                        |
| People and access | `member`        | create ⚑, read, update, delete ⚑                         |                                                                                                             |
| People and access | `ac`            | create ⚑, read, update ⚑, delete ⚑                       | Roles                                                                                                       |
| People and access | `team`          | **read**, create, update, delete                         | Adds `read` to the permissions doc's phase 1                                                                |
| People and access | `campus`        | readAll ⚑                                                | Sees every campus                                                                                           |
| People and access | `schoolAccount` | read, update                                             | School settings. Drops today's `create` and `delete`                                                        |
| Foundation        | `session`       | create, read, update, setCurrent                         | `update` also removes a school year that hasn't started and has nothing in it                               |
| Foundation        | `class`         | create, read, readAll ⚑, update, assignTeacher           | No `delete` (arms are retired). `assignTeacher` covers class teachers and subject teachers                  |
| Foundation        | `student`       | create, read, readOwn, update, **markAway**, **archive** | `markAway` records "not seen since"; `archive` records leaving and graduation. No `delete` (D-014)          |
| Foundation        | `enrollment`    | create, read, place                                      | `promote` moves to the grading phase's `promotion` resource                                                 |
| Foundation        | `guardian`      | create, read, update, link                               |                                                                                                             |
| Foundation        | `subject`       | create, read, update                                     | Lives with the foundation; replaces `exam`                                                                  |
| Foundation        | `announcement`  | create, read, update                                     | New. No delete; `update` covers edit, pin, publish and withdraw                                             |
| Foundation        | `leave`         | **approve**                                              | New. Owner and Principal by default; nobody approves their own leave                                        |
| Finance           | `ledger`        | read, manageAccounts ⚑                                   | "Money categories"                                                                                          |
| Finance           | `moneyAccount`  | create, read, update                                     | "Bank and POS accounts"                                                                                     |
| Finance           | `feeLine`       | create, read, readOwn, update, retire                    | `create` also adds a fee type (a category under fee income)                                                 |
| Finance           | `invoice`       | bill, read, readOwn                                      | `bill` runs "Charge students"                                                                               |
| Finance           | `payment`       | record, read, readOwn, **void** ⚑                        | `void` asks to cancel a payment; `adjustment:approve` approves it                                           |
| Finance           | `adjustment`    | create, read, **approve** ⚑                              | Approves fee reductions, discounts, cancelled balances, refunds, payment cancellations and store write-offs |
| Finance           | `store`         | read, receive, issue, count                              | New. `receive` also adds items; `issue` sells to a student                                                  |

Three entries leave the permissions doc's list: `invitation` (its routes are disabled and the prototype never grants it), `student:delete` (students are archived, never deleted; D-014) and `feeSchedule` (replaced by `feeLine`).

Starter roles are inserted for every new school: Administrator, Teacher, Bursar, Student, Guardian and **Principal**, a ready-made role holding `adjustment:approve` and `leave:approve` (D-010). Owner and Member are defined in code.

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

The roadmap in [docs/prd/README.md](../prd/README.md) delivers these phases as milestones of vertical slices (D-009):

| #   | Phase                                                                                                                                                                                                                                                                                                                       | Milestones                | Relation to the permissions doc                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| —   | Before F0: brand, app shells, test harness and seed; permissions, sign-in, creating a school, staff, roles and the platform console                                                                                                                                                                                         | M0 Foundations, M1 Access | Its phases 1–3 (custom roles, temporary passwords, acting super admin) |
| F0  | Foundation: school years, terms, holidays, class levels and arms, class teachers, admission with student and guardian logins, enrolment and placement, student lifecycle, graduation and Start new school year, guardians, `school_setting`, files, activity, announcements, the dashboard's first cut and the portal shell | M2 School foundation      | Delivers the class model of its phase 4b and the guardian tables of 4a |
| F1  | Finance: money categories, money accounts, journal, opening balances, fee lines, discounts, charge rounds, charges, payments with split allocation and proof, corrections and approval rules, payment rules, reports, the Approvals queue, staff leave and the portal's Fees                                                | M3 Money                  | `feeSchedule` becomes `feeLine`                                        |
| F2  | Store (uniforms and textbooks per campus: items, deliveries, sales, stock counts), the portal's Purchases, and the subject catalogue with subject teachers                                                                                                                                                                  | M4 Store and subjects     | New resources                                                          |
| F1b | Expenses and suppliers                                                                                                                                                                                                                                                                                                      | M5                        | New resource                                                           |
| F3  | Grading: assessment components, score sheets and workflow, grade scales, attendance, traits and comments, report-card snapshot, fee hold, promotion                                                                                                                                                                         | M6                        | Replaces its `exam` and `result` rows                                  |
| F4  | Rest of inventory: named stores and transfers, consumables and requisitions, asset units, library loans                                                                                                                                                                                                                     | M7                        | New resources                                                          |

The roadmap ships F2 (M4) before F1b (M5); the phase names are kept. F0 depends on the permissions doc's phase 1 (custom roles), because each new resource needs the new guard. Replacing `fee_schedule` (M3.2) also replaces the `fee-schedule` API module and both `fees-page.tsx` files. The portal's own screens land with the slices that feed them: the shell, Home and My children in M2.8, Fees in M3.7, Purchases in M4.4.

## Assumptions

Agreed defaults rather than grilled decisions:

1. One currency per school; amounts in minor units.
2. Per-school document number sequences with prefixes; not gapless.
3. Approval is `status` plus the D-025 columns on each record, approver ≠ creator; a switched-off approval leaves `approved_by` null.
4. One `supplier` table shared by expenses and store deliveries, arriving with expenses; until then a delivery records the supplier's name.
5. Class scope as described above.
6. New permission resources per pillar, as listed above.
7. An online gateway arrives later through `payment_intent`, feeding the same payment and journal path.
8. `fee_schedule` is replaced by `fee_line`; there is no production data to migrate.
9. Out of scope: asset depreciation, payroll, SMS and email notifications, timetabling.
10. School-wide money accounts follow the visibility rule under [Rules every table follows](#rules-every-table-follows) (D-045).
11. A late attendance mark counts as present on the report card.
12. A result amendment needs `result:amend` and a reason, not a second person's approval.

## Still open

- Pillar-specific open questions are listed in each pillar doc, and module ones in each PRD's Open decisions.

Settled since the first draft: the admitting gate (D-018); leave days subtract holidays (D-039); a withdrawn student's opt-ins are left alone, because leaving already stops charging and opt-ins end with the school year ([50-fees](../prd/50-fees.md), decision 5).

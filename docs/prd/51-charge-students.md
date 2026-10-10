# PRD: Charge students (charge rounds)

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M3.3` (see [roadmap](README.md))
- Related: [data-model-finance.md](../brainstorming/data-model-finance.md) (Fees and charging, Posting rules, Invariants), [data-model-overview.md](../brainstorming/data-model-overview.md) (Rules every table follows, document numbers, student lifecycle), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-005](../technical-reference.md#decision-log), [D-007](../technical-reference.md#decision-log), [D-033](../technical-reference.md#decision-log), [D-041](../technical-reference.md#decision-log), [D-042](../technical-reference.md#decision-log); sibling PRDs [50-fees.md](50-fees.md), [52-charges.md](52-charges.md)

## Summary

The bursar charges students for a term in three steps: **prepare** (draft charges built from the fee schedule and approved discounts), **check** (review the round), **send** (number each charge and post it to the books). A round can be cancelled while it is a draft. Running it again never charges a student twice for the same term, so a late admission is charged by simply running it again.

## Who uses it

| Persona                       | Permission(s)                  | What they can do here                                          |
| ----------------------------- | ------------------------------ | -------------------------------------------------------------- |
| Owner                         | all                            | Prepare, send and cancel rounds for every campus               |
| Bursar (Lekki or Ikeja)       | `invoice:bill`, `invoice:read` | Prepare, send and cancel rounds for students on their campuses |
| Administrator, Principal      | `invoice:read`                 | See rounds and their charges; no Charge students button        |
| Teacher, member with no roles | none                           | Not shown; the route redirects                                 |
| Acting super admin, no reason | read permissions               | Read-only; prepare, send and cancel hidden and answer 403      |

Gate: `invoice:bill` **or** `invoice:read`. Scope: campus only. A student is in finance scope when their current-term campus is in the member's campus scope ("Whole school" means every campus the member sees). Charges outside scope are not listed; a round with no charge in scope is left out of the list and answers 404. In scope without the permission answers 403 [tenancy-001].

## Screens

Both screens sit in the Fees sub-tab frame (see [50-fees, Fees sub-tabs](50-fees.md#fees-sub-tabs-shared-frame)); the **Charge students** tab is selected. Phase F1.

### Charge students (rounds list)

- Route `/finance/billing` (web-admin), Finance › Fees › Charge students tab. Gate `invoice:bill` or `invoice:read`.
- Header: title **Charge students**; description "Charge students for a term in three steps: prepare, check, send."; info tip "Charges already sent are never edited. A mistake is fixed with an approved fee reduction."; action **Charge students** (primary, plus icon), gate `invoice:bill`, opens the prepare sheet.
- **Result callout** (after a prepare, until the page is left):
  - Some created (success): "**`<n>` charge(s) ready to check**. `<s>` already charged for `<term>` were skipped`, <k> had no fees that apply`." (the last clause only when k > 0), with a small primary button **Check and send** (arrow) to the new round.
  - None created (info): "**Nothing new: `<s>` already charged.** Every student you can see already has a `<term>` charge. Trying again never charges twice."
- **Earlier rounds** card (flush), newest first:

| Column      | Content                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| Round       | Icon; round number in mono (`BR-2026-0001`); below: `<term> · <scope label>` |
| Charges     | Number of charges in the round that are in the viewer's scope                |
| Total       | Sum of those charges' totals                                                 |
| Prepared by | Avatar and name                                                              |
| Sent        | Date sent, or "—"                                                            |
| Status      | **Prepared**, **Sent** or **Cancelled**                                      |

Scope labels: "Whole school", `Campus: <name>`, `Level: <name>`. Rows open the round. Paged 10. Empty: "No charges sent yet" (receipt icon) with a small **Charge students** button (gate `invoice:bill`).

### Prepare (sheet)

- Title **Charge students**; description "Prepares the charges so you can check them. Nothing is final until you send them."
- Fields:

| Field         | Control                                                                                                                                                    | Default                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Term          | select: current term and next term (as on [School fees](50-fees.md#school-fees)); label `<term>` plus " (already charged)" or " (partly charged)" (rule 7) | the first of the two not already charged, else the current term |
| Who to charge | select: **Everyone I can see**, **One campus**, **One level**                                                                                              | Everyone I can see                                              |
| Campus        | shown only for One campus: campuses in the viewer's scope                                                                                                  | the first                                                       |
| Level         | shown only for One level: levels with an enrolment in the term's school year                                                                               | the first (prototype hardcodes JSS 2)                           |

- Buttons: **Cancel**, **Prepare charges** (primary, receipt icon).
- On submit: the sheet closes, the result callout shows, and a toast:
  - created > 0 (success): `<n> charges ready to check.` with action **Check them** (to the round).
  - created = 0 (warning): `0 new, <s> already charged. Nobody was charged twice.`
- Without `invoice:bill`: "You need invoice:bill." (403; unreachable from the UI).

### Charge round

- Route `/finance/billing/$runId` (the prototype uses `/finance/billing` with a `run` param). Gate as the list. Not found → [404 state](#states).
- Header: breadcrumb **Charge students › `<BR number>`**; title `Charges <BR number>`; status badge; description `<term> · <scope label> · created by <name>`.
- Actions (draft only): **Send charges** (primary, send icon), gate `invoice:bill`, opens the send dialog. Overflow menu (draft only): **Cancel these charges** (destructive, ban icon), gate `invoice:bill`.
- Draft round whose term's fee lines changed after it was prepared: warning callout "Fees changed after these charges were prepared. Cancel and prepare again to use the new amounts." (rule 13).
- Under the header: a two-step stepper **Prepared → Sent** (the prototype prints the raw "draft", "issued"), or for a cancelled round a warning callout "This round was cancelled, so these students can be charged again."
- Summary line: `<n> charges · ₦<total> in total` (net of discount lines; in-scope charges only).
- Card titled **Check these charges** (draft) or **Charges** (sent or cancelled), count badge, flush table:

| Column    | Content                                                           |
| --------- | ----------------------------------------------------------------- |
| Student   | Avatar, name; below: `<admission no.> · <class arm for the term>` |
| Reference | The charge number in code, or muted "Given when sent"             |
| Fees      | `<k> fees` (count of fee lines; see gaps)                         |
| Total     | Charge total                                                      |
| Status    | Prepared, Sent or Cancelled                                       |

Rows open the charge ([52-charges](52-charges.md#charge-detail)). Paged 10.

### Send (dialog)

- Title `Send <n> charges?`; description `₦<total> for <term>`.
- Body: "Each charge is added to the student’s account and shows in Who owes." and a warning callout "Charges that are sent can’t be edited. A mistake is fixed with an approved fee reduction."
- Buttons: **Cancel**, `Send <n> charges` (primary, send icon, gate `invoice:bill`).
- Success toast: `<n> charges sent.` with action **See charges** (to Charges).

### Cancel these charges

- Menu item on a draft round. The prototype acts at once; the build adds a confirm dialog: title `Cancel <BR number>?`, body "These prepared charges are cancelled and the students can be charged again. Nothing was recorded in the books.", buttons **Keep them**, **Cancel these charges** (destructive).
- Toast (warning): `<BR number> cancelled. Only drafts can be cancelled.`

### States

- Loading: skeleton table. Error: `ErrorMessage`.
- Denied (403): tab and command-menu action hidden; route redirects.
- Not found (404): breadcrumb **Charge students › Not found**, title "Not found", empty state "No charge round here", "It may have been moved, or it may belong to a campus you don’t look after.", button **Back to charge students**.
- Read-only: Charge students, Send charges and Cancel these charges hidden.

### Entry points elsewhere

- Command menu **Charge students** (gate `invoice:bill`) opens this screen with the prepare sheet open.
- Home "today" tasks (home PRD) for `invoice:bill` holders: per draft round "Charges prepared for `<term>`, not sent yet" → **Check and send**; and "`<n>` student(s) not charged for `<term>` yet" → **Charge students**.
- Admission success toast: **Charge this student** (gate `invoice:bill`) opens this screen. A whole-school prepare then charges only the new student.
- Fee added toast on School fees: **Charge students**.

## Business rules

1. **Who is included** in a prepare, in order:
   1. Students with a `student_enrollment` in the term's school year with status `active` (not withdrawn or completed).
   2. Whose lifecycle is **Active**: not archived (left, graduated) and not **Inactive** (35 days or more since "not seen since"). Inactive students are skipped and not counted.
   3. In the caller's finance scope (current-term campus in campus scope).
   4. Matching the chosen scope: **Everyone I can see** (all of the above); **One campus**: the student's campus **for the round's term** (that term's placement, else the latest placement in the school year, else the home campus); **One level**: the enrolment's class level.
2. **Idempotent per (student, term).** A student who already has a `kind = 'term'` charge for the term that is not cancelled (prepared **or** sent) is skipped and counted as "already charged". The partial unique index on `invoice (student_id, term_id) WHERE kind = 'term' AND status <> 'cancelled'` enforces it; under a concurrent prepare the loser's insert does nothing and counts as skipped.
3. A student with no applicable lines ([50-fees](50-fees.md#business-rules) rule 6) gets no charge and is counted as "had no fees that apply".
4. A round is created **only if at least one charge is created**. A prepare that creates nothing writes no round and consumes no `BR-` number.
5. **Round number** `BR-<year>-<NNNN>` (4 digits) from `document_sequence` (kind `BR`), given at prepare; the year is the one the number is allocated in ([D-033](../technical-reference.md#decision-log)). Gaps are allowed (a cancelled round keeps its number).
6. Each prepared charge is a draft `invoice` (`kind = 'term'`, `number` null, `billing_run_id` set, `campus_id` = the student's campus for the term (rule 1.4), frozen at prepare, [D-041](../technical-reference.md#decision-log)) with lines copied from the applicable fee lines and the approved discounts ([52-charges](52-charges.md#business-rules) rules 1–4). Nothing posts at prepare.
7. **Default term** in the sheet: the first of [current term, next term] that is not already charged. " (already charged)" marks a term when every student the caller's "Everyone I can see" prepare would include already has a non-cancelled charge for it; " (partly charged)" when some do.
8. **Discount lines** at prepare: see [52-charges](52-charges.md#business-rules) rule 3. Only `approved` discounts within their term range apply; a pending one is ignored.
9. **Send** (`draft → issued`) in one transaction, with the round row locked (`SELECT … FOR UPDATE`):
   1. The round must be `draft`, else 409.
   2. For each draft charge in the round, ordered by student surname, first name, then admission number: take the next `CHG-<year>-<NNNNN>` (5 digits, `document_sequence` kind `CHG`), set `status = issued`, `issued_at`, `issued_by`, and post one journal entry (rule 10).
   3. Set the round `issued`, `issued_by`, `issued_at`.
   4. Either every charge in the round is sent and posted, or none is.
10. **Posting per charge** (data model, Posting rules, "Charge sent" and "Discount line"):
    - Reference = the charge number; kind `invoice`; `source_id` = invoice id; `effective_on` = the send date; `posted_by` = the sender; memo `Term fees · <student name>`.
    - For each invoice line with amount ≥ 0 (zero never occurs, rule 12): Dr **Fees owed to the school** (1100, `student_id`, `campus_id`) / Cr the line's fee-type income account (`campus_id`), both for the line amount.
    - For each discount line (amount < 0): Dr **Discounts given** (5000, `campus_id`) / Cr 1100 (`student_id`, `campus_id`), both for the absolute amount.
    - Lines are not netted: the entry mirrors the charge line for line.
    - `campus_id` on every line is the charge's `campus_id` (the student's placement campus for the charge's term).
    - The entry must balance (deferred trigger); a reference already posted returns the earlier entry and posts nothing [risk-001].
11. **Cancel** (`draft → cancelled`): only a draft round; every draft charge in it becomes `cancelled`. Nothing is posted, so nothing is reversed. Those students can be prepared again. A sent round can't be cancelled (409); a sent charge is corrected only by an approved fee reduction (M3.5).
12. Fee-line amounts are positive and discount lines are capped at their base ([52-charges](52-charges.md#business-rules) rule 3), so no invoice line is zero and a charge total is never negative.
13. Changing or retiring a fee line, or approving a discount, after a round is prepared does not change its drafts. To pick up the change, cancel the round and prepare again. While a draft round exists for a term, a later change to that term's fee lines shows the warning callout on the round, and the fee-change toast on School fees adds "A prepared round still uses the old amount."
14. A student who leaves or becomes inactive between prepare and send is still sent: the round is what was checked, and the bursar can cancel it.
15. **Scope on send and cancel.** Sending or cancelling a round that holds any charge outside the caller's campus scope answers 403 "This round includes students on campuses you don’t look after." A round is never split.

## Data

See [data-model-finance.md, Fees and charging](../brainstorming/data-model-finance.md#fees-and-charging).

- **New `billing_run`** as in the data model; `number` `UNIQUE (organization_id, number)`; `scope` `CHECK IN ('school','campus','level')`; **instead of the data model's single `scope_id`** (a campus id is text and a level id a uuid, so one column can't carry an FK): nullable `scope_campus_id` (composite FK to `campus`) and `scope_class_level_id` (FK to `class_level`), with a `CHECK` that exactly the one matching `scope` is set (both null for school); `CHECK (status IN ('draft','issued','cancelled'))`. **New columns:** `cancelled_by`, `cancelled_at` (who cancelled; the prototype doesn't record it).
- **New `invoice`** and **`invoice_line`** (shared with [52-charges](52-charges.md#data)). **New column** `invoice.campus_id` (composite FK to `campus`): the student's campus for the term, frozen at prepare. Not in the data model; needed for posting (rule 10) and round scope.
- `document_sequence` kinds `BR` and `CHG` (M3.1).
- Reads `fee_line`, `student_fee_option` (M3.2), `student_discount` (see Dependencies), `student_enrollment`, `enrollment_placement`, `student` lifecycle fields (M2.4, M2.5).
- Writes `journal_entry`, `journal_line` through the M3.1 posting service.

Migrations (M3.3): `create_billing_run`, `create_invoice` (with the partial unique index), `create_invoice_line`, `create_student_discount` (see Dependencies).

Policy: add `invoice: ['bill','read','readOwn']` to `statements.ts`; grant owner all, bursar `bill, read`, administrator and principal `read`, student and guardian `readOwn`.

## API

New module `apps/api/src/app/modules/billing` (rounds) beside `invoice` ([52-charges](52-charges.md#api)). The posting service comes from M3.1 as a ledger service in `common` ([D-042](../technical-reference.md#decision-log)), since a module may not import another module's internals.

| Method | Path                       | Permission     | Request                                                        | Response                                                                                                                                                                                                    | Errors                                                                                                                                                   |
| ------ | -------------------------- | -------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/billing-runs`            | `invoice:read` | query `page?`                                                  | `BillingRunSummary[]` (`id, number, termId, termName, scope, scopeLabel, chargeCount, totalMinor, createdBy, issuedAt, status`), counts and totals over in-scope charges; rounds with none in scope omitted | 403                                                                                                                                                      |
| GET    | `/billing-runs/terms`      | `invoice:read` | none                                                           | `[{ termId, name, charged: 'all' \| 'partly' \| 'none', isDefault }]` for the current and next term                                                                                                         | 403                                                                                                                                                      |
| GET    | `/billing-runs/:id`        | `invoice:read` | none                                                           | `BillingRun` with `charges: InvoiceSummary[]` (in scope), `totalMinor`                                                                                                                                      | 403; 404 not in school or no charge in scope                                                                                                             |
| POST   | `/billing-runs`            | `invoice:bill` | `{ termId, scope: 'school' \| 'campus' \| 'level', scopeId? }` | `{ runId: string \| null, number: string \| null, created, skipped, none, termId }`                                                                                                                         | 400 scope id missing or term not current/next; 403; 404 campus out of scope, level or term not in school                                                 |
| POST   | `/billing-runs/:id/issue`  | `invoice:bill` | none                                                           | `BillingRun` (issued) with `sentCount`, `totalMinor`                                                                                                                                                        | 403 (also when a charge in the round is outside the caller's scope, rule 15); 404; 409 "This round has already been sent." / "This round was cancelled." |
| POST   | `/billing-runs/:id/cancel` | `invoice:bill` | none                                                           | `BillingRun` (cancelled)                                                                                                                                                                                    | 403 (as above); 404; 409 "Only drafts can be cancelled."                                                                                                 |

POST `/billing-runs` is naturally idempotent (rule 2): a retried request creates nothing new and answers `created: 0`. Send and cancel are guarded by the status check under a row lock, and each posting by its unique reference.

## Acceptance criteria

1. Given first term already sent for everyone, when the bursar prepares First term for Everyone I can see, then no round is created, the info callout reads "Nothing new: `<s>` already charged. …", and the warning toast reads "0 new, `<s>` already charged. Nobody was charged twice."
2. Given no second-term charges, when the bursar prepares Second term for Everyone I can see, then one draft round `BR-2026-0002` exists with one prepared charge per included student, each with no number and "Given when sent".
3. Given that draft round, when the bursar sends it, then every charge gets a `CHG-2026-NNNNN` number, each posts one balanced entry with that reference, Ada's balance rises by her charge total, and the round shows Sent with today's date.
4. Given a sent Second term round, when the bursar prepares Second term again, then created = 0.
5. Given a draft round, when the bursar prepares the same term again, then its students count as already charged (drafts count).
6. Given a draft round, when it is cancelled, then its charges show Cancelled, nothing is in the journal, the callout "This round was cancelled, so these students can be charged again." shows, and a new prepare charges those students.
7. Given a sent round, when cancel or send is called again, then 409 and nothing is posted.
8. Given two sends of the same draft round at the same moment, then exactly one succeeds and each charge posts once.
9. Given Uche Mba is Inactive and Bola Johnson has Left, when the school is prepared, then neither gets a charge and neither is counted as skipped.
10. Given Ada has an approved 5% sibling discount on tuition of ₦180,000, when she is prepared, then her charge has a line "Sibling discount (3 children) (5% of tuition)" of −₦9,000, and on send the entry has Dr 5000 ₦9,000 / Cr 1100 (Ada) ₦9,000 beside the fee lines.
11. Given the Lekki bursar prepares Everyone I can see, then only students whose current-term campus is Lekki are included, and every journal line of their charges carries `campus_id` Lekki.
12. Given the Ikeja bursar, when they list rounds, then a round holding only Lekki charges is not listed and its URL answers 404.
13. Given an administrator with `invoice:read`, when they open Charge students, then the list and rounds show but Charge students, Send charges and Cancel these charges don't, and POST answers 403.
14. Given school B's round id, when school A's owner opens it, then 404.
15. Given a draft Second term round, when the bursar changes JSS 2 Tuition for Second term, then the round shows "Fees changed after these charges were prepared. Cancel and prepare again to use the new amounts." and its drafts keep the old amount.
16. Given the owner's whole-school draft round, when the Lekki bursar sends or cancels it, then 403 "This round includes students on campuses you don’t look after." and nothing changes.
17. Given only the Lekki campus has Second term charges, when the owner opens the prepare sheet, then Second term reads "(partly charged)"; for the Lekki bursar it reads "(already charged)".

## Tests

- Unit (`nx run api:test`): inclusion filter (rule 1, each branch); result counting (created, skipped, none); default-term choice; scope label.
- Integration (`api:test-integration`) [tenancy-002] [testing-002]:
  - Isolation for `billing_run`, `invoice`, `invoice_line` and every route: other school 404; other campus 404 (round with no in-scope charges) or omitted from lists.
  - Permission: `invoice:read` without `bill` → 403 on POSTs; acting read-only → 403.
  - Money: the partial unique index blocks a second non-cancelled term charge; concurrent prepares (two transactions) create one charge per student; send posts one balanced entry per charge with reference = number; resend 409 with no new entries; cancel posts nothing and frees the students; posting with a reused reference returns the earlier entry; every journal line on 1100 carries `student_id`; Σ debits = Σ credits per entry; the student balance after send equals the previous balance plus the charge total.
  - Numbering: `BR-` and `CHG-` come from `document_sequence`, per school (school B starts its own sequence).
  - Lifecycle: inactive, left, graduated and withdrawn students are excluded.
- E2E (required, `eduvault-e2e`): bursar prepares Second term, opens the round, checks a charge, sends it, sees the charges in Charges and the balance in Who owes; prepares again and sees "Nothing new"; prepares, cancels, prepares again.

## Open decisions

| #   | Question                                                                                                                                                                                                           | Recommendation                                                                                                                                      | Confidence                                                   | Decided                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | Should the Earlier rounds list show rounds from other campuses? The prototype lists every round, with zero charges when none are in scope.                                                                         | Omit rounds with no charge in scope; counts and totals over in-scope charges only.                                                                  | High                                                         | Adopted                                                                       |
| 2   | Order in which `CHG-` numbers are given on send.                                                                                                                                                                   | Student surname, first name, admission number.                                                                                                      | Medium: deterministic; the prototype uses enrolment order.   | Adopted                                                                       |
| 3   | Can someone send or cancel a round that holds charges outside their campus scope (for example the owner's whole-school round opened by a campus bursar)? The prototype sends all of the round's drafts regardless. | 403 "This round includes students on campuses you don’t look after." Options: send only the in-scope part (splits a round); allow.                  | Medium                                                       | Adopted                                                                       |
| 4   | Campus for a next-term round when the student has no placement for that term yet. The prototype falls back to the home campus.                                                                                     | Use the latest placement in the school year (else home campus), freeze it on the charge.                                                            | Medium: the data model doesn't define a placement-less term. | [D-041](../technical-reference.md#decision-log): campus frozen at prepare     |
| 5   | "(already charged)" marks a term as charged when any round for it was sent, even a one-campus round.                                                                                                               | Mark it only when every included student in the caller's scope has a charge for the term; else show "(partly charged)".                             | Medium                                                       | Adopted                                                                       |
| 6   | When a fee changes while a round is a draft, should the bursar be told?                                                                                                                                            | Warn on the round ("Fees changed after these charges were prepared. Cancel and prepare again to use the new amounts.") and in the fee-change toast. | Medium                                                       | Adopted                                                                       |
| 7   | Cancel has no confirmation in the prototype.                                                                                                                                                                       | Add the confirm dialog above.                                                                                                                       | High: one click throws away a prepared round.                | Adopted                                                                       |
| 8   | Send a charge for a student who left or became inactive after prepare?                                                                                                                                             | Send as prepared (the round is what was checked); the bursar can cancel the round.                                                                  | Low                                                          | Adopted                                                                       |
| 9   | Year in `CHG-`/`BR-` numbers: calendar year, or the school year's start year? The prototype hardcodes 2026.                                                                                                        | Calendar year of the date the number is given (`document_sequence` is per year).                                                                    | Medium                                                       | [D-033](../technical-reference.md#decision-log): year the number is allocated |
| 10  | An individual round for one student, with a pro-rata line for mid-term admission (data model "Still open"); the prototype has a "Student:" scope label but no option.                                              | Not in M3.3; a whole-school prepare charges a late admission at full fees.                                                                          | Medium                                                       | Adopted                                                                       |

## Prototype gaps noticed

- The Level option list hardcodes school year `s2627` and defaults to `jss2`.
- The stepper prints raw states "draft", "issued"; use "Prepared", "Sent".
- The "Fees" column counts every line including discount lines ("3 fees" for two fees and a discount).
- The "Nothing new" callout says "Every student you can see already has a charge" even when the reason is that students had no fees that apply.
- Cancel acts with no confirmation (#7) and doesn't record who cancelled.
- Earlier rounds lists out-of-scope rounds (#1); the round view never 404s for them.
- "(already charged)" is per term, not per scope (#5).
- Send ignores scope (#3).
- `effective_on` of the charge entry is the send date, not the term start; Who owes and statements order by it.

## Dependencies

- M3.2 fee lines and opt-ins ([50-fees](50-fees.md)).
- M3.1 ledger core: `ledger_account`, `journal_entry`, `journal_line`, the deferred balance trigger, `document_sequence`, and a posting service exported from `common` that refuses a reused reference.
- M2.4, M2.5: enrolments, placements, lifecycle (Active and Inactive).
- **`student_discount`**: M3.3 creates the table and applies approved rows at prepare (seeded in dev); M3.5 adds the request screens and approvals ([55](55-discounts-and-refunds.md)).
- Charges list and detail: [52-charges](52-charges.md), same slice.

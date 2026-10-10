# PRD: Discounts and refunds

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M3.3` (the `student_discount` table and applying approved discounts to charges); `M3.5` (discount and correction screens, approvals, refunds, payment cancellations list) (see [roadmap](README.md))
- Related: [data-model-finance.md](../brainstorming/data-model-finance.md) (Decisions: discounts and scholarships, second person; `adjustment`, `student_discount`, `payment_void`; Posting rules; Settings), [data-model-overview.md](../brainstorming/data-model-overview.md) (Rules every table follows: approval columns), [53-payments.md](53-payments.md), [54-who-owes-and-statements.md](54-who-owes-and-statements.md), [57-approvals.md](57-approvals.md), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-007](../technical-reference.md#decision-log), [D-013](../technical-reference.md#decision-log), [D-025](../technical-reference.md#decision-log), [D-027](../technical-reference.md#decision-log), [D-032](../technical-reference.md#decision-log), [D-043](../technical-reference.md#decision-log)

## Summary

Where staff ask for money corrections that need a second person: reducing a fee, cancelling a balance that won't be paid, refunding credit a family holds, and standing discounts for a student (a sibling discount, a scholarship). One person asks, someone with approval rights says yes in [Approvals](57-approvals.md), and only then does anything post, unless the school has switched that approval off. The page also lists payment cancellations asked for from receipts.

## Who uses it

| Persona                      | Permission(s)                                             | What they can do here                                                                       |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Bursar (Chika, Lekki)        | `adjustment:read`, `adjustment:create`, `payment:void`    | See and ask for corrections and discounts for Lekki students; see cancellation requests     |
| Principal (custom)           | `adjustment:read`, `adjustment:approve`, `campus:readAll` | See everything here; approve or decline in Approvals. Can't create (no `adjustment:create`) |
| Owner                        | all                                                       | Everything; approves in Approvals, never their own requests                                 |
| Administrator, teacher       | none                                                      | No access                                                                                   |
| Super admin acting read-only | read permissions                                          | Lists only                                                                                  |

Scopes applied:

- Corrections and discounts are visible when their student is in the viewer's finance scope (current-term placement campus, else home campus).
- Payment cancellations are visible when the payment is visible (any allocation in scope, [53](53-payments.md)).
- Out of scope answers 404 [tenancy-001]; in scope without the permission answers 403.

## Screens

### Discounts and refunds

- Route `/finance/adjustments`, web-admin, not a nav item: the second sub-tab under the Finance nav item **Payments** ("Payments", "Discounts and refunds"). Phase F1, gate `adjustment:read`. Breadcrumb: Finance › Payments › Discounts and refunds. The **Payments** nav item's count includes this page's items the viewer can approve ([57](57-approvals.md) rule 14).
- Command menu (⌘K): "Discount or refund" (hint "Finance"), with `adjustment:create`; opens this page with the request sheet open.
- Header: title "Discounts and refunds"; description "Refunds, discounts and corrections. One person asks, a boss approves."; action depends on the tab: **New request** (primary, plus, `adjustment:create`) on Refunds and corrections, **New discount** (primary, plus, `adjustment:create`) on Discounts, none on Cancelled payments.
- Tabs (URL `?tab=corrections|voids|discounts`, default corrections). Each label carries the number of waiting items in it when above zero:
  1. "Refunds and corrections"
  2. "Cancelled payments"
  3. "Discounts"

#### Tab: Refunds and corrections

- Card "Refunds and corrections". Table, newest first, 10 per page:

  | Column   | Content                                                                                         |
  | -------- | ----------------------------------------------------------------------------------------------- |
  | Student  | Avatar, name, admission number                                                                  |
  | Kind     | Badge: "Reduce a fee", "Cancel a balance" (outline), "Refund"                                   |
  | Reason   | The reason; when declined, a second line in the destructive colour "Declined: {decline reason}" |
  | Amount   | ₦ amount                                                                                        |
  | Asked by | Avatar and name                                                                                 |
  | Status   | "Waiting", "Approved" (tip "Approved by {name}" when there is an approver), "Declined"          |
  | (link)   | "See in Approvals" while waiting                                                                |

- Empty: "No adjustments" (scale icon).
- **New request** sheet:
  - Title "Discount or refund"; description "A boss must approve it before it takes effect." (when the chosen kind's approval is switched off, the build says "This goes through straight away; approval is switched off for it.").
  - Fields:

    | Field                | Control                                                                                                                                              | Required         | Default                                                       | Validation                                                                                                                                                                                                                                                |
    | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Kind                 | select: "Reduce a fee" (`credit_note`), "Cancel a balance" (`write_off`), "Refund" (`refund`)                                                        | yes              | Reduce a fee, or Refund when opened from "Pay the extra back" | Hint "Credit note reduces a charge · write-off gives up a debt · refund pays back credit held."                                                                                                                                                           |
    | Student              | select, first option "Choose a student", then in-scope students "{name} · {GF-0123}" by name                                                         | yes              | the student it was opened for                                 | "Choose a student and enter an amount."                                                                                                                                                                                                                   |
    | Amount (₦)           | decimal text                                                                                                                                         | yes              | the credit held when opened from "Pay the extra back"         | Above zero: "Choose a student and enter an amount." Refund above credit held: "A refund pays back credit held. {name} holds ₦{credit} credit." Cancel a balance above the balance owed: "You can cancel at most what {name} owes: ₦{balance}." (new copy) |
    | Which charge         | select, for Reduce a fee only: "Not tied to a charge", then the student's sent charges "{CHG-2026-00012} · {term or items} · ₦{total}", newest first | no               | Not tied to a charge                                          | One of the student's sent charges                                                                                                                                                                                                                         |
    | Reason               | textarea, placeholder "Shown on the statement"                                                                                                       | yes              | empty                                                         | Not blank                                                                                                                                                                                                                                                 |
    | Accounts used        | collapsed disclosure (book icon)                                                                                                                     | —                | collapsed                                                     | —                                                                                                                                                                                                                                                         |
    | Credit note posts to | select: "5000 Discounts given", then each income category "{code} {name}" (fee types, Store sales)                                                   | for Reduce a fee | 5000 Discounts given                                          | Must be one of the listed                                                                                                                                                                                                                                 |
    | Refund paid from     | select of money accounts for recording                                                                                                               | for Refund       | the first (the prototype hardcodes GTBank)                    | Must be one of the listed                                                                                                                                                                                                                                 |

  - Buttons: **Cancel** (ghost), **Submit for approval** (primary, send).
  - On submit, approval switched on: saved as Waiting with its `ADJ-2026-0004` number; toast (success) "Submitted. A boss must approve it." with an **Approvals inbox** action.
  - On submit, approval switched off for that kind: approved at once with no approver, posts; toast (success) "Done. This request type does not need approval, so it was applied straight away."
  - Without the permission: "You need adjustment:create." (the build hides the action; the API answers 403).

#### Tab: Cancelled payments

- Card "Payment voids", description "Once approved, the receipt is marked cancelled and kept, and the family owes that money again." Table, newest first:

  | Column       | Content                                                     |
  | ------------ | ----------------------------------------------------------- |
  | Receipt      | Ban icon, receipt number linking to the receipt, payer name |
  | Amount       | The payment amount                                          |
  | Reason       | The reason given                                            |
  | Requested by | Avatar and name                                             |
  | Status       | "Waiting", "Approved", "Declined"                           |
  | (link)       | "See in Approvals" while waiting                            |

- Empty: "No voids requested" (ban icon).
- Requests start from the receipt ([53](53-payments.md), Request void).

#### Tab: Discounts

- Card "Discounts and scholarships", description "Approved discounts are taken off the next charge. Charges already sent don’t change." Table (not paginated in the prototype; the build paginates at 10):

  | Column   | Content                                                                                                                                        |
  | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
  | Student  | Avatar, name, admission number                                                                                                                 |
  | Discount | Badge with a percent icon: "{5}% {tuition}" (fee type in lower case) or "{5}% charge" for the whole charge; "₦{15,000} off" for a fixed amount |
  | Reason   | The reason                                                                                                                                     |
  | Terms    | "{First term, 2026/2027} onward", or "{Second term, 2026/2027} to {Third term}"                                                                |
  | Asked by | Avatar and name                                                                                                                                |
  | Status   | "Waiting", "Approved", "Declined", or "Ended" (tip "Last applies in {term}") for a discount stopped with **End discount**                      |
  | (link)   | "See in Approvals" while waiting                                                                                                               |

- Empty: "No discounts" (percent icon).
- **New discount** sheet:
  - Title "New student discount"; description "Applies at the next round of charges once approved."
  - Fields:

    | Field      | Control                                                                                                      | Required | Default       | Validation                                                                             |
    | ---------- | ------------------------------------------------------------------------------------------------------------ | -------- | ------------- | -------------------------------------------------------------------------------------- |
    | Student    | select, "Choose a student" then in-scope students                                                            | yes      | none          | "Choose a student and enter a value."                                                  |
    | Kind       | select: "Percentage" (`percent`), "Fixed amount (₦)" (`fixed`)                                               | yes      | Percentage    | —                                                                                      |
    | Value      | decimal text, placeholder "10 or 15,000"                                                                     | yes      | empty         | Above zero: "Choose a student and enter a value."; a percentage at most 100 (new rule) |
    | Applies to | select: each live fee type under Fee income (Tuition first, then by code), then "Whole charge" (no fee type) | yes      | Tuition       | One of the listed                                                                      |
    | From       | select of terms (rule 12)                                                                                    | yes      | the next term | Must be the current term or later                                                      |
    | Until      | select: "No end", then the From term and every later term that exists                                        | no       | No end        | Not before From                                                                        |
    | Reason     | text, placeholder "e.g. Staff child"                                                                         | yes      | empty         | Not blank                                                                              |

  - Buttons: **Cancel** (ghost), **Submit for approval** (primary, send).
  - On submit, approval on: saved as Waiting; toast (success) "Discount submitted for approval."
  - On submit, approval off: approved at once; toast (success) "Discount applied. It shows on the next round of charges."

- **End discount** (row action, ghost, `adjustment:create`) on an approved discount that still applies to the current or a later term. Dialog: title "End this discount?"; description "{student} · {discount}"; field **Last term it applies to** (select of the current term and later terms up to its Until, default the current term); body "Charges already sent don’t change. Later charges no longer get this discount."; buttons **Cancel** (ghost), **End discount** (primary). No approval is needed (rule 20). Toast (success) "Discount ended. It last applies in {term}."

- States for the whole page: loading skeletons; error through `ErrorMessage`; denied: the sub-tab and route are hidden; acting read-only: lists render, no New request or New discount.

## Business rules

1. **Kinds.** An adjustment is a fee reduction (`credit_note`), a cancelled balance (`write_off`) or a refund (`refund`), for one student, with an amount above zero and a reason ([`adjustment`](../brainstorming/data-model-finance.md#fees-and-charging)).
2. **Numbering.** Each adjustment gets `ADJ-{year}-{0001}` from `document_sequence` when it is created; declined ones keep their number (gaps allowed).
3. **Nothing posts until approved.** A waiting or declined adjustment or discount changes no balance.
4. **Posting on approval** (finance doc [Posting rules](../brainstorming/data-model-finance.md#posting-rules)), reference = the adjustment number, every student line with `student_id` and the student's current placement campus:
   - Reduce a fee: Dr the chosen account (5000 Discounts given by default, or an income category) / Cr Fees receivable.
   - Cancel a balance: Dr 5100 Bad debt / Cr Fees receivable.
   - Refund: Dr Fees receivable / Cr the chosen money account (its campus, null if school-wide).
5. **Refund cap.** A refund can't exceed the credit the student holds, checked when asked and again when approved; if credit has since been used (a new charge), approval answers 409 and nothing posts.
6. **Cancel a balance cap.** Can't exceed the balance owed when asked (400) or when approved (409).
7. **Reduce a fee** may exceed what is owed; the excess becomes credit. It may name one of the student's sent charges ("Which charge", stored as `adjustment.invoice_id`) so the statement and the charge page can show which charge was reduced; anything else answers 400.
8. **Accounts allowed.** "Credit note posts to" is 5000 or an income category that is not retired and not the fee-income group; "Refund paid from" is a non-gateway money account that is school-wide or in the requester's scope.
9. **Approval switch.** When the school has switched off approval for that kind, the record is approved on creation with `approved_by` null ([D-007](../technical-reference.md#decision-log)) and posts in the same transaction. Switching a kind off leaves requests already waiting as they are ([D-027](../technical-reference.md#decision-log)).
10. **Second person.** Approving or declining needs `adjustment:approve` and is refused for the creator (409 "You created this. Someone else must approve it.", [D-013](../technical-reference.md#decision-log), with the database checks in [03](03-foundation-ledger-and-documents.md) rules 13 and 14 as backstop). Declining needs a reason; the record keeps it ([57](57-approvals.md)).
11. **Discount shape.** `percent` (0 < value ≤ 100) or `fixed` (amount above zero, minor units), on one live fee type under Fee income or the whole charge, from a term, optionally until a term (inclusive).
12. **From-term options** are the current term and every later term that exists, in order; the default is the term after the current one, or the current term when it is the last that exists. Discounts can't start in a past term.
13. **When a discount applies.** Only approved discounts apply, when a charge is prepared for a term within the discount's range (by session then term order), as a negative invoice line on `discounts_given` ([`student_discount`](../brainstorming/data-model-finance.md#fees-and-charging)). Charges already sent never change. A waiting discount shows as a warning on the School fees preview ([50-fees.md](50-fees.md#preview-for-one-student)). The application ships in M3.3 ([51-charge-students.md](51-charge-students.md)).
14. **Discount amount.** Percent of the sum of that fee type's lines (or of every fee line for the whole charge; discount lines are never part of a base, [D-043](../technical-reference.md#decision-log)), rounded half up to the nearest minor unit. A fixed discount is capped at that base, so a charge line never goes below zero (new rule; the prototype doesn't cap).
15. **Description on the charge**: "{reason} ({5}% of {tuition|the charge})" for a percent, "{reason}" for a fixed amount.
16. **Several discounts** on one student all apply, each on its own base and capped at it ([D-043](../technical-reference.md#decision-log)). Taken in order of approval time, a later discount is cut so that together they never exceed the fee lines they apply to, which keeps the charge total at or above zero ([52](52-charges.md#business-rules) rules 3 and 4).
17. **Payment cancellations** follow [53](53-payments.md) rules 11 to 16; this page lists them.
18. **Never deleted.** No delete for adjustments, discounts or cancellations. Waiting requests can't be edited; a wrong one is declined and asked again.
19. **Acting read-only** writes answer 403.
20. **Ending a discount** sets its last term (`to_term_id`) to the chosen term, with `ended_at` and `ended_by`, without approval: it only ever raises future charges. The last term can't be before the current term or after the existing Until. Charges already prepared or sent don't change.

## Data

- `adjustment`, `student_discount`: [Fees and charging](../brainstorming/data-model-finance.md#fees-and-charging), with the one approval column shape ([D-025](../technical-reference.md#decision-log)): `created_by`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`.
- `payment_void`: [53](53-payments.md).
- `school_setting` approval switches (`refund`, `write_off`, `credit_note`, `discount`, `payment_void`): [Settings](../brainstorming/data-model-finance.md#settings).

Migrations: M3.3 creates `student_discount` (including `ended_at` and `ended_by`); M3.5 adds `adjustment` and the approval switch columns on `school_setting`.

New or changed, not in the data-model docs (flagged):

- `student_discount.ended_at`, `ended_by` (rule 20).
- `adjustment.money_account_id` must be in scope; nothing new, but its composite FK to the school is needed.

## API

Module `adjustment` (corrections and discounts). Contract: `contract.adjustments`, `contract.studentDiscounts`. Payment-cancellation routes are in [53](53-payments.md#api).

| Method | Path                               | Permission           | Request                                                                                      | Response                                                                                                                                                                  | Errors                                                                                                                                                                                                             |
| ------ | ---------------------------------- | -------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/finance/adjustments`             | `adjustment:read`    | query `status`, `kind`, `studentId`, `page`                                                  | `{ items: [{ id, number, kind, student, amountMinor, reason, status, createdBy, approvedBy, rejectionReason, ledgerAccountId, moneyAccountId }], total, waitingCount }`   | 403                                                                                                                                                                                                                |
| GET    | `/finance/adjustments/:id`         | `adjustment:read`    | —                                                                                            | adjustment with `journalEntryId`                                                                                                                                          | 403; 404                                                                                                                                                                                                           |
| POST   | `/finance/adjustments`             | `adjustment:create`  | `{ kind, studentId, amountMinor, reason, ledgerAccountId?, moneyAccountId?, invoiceId? }`    | 201 `{ adjustment, autoApproved }`                                                                                                                                        | 400 zero amount, blank reason, account not allowed, refund above credit (`{ creditMinor }`), write-off above balance, `invoiceId` not a sent charge of the student; 403; 404 student or money account out of scope |
| POST   | `/finance/adjustments/:id/approve` | `adjustment:approve` | —                                                                                            | 200 adjustment with `journalEntryId`                                                                                                                                      | 403; 404; 409 self-approval; 409 not waiting; 409 refund now above credit held                                                                                                                                     |
| POST   | `/finance/adjustments/:id/decline` | `adjustment:approve` | `{ reason }`                                                                                 | 200                                                                                                                                                                       | 400 blank reason; 403; 404; 409 self-approval; 409 not waiting                                                                                                                                                     |
| GET    | `/finance/discounts`               | `adjustment:read`    | query `status`, `studentId`, `page`                                                          | `{ items: [{ id, student, kind, value, feeType: { id, name } \| null, reason, fromTerm, toTerm, status, createdBy, approvedBy, rejectionReason }], total, waitingCount }` | 403                                                                                                                                                                                                                |
| POST   | `/finance/discounts`               | `adjustment:create`  | `{ studentId, kind, value, ledgerAccountId: string \| null, fromTermId, toTermId?, reason }` | 201 `{ discount, autoApproved }`                                                                                                                                          | 400 value out of range, past term, to before from, fee type not under fee income; 403; 404 student out of scope                                                                                                    |
| POST   | `/finance/discounts/:id/approve`   | `adjustment:approve` | —                                                                                            | 200                                                                                                                                                                       | 403; 404; 409 self-approval; 409 not waiting                                                                                                                                                                       |
| POST   | `/finance/discounts/:id/decline`   | `adjustment:approve` | `{ reason }`                                                                                 | 200                                                                                                                                                                       | 400; 403; 404; 409 self-approval; 409 not waiting                                                                                                                                                                  |
| POST   | `/finance/discounts/:id/end`       | `adjustment:create`  | `{ lastTermId }`                                                                             | 200 discount                                                                                                                                                              | 400 term before the current term or after its Until; 403; 404; 409 not approved                                                                                                                                    |

Approve and decline use a conditional update `WHERE status = 'submitted'`; zero rows answers 409.

## Acceptance criteria

1. Given Chika, when she asks to reduce Ada's fee by ₦10,000 with reason "Late enrolment", then it is saved as Waiting with an `ADJ-` number, Ada's balance is unchanged, and the toast offers **Approvals inbox**.
2. Given the principal approves it, then the entry `ADJ-…` posts Dr 5000 / Cr Fees receivable ₦10,000 for Ada, and the statement shows a Reduced row "Reduce a fee: Late enrolment".
3. Given Chika chooses "4010 Tuition" under Accounts used, then on approval the debit goes to 4010.
4. Given Bola owes ₦12,000, when Chika asks to cancel ₦12,000, then on approval Dr 5100 Bad debt / Cr Fees receivable posts and Bola's balance is zero.
5. Given Bola owes ₦12,000, when Chika asks to cancel ₦15,000, then the API answers 400 and the sheet shows "You can cancel at most what Bola … owes: ₦12,000."
6. Given David holds ₦5,000 credit, when Chika asks to refund ₦6,000, then "A refund pays back credit held. David … holds ₦5,000 credit."
7. Given a ₦5,000 refund is waiting and a new charge uses David's credit, when the principal approves, then the API answers 409 and nothing posts.
8. Given a ₦5,000 refund approved from GTBank, then Dr Fees receivable / Cr GTBank posts, David's balance is zero, and the GTBank cash book shows ₦5,000 out.
9. Given refund approval is switched off, when Chika submits a refund, then it posts at once with `approved_by` null and the toast reads "Done. This request type does not need approval, so it was applied straight away."
10. Given the owner (who holds `adjustment:approve`) created a request, when she tries to approve or decline it, then the API answers 409 "You created this. Someone else must approve it."
11. Given a declined request with reason "Not agreed with the owner", then the corrections table shows "Declined: Not agreed with the owner" under the reason and status "Declined".
12. Given Chika submits a 50% tuition scholarship for Halima from Second term, then it shows "50% tuition", "Second term, 2026/2027 onward", Waiting, and nothing changes on charges already sent.
13. Given it is approved, when Second term is charged, then Halima's charge carries a negative line "{reason} (50% of tuition)" posted to 5000.
14. Given a fixed ₦300,000 discount on tuition of ₦180,000, when the charge is prepared, then the discount line is ₦180,000, not more.
15. Given a value of 120 with Percentage, then the API answers 400.
16. Given the current term is First term, then From offers First, Second and Third term of 2026/2027 (and later terms that exist), defaulting to Second term.
17. Given an Ikeja student's adjustment id, when Chika opens it, then 404.
18. Given the Cancelled payments tab, when a void is waiting, then the tab label shows "1" and the row links to the receipt and to Approvals.
19. Given an approved 10% PTA fee discount from First term with no Until, when Chika ends it with last term First term, then Second term charges carry no line for it, First term charges keep theirs, and no approval is asked.
20. Given a discount from Second term until Third term, 2026/2027, when First term, 2027/2028 is charged, then it doesn't apply.
21. Given approved 60% and 50% tuition discounts on tuition of ₦180,000, when the charge is prepared, then the lines are −₦108,000 and −₦72,000 (the second cut to what is left) and the charge total stays at or above zero.
22. Given Chika reduces Ada's fee and picks CHG-2026-00012 under Which charge, then the adjustment keeps that charge; a charge of another student answers 400.

## Tests

- Unit: discount amount (percent rounding, fixed cap, whole charge vs one fee type, several discounts capped); term-range check by session and term order; from-term options; posting lines per kind. Web: sheet defaults from "Pay the extra back"; tab counts; conditional sheet description.
- Integration (`api:test-integration`):
  - Isolation for `adjustment` and `student_discount`: another school's ids answer 404 on every route; another campus's student answers 404 for create, read, approve and decline.
  - Money: each kind posts the right balanced entry with the adjustment number as reference; a declined request posts nothing; posting is once even if approve is sent twice (one 200, one 409).
  - Refund cap at request and at approval; write-off cap.
  - Self-approval refused by the service (409) and by the DB check on a direct update.
  - Switched-off approval leaves `approved_by` null and posts at once.
  - Permissions: 403 for each route without its permission; acting read-only writes 403.
- E2E (required, `eduvault-e2e`): bursar asks for a refund from "Pay the extra back", principal approves it in Approvals, the statement and cash book update; bursar submits a discount and it appears as Waiting.

## Open decisions

| #       | Question                                             | Options                                                                                                                                     | Recommendation                                                                                                            | Confidence                                 | Decided                                                                             |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| OD-55-1 | Link a reduction to a specific charge (`invoice_id`) | (a) No picker (prototype); (b) optional "Which charge" select of the student's sent charges                                                 | (b) optional: the statement and charge page can then show which charge was reduced                                        | Low: nothing in the prototype needs it yet | Adopted                                                                             |
| OD-55-2 | Caps on Reduce a fee and Cancel a balance            | (a) No caps (prototype); (b) cap Cancel a balance at the balance owed, leave Reduce a fee uncapped; (c) cap both                            | (b): cancelling more than is owed makes no sense, while a fee reduced after payment legitimately creates credit to refund | Medium                                     | Adopted                                                                             |
| OD-55-3 | Which fee types a discount can target                | (a) Tuition only or the whole charge (prototype); (b) any fee type under fee income                                                         | (b), defaulting to Tuition: the model already allows any fee type and schools discount the bus or PTA too                 | Medium                                     | Adopted                                                                             |
| OD-55-4 | An "Until" term on the discount form                 | (a) None, open-ended (prototype form); (b) optional Until select                                                                            | (b): the model and the seeded scholarship ("Second term to Third term") use it                                            | High                                       | Adopted                                                                             |
| OD-55-5 | Several discounts for one student                    | (a) All apply, combined total capped at the base; (b) only the largest applies; (c) refuse overlapping discounts on the same fee type       | (a): a sibling discount and a scholarship can both be real; the cap keeps the charge non-negative                         | Medium                                     | [D-043](../technical-reference.md#decision-log): all apply, each capped at its base |
| OD-55-6 | Stopping an approved discount early                  | (a) Not possible (prototype); (b) "End discount" setting the last term, with `adjustment:create` and no approval; (c) the same but approved | (b): ending a discount only ever raises future charges, so it carries no fraud risk                                       | Medium                                     | Adopted                                                                             |
| OD-55-7 | Status word for a declined request                   | (a) "Rejected" (prototype status) vs "Declined" (Approvals buttons and toast)                                                               | Use "Declined" everywhere on screen; keep `rejected` in the model                                                         | High                                       | Adopted                                                                             |

## Prototype gaps noticed

- The request sheet always says "A boss must approve it before it takes effect.", even when that kind's approval is switched off.
- The Kind hint uses accounting words ("Credit note", "write-off") the rest of the screen avoids.
- "Refund paid from" defaults to the GTBank account by id.
- No cap on cancelling more than is owed; no re-check of the refund cap at approval.
- A fixed discount can exceed the fee and make a charge line negative.
- Percentage values above 100 are accepted.
- The From select is hardcoded to Second and Third term of 2026/2027.
- No Until field, though the model and the seed use one.
- Applies to offers only Tuition or the whole charge.
- No way to end or edit a discount.
- Auto-approved records name the requester as approver, against D-007.
- Statuses say "Rejected" while Approvals says "Decline".
- The discounts table isn't paginated.

## Dependencies

- M3.1 ledger core ([56](56-money-accounts-and-categories.md)) and M3.4 payments ([53](53-payments.md)).
- M3.3 creates `student_discount` and applies approved rows at prepare; this slice adds the screens, the end action and approvals.
- M3.5 Approvals queue ([57](57-approvals.md)) for approve and decline.
- `school_setting` approval switches (rule 9).

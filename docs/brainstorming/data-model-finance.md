# Data model: financial recording

- Status: brainstorm (not yet an ADR)
- Date: 2026-10-09
- Part of: [data model overview](data-model-overview.md), aligned to the brand prototype

## Goal

Record what each student owes and pays, what the campus store sells, and where the school's money sits, so that the bursar never keeps a side spreadsheet and no naira can move twice or disappear. Full accounting (payroll, depreciation, budgets, a formal balance sheet) is out of scope, but the ledger is double-entry, so it stays reachable. School expenses come in a later phase (F1b).

## Words on screen

The UI uses plain words; the model keeps the accounting names.

| Model                          | On screen                                                      |
| ------------------------------ | -------------------------------------------------------------- |
| Invoice; draft, issued         | Charge; Prepared, Sent                                         |
| Billing run                    | Charge students; a round of charges                            |
| Fee line; its category         | Fee; fee type. Tuition is "School fees", the rest "Other fees" |
| Student balances               | Who owes; Owing, Paid up, In credit ("extra paid")             |
| Adjustment                     | Discounts and refunds                                          |
| Credit note; write-off; refund | Reduce a fee; Cancel a balance; Refund                         |
| Payment void                   | Cancel a payment; "Cancellation waiting"                       |
| Ledger accounts; journal       | Money categories; "For your accountant"                        |
| Payment allocation             | Split across children                                          |

## Decisions taken

| Question                   | Answer                                                                                                                                                                             | Rejected, and why                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Scope                      | Student fees, store sales and stock value on one append-only ledger; school expenses in a later phase                                                                              | Fees only (store sales and stock off the books); full accounting (a Xero-sized build)                             |
| Payment channels           | Recorded offline (cash, bank transfer, POS); the school switches each way to pay on or off, keeping at least one. Proof is required for a transfer                                 | Gateway in v1 (webhooks and settlement on day one); offline forever (no parent self-service)                      |
| Ledger shape               | `journal_entry` + balanced `journal_line`s; balances derived                                                                                                                       | Signed rows per student (no trial balance); stored balances (drifted in the old app)                              |
| Books and money accounts   | One set of books per school; every line tagged with `campus_id`; named money accounts (cash, bank, POS), each with its own ledger account                                          | Books per campus (shared costs need transfers); no money accounts (can't tell cash on hand from bank)             |
| Student account shape      | Charges are the bill; the balance is derived from the ledger; payments are matched to charges oldest-first in reports                                                              | Running wallet (no bill to show parents); strict allocation per charge (awkward for advances and lump sums)       |
| Fee schedule granularity   | Lines by level × term × fee type, with an optional campus override, an applies-to rule and opt-in lines                                                                            | One total per level (the old app's "unexplained total" pain); custom per student (unmanageable)                   |
| Discounts and scholarships | Per-student rules applied when charging, shown as negative lines; one-off reductions are approved fee reductions                                                                   | Manual credits only (forgotten each term); none in v1 (needed within a term)                                      |
| Second person              | Payment cancellations, fee reductions, cancelled balances, refunds, discounts and store write-offs wait for an approver, each kind switchable by the school; payments post at once | Approval on every payment (blocks the bursar at the till); no switch (the prototype makes it the school's choice) |
| Creating charges           | The bursar runs **Charge students**: prepare, check, send; idempotent per (student, term); sent charges never edited                                                               | Automatic at term start (late fee changes bill wrongly); editable charges (ledger and charge drift)               |
| Balances over time         | Debt and credit carry forward (shown as "brought forward"); students who left stay on Who owes                                                                                     | Close each session to an arrears account (an extra step); leavers drop off (debt vanishes)                        |
| Chart of accounts          | Seeded system accounts that postings rely on; schools add fee types under fee income                                                                                               | Fully school-editable (postings need mapping); fixed by code (no school categories)                               |
| Lump sum for siblings      | One payment and one receipt, split across children; one journal entry with a credit line per child                                                                                 | A payment per child (three receipts for one transfer); guardian credit pool (a second balance holder)             |
| Store sales                | Charged and paid in one action at the store, so the balance doesn't move; stock at cost on the books, with cost of sales on each sale                                              | Charge now, pay later (the prototype takes payment at the store); quantities only (no stock value or profit)      |

## Model

Every table also has `id`, `organization_id`, `created_at` and `updated_at` unless noted. FKs from these tables use `ON DELETE RESTRICT`.

### Accounts

| Table            | Key columns                                                                                                                        | Constraints and notes                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledger_account` | `code`, `name`, `type` (asset, liability, equity, income, expense), `parent_id`, `system_key`, `retired_at`                        | `UNIQUE (organization_id, code)`; `UNIQUE (organization_id, system_key)`. A row with `system_key` is seeded, can't be retired, and its type is fixed |
| `money_account`  | `ledger_account_id`, `campus_id` (nullable = school-wide), `name`, `kind` (cash, bank, pos, gateway), `bank_name`, `account_last4` | Creating one creates its asset ledger account under 1200, so its balance is a ledger sum. `gateway` waits for the gateway phase                      |

Seeded system accounts per school:

| Code | Name                             | Type      | `system_key`                        |
| ---- | -------------------------------- | --------- | ----------------------------------- |
| 1100 | Fees owed to the school          | asset     | `fees_receivable`                   |
| 1200 | Money accounts (group)           | asset     | none (parent of each money account) |
| 1300 | Store stock (books and uniforms) | asset     | `store_stock`                       |
| 2100 | Refunds owed to families         | liability | `customer_credit_refunds`           |
| 3000 | Opening balance                  | equity    | `opening_balance_equity`            |
| 4000 | Fee income                       | income    | `fee_income`                        |
| 4500 | Store sales                      | income    | `store_sales`                       |
| 5000 | Discounts given                  | expense   | `discounts_given`                   |
| 5100 | Bad debt                         | expense   | `bad_debt`                          |
| 5200 | Cost of store items sold         | expense   | `store_cost`                        |
| 5300 | Store stock losses               | expense   | `store_losses`                      |

- Fee types are children of 4000 (Tuition 4010, PTA fee, School bus, Development levy, Laboratory fee, Excursion levy, Graduation fee). A new one takes the last child's code plus 10 and needs `ledger:manageAccounts` or `feeLine:create`. 2100 and the "Other charges" fee type are kept in the books but not listed on Money categories until a screen uses them.
- Later phases add `library_income` and `operating_expenses` (with expense categories under it).

### Journal

| Table           | Key columns                                                                                                                                                                                                                          | Constraints and notes                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journal_entry` | `reference`, `kind` (invoice, payment, payment_void, adjustment, opening, store, store_receive, store_cost, store_count; later expense, library), `source_id`, `effective_on`, `posted_at`, `posted_by`, `memo`, `reverses_entry_id` | `UNIQUE (organization_id, reference)`. Never updated or deleted. `effective_on` is the business date (the day a payment was made); `posted_at` is when it was recorded |
| `journal_line`  | `entry_id`, `ledger_account_id`, `student_id` (nullable), `campus_id` (nullable), `debit_minor`, `credit_minor`                                                                                                                      | `CHECK` exactly one of debit/credit is positive. A deferred constraint trigger checks that each entry's debits equal its credits at commit (a `CHECK` can't span rows) |

A student's balance is `SUM(debit_minor - credit_minor)` over `journal_line` rows on `fees_receivable` with that `student_id`. A positive balance is owed by the student; a negative one is credit held, "taken off the next fees automatically, or paid back".

### Fees and charging

| Table                | Key columns                                                                                                                                                                                                                                                                                                                          | Constraints and notes                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fee_line`           | `term_id`, `class_level_id`, `campus_id` (nullable = every campus), `ledger_account_id` (the fee type), `name`, `amount_minor`, `applies_to` (all, new, returning), `is_optional`, `retired_at`                                                                                                                                      | A campus line overrides the every-campus line with the same fee type. "New" means `student_enrollment.is_new_student`. A changed amount applies from the next round; sent charges never change. Retired lines are kept. Replaces `fee_schedule` |
| `student_fee_option` | `enrollment_id`, `fee_line_id`                                                                                                                                                                                                                                                                                                       | Opt-ins for optional lines (bus, excursion)                                                                                                                                                                                                     |
| `student_discount`   | `student_id`, `kind` (percent, fixed), `value`, `ledger_account_id` (null = whole charge), `reason`, `from_term_id`, `to_term_id` (nullable), `status` (submitted, approved, rejected), `created_by`, `approved_by`, `rejected_by`, `rejection_reason`                                                                               | Only approved discounts apply, within their term range, as a negative `invoice_line` posted to `discounts_given`. A percent is taken on the lines of its fee type, or the whole charge. A pending discount shows as a warning on the preview    |
| `billing_run`        | `number` (`BR-2026-0001`), `term_id`, `scope` (school, campus, level; later student), `scope_id`, `status` (draft, issued, cancelled), `created_by`, `issued_by`, `issued_at`                                                                                                                                                        | "Whole school" means every campus the bursar can see. Created only if at least one student gets a new charge. Cancelling a draft round cancels its draft charges, and those students can be charged again                                       |
| `invoice`            | `student_id`, `term_id`, `billing_run_id` (nullable), `kind` (term, store, adhoc; later library), `number` (`CHG-2026-00042`, null until sent), `status` (draft, issued, cancelled), `issued_at`, `issued_by`, `journal_entry_id`                                                                                                    | Partial unique `(student_id, term_id) WHERE kind = 'term' AND status <> 'cancelled'` makes charging idempotent. The number is given when sent. Only drafts can be cancelled                                                                     |
| `invoice_line`       | `invoice_id`, `fee_line_id` (nullable), `student_discount_id` (nullable), `ledger_account_id`, `description`, `amount_minor` (negative for discounts)                                                                                                                                                                                | Copied from the fee lines when the charge is prepared, and frozen. Nothing posts until the charge is sent                                                                                                                                       |
| `adjustment`         | `number` (`ADJ-2026-0001`), `kind` (credit_note, write_off, refund), `student_id`, `invoice_id` (nullable), `ledger_account_id` (credit notes), `money_account_id` (refunds), `amount_minor`, `reason`, `status` (submitted, approved, rejected), `created_by`, `approved_by`, `rejected_by`, `rejection_reason`, `journal_entry_id` | Posts only once approved, or at once when the school has switched that kind's approval off. A refund can't exceed the credit held. One approval shape for every correction                                                                      |

Charging includes only students with an active enrolment in the term's session who are not inactive. A student admitted mid-term is charged on their own (an individual round, with an optional pro-rata line, is still to come). "Brought forward" on a charge is computed when it is displayed, from the balance before it was sent; "due at issue" is brought forward plus the charge. Neither is an invoice line.

### Payments

| Table                | Key columns                                                                                                                                                                                                                                                                                                                           | Constraints and notes                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payment`            | `reference` (`TRF-20261002-0001`, editable), `receipt_number` (`RCT-2026-00088`), `payer_guardian_id` (nullable), `payer_name`, `money_account_id`, `method` (cash, transfer, pos, gateway), `provider_reference`, `proof_key`, `amount_minor`, `paid_on`, `recorded_by`, `status` (posted, void_pending, voided), `journal_entry_id` | `UNIQUE (organization_id, reference)`; `UNIQUE (organization_id, provider_reference)` when present. A transfer needs proof (PDF or image). Only methods the school has switched on can be recorded                                |
| `payment_allocation` | `payment_id`, `student_id`, `amount_minor`                                                                                                                                                                                                                                                                                            | Allocations sum to the payment amount. Prefilled with each child's outstanding balance; an edited amount is spread child by child up to what each owes, and any surplus goes to the first child as credit. Part payments are fine |
| `payment_void`       | `payment_id`, `reason`, `status` (submitted, approved, rejected), `created_by`, `approved_by`, `rejected_by`, `rejection_reason`, `journal_entry_id`                                                                                                                                                                                  | `UNIQUE (payment_id)`. The payment shows "Cancellation waiting". On approval, posts the mirror entry (reference `VOID-<payment reference>`) and marks the payment voided; on rejection, the payment goes back to posted           |
| `payment_intent`     | `reference`, `provider`, `provider_reference`, `student_ids`, `amount_minor`, `status` (pending, paid, failed, expired), `checkout_url`, `payment_id`                                                                                                                                                                                 | Later: gateway. `payment_id` is set once, so a repeated webhook can't post twice                                                                                                                                                  |

Matching payments to charges for "what's unpaid" is computed oldest-first at read time, not stored.

### Settings

Finance columns on `school_setting` (see the [overview](data-model-overview.md#foundation-model)):

- **Approval rules:** one switch per kind (`refund`, `write_off`, `credit_note`, `discount`, `payment_void`), all on by default. Store write-offs follow the `write_off` switch. Approvers are the owner and anyone holding `adjustment:approve`; nobody approves their own request.
- **Payment rules:** which ways to pay are on (cash, transfer, POS), at least one. A school-wide sibling discount rule ("5% off for each child when a family has three or more") is shown but not active.
- **Receipt wording:** `receipt_footer` and `signoff`.

### Expenses (F1b)

| Table      | Key columns                                                                                                                                                                                                                                               | Constraints and notes                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `supplier` | `name`, `phone`, `email`, `retired_at`                                                                                                                                                                                                                    | Also linked from store deliveries once it exists                      |
| `expense`  | `campus_id` (nullable = school-wide), `supplier_id`, `ledger_account_id` (category), `money_account_id`, `title`, `amount_minor`, `incurred_on`, `receipt_ref`, `status` (submitted, approved, rejected), `created_by`, `approved_by`, `journal_entry_id` | Posts on approval: Dr category / Cr money account. Rejected rows stay |

The prototype has no expenses; this section keeps the earlier design for a later phase.

## Posting rules

Every line carries `campus_id`: for a student line, the student's placement campus for the term; for a money-account line, the account's campus (null if school-wide).

| Event                           | Debit                                 | Credit                            | Reference             |
| ------------------------------- | ------------------------------------- | --------------------------------- | --------------------- |
| Charge sent                     | Fees receivable (student)             | Each line's income account        | `CHG-…`               |
| Discount line (same entry)      | Discounts given                       | Fees receivable (student)         | `CHG-…`               |
| Payment                         | Money account                         | Fees receivable (each allocation) | payment reference     |
| Payment cancellation (approved) | Fees receivable (each allocation)     | Money account                     | `VOID-<reference>`    |
| Fee reduction (approved)        | Discounts given, or an income account | Fees receivable (student)         | `ADJ-…`               |
| Cancelled balance (approved)    | Bad debt                              | Fees receivable (student)         | `ADJ-…`               |
| Refund of credit (approved)     | Fees receivable (student)             | Money account                     | `ADJ-…`               |
| Opening debt                    | Fees receivable (student)             | Opening balance                   | `OPEN-<student_id>`   |
| Store sale: charge              | Fees receivable (student)             | Store sales                       | `CHG-…`               |
| Store sale: cost                | Cost of store items sold              | Store stock                       | `CHG-…-COST`          |
| Store sale: payment             | Money account                         | Fees receivable (student)         | payment reference     |
| Store delivery                  | Store stock                           | Money account                     | `DEL-…`               |
| Opening store stock             | Store stock                           | Opening balance                   | `OPEN-STORE-<campus>` |
| Stock count shortage (approved) | Store stock losses                    | Store stock                       | `CNT-…`               |
| Stock count surplus (approved)  | Store stock                           | Store stock losses                | `CNT-…`               |
| Expense (F1b, approved)         | Expense category                      | Money account                     | expense reference     |

## Invariants

- Every journal entry balances, enforced in the database.
- A reference posts at most once per school [risk-001]; a repeated reference returns the earlier result and posts nothing.
- Nothing in this pillar is updated after posting except status fields; corrections are new entries.
- Balances are always derived; there is no balance column anywhere.
- Approvers can't approve or decline their own request; a switched-off approval leaves `approved_by` null.
- Every line on a student's account carries `student_id`.
- Finance is campus-scoped, not class-scoped.

## Reports (all derived)

- **Who owes:** every student's balance, split into current students and those who left or graduated, with Owing, Paid up and In credit.
- **Student statement:** charges, payments and reductions with a running balance ("Charged", "Paid", "Reduced"). Store purchases appear as a charge and a payment.
- **Family statement:** a paying guardian's children together; each keeps their own account.
- **Money accounts:** balance and cash book per account.
- **Money categories:** the chart of accounts with balances, for the accountant; the journal entry behind each charge and receipt.
- **Dashboard:** charged this term, received, still owed.
- **Approvals:** the queue of items waiting, filtered by campus.
- Later: trial balance, income and expenses by category and campus, debtors by level and class.

## Still open

- Pro-rata rule for mid-term admissions, and an individual charge round for one student.
- Whether a withdrawal cancels future optional lines automatically.
- Receipt format and printable charge layout.
- Gateway choice (Paystack, Flutterwave or Monnify) when that phase comes.
- Whether the automatic sibling discount rule replaces per-student sibling discounts.
- Whether school-wide money accounts a campus bursar can record into should also appear in their money-accounts list.

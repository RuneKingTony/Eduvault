# PRD: Payments

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M3.4` (payments, receipts and their print view, what Payment rules do to recording), `M3.5` (asking to cancel a payment and its approval, both together, [D-032](../technical-reference.md#decision-log)) (see [roadmap](README.md))
- Related: [data-model-finance.md](../brainstorming/data-model-finance.md) (Payments, Settings, Posting rules, Invariants), [data-model-overview.md](../brainstorming/data-model-overview.md) (Rules every table follows), [56-money-accounts-and-categories.md](56-money-accounts-and-categories.md), [54-who-owes-and-statements.md](54-who-owes-and-statements.md), [55-discounts-and-refunds.md](55-discounts-and-refunds.md), [57-approvals.md](57-approvals.md), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-007](../technical-reference.md#decision-log), [D-008](../technical-reference.md#decision-log), [D-013](../technical-reference.md#decision-log), [D-020](../technical-reference.md#decision-log), [D-021](../technical-reference.md#decision-log), [D-022](../technical-reference.md#decision-log), [D-023](../technical-reference.md#decision-log), [D-026](../technical-reference.md#decision-log), [D-027](../technical-reference.md#decision-log), [D-028](../technical-reference.md#decision-log), [D-032](../technical-reference.md#decision-log), [D-033](../technical-reference.md#decision-log), [D-035](../technical-reference.md#decision-log), [D-036](../technical-reference.md#decision-log)

## Summary

The bursar records money received (cash, bank transfer or POS) the moment it arrives, as one payment and one receipt even when it covers several children. The payment posts at once, so the till is never blocked; undoing one is a request that a second person approves, and the receipt is kept. A school chooses which ways to pay it accepts ("Payment rules"), and a transfer can't be recorded without proof attached.

## Who uses it

| Persona                      | Permission(s)                                                       | What they can do here                                                                               |
| ---------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Bursar (Chika, Lekki)        | `payment:read`, `payment:record`, `payment:void`, `adjustment:read` | List payments for her campus's students, record payments, open receipts, ask to cancel one          |
| Bursar (Yemi, Ikeja)         | same                                                                | Same for Ikeja                                                                                      |
| Owner (Funmi)                | all                                                                 | Everything, and approve cancellations (in [57-approvals.md](57-approvals.md)); change Payment rules |
| Principal (custom)           | `payment:read`, `adjustment:approve`, `campus:readAll`              | List every payment, open receipts, approve cancellations. Can't record                              |
| Administrator                | `payment:read`, `campus:readAll`, `schoolAccount:read`              | List and open receipts; view Payment rules read-only                                                |
| Teacher, new hire            | none                                                                | No access                                                                                           |
| Guardian, student (portal)   | `payment:readOwn`                                                   | Their own payments, in the portal ([72-portal.md](72-portal.md), M3.7)                              |
| Super admin acting read-only | read permissions                                                    | Lists and receipts; no Record or Request void                                                       |

Scopes applied:

- A payment is visible when **any** student it is allocated to is in the viewer's finance scope (campus of the student's current-term placement, else home campus). Finance is never class-scoped.
- Out of scope answers 404 (receipt page, API); in scope without `payment:read` answers 403 [tenancy-001].
- The "Into" list on Record payment includes school-wide money accounts even for a campus-scoped bursar ([56](56-money-accounts-and-categories.md), rule 10).
- The guardian list and the split rows list only students in the recorder's scope.

## Screens

Payments is the Finance nav item **Payments** (section Finance, nav order 2, phase F1). Its sub-tab strip shows "Payments" and "Discounts and refunds", each only if the viewer can open it. The nav item shows a count of money approval items the viewer can approve (cancellations, reductions, cancelled balances, refunds, discounts), excluding their own, rolled up from Discounts and refunds ([D-036](../technical-reference.md#decision-log)); see [57-approvals.md](57-approvals.md#business-rules) rule 14.

Command menu (⌘K) quick action: "Record a payment" (hint "Finance"), shown with `payment:record`; opens Payments with the Record a payment sheet open.

### Payments list

- Route `/finance/payments`, web-admin, nav section Finance, nav order 2, phase F1, gate `payment:read`.
- Header: title "Payments"; description "Cash, transfer and POS payments recorded at the bursary."; info tip "A payment posts at once, so the till is never blocked. Undoing one is a void that a second person approves."; action **Record payment** (primary, plus), with `payment:record`.
- Summary line under the header (small, muted): "{n} receipts · ₦{sum} received" and, when any cancellation is waiting, " · {k} cancellation(s) waiting for approval". `n` and the sum count payments that are not cancelled (Recorded and Cancellation waiting).
- Card with a toolbar: search box, placeholder "Search receipt, payer or student" (matches receipt number, payer name, any allocated student's name, and our reference, case-insensitive); on the right "{n} receipts" for the filtered count.
- Table, newest first, 10 per page; the whole row opens the receipt:

  | Column  | Content                                                                                                                                                  |
  | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Receipt | Method icon (cash: banknote, transfer: landmark, POS: credit card), receipt number (monospace), and "{date} · {method}" ("Cash", "Bank transfer", "POS") |
  | Payer   | Payer name                                                                                                                                               |
  | For     | Avatar stack of allocated students; tooltip "Ada Okeke: ₦180,000, Chidi Okeke: ₦60,000, …"                                                               |
  | Into    | Money account label ("GTBank current ••4417", "Moniepoint POS, Lekki")                                                                                   |
  | Amount  | Bold amount; struck through and muted when cancelled                                                                                                     |
  | Status  | "Recorded", "Cancellation waiting" or "Cancelled"                                                                                                        |

- Empty: "No payments yet" (banknote icon) with **Record payment** as the action. With a search that matches nothing: "No receipts match", no action.
- States: loading skeleton; error through `ErrorMessage`; denied: nav item hidden, route redirects; acting read-only: no **Record payment**.

### Record a payment (sheet)

Opened from **Record payment** on Payments, from Who owes (row action and statement header, prefilled), and from the command menu. Requires `payment:record`.

- Sheet, large. Title "Record a payment"; description "Posts at once and issues a receipt."
- Fields, in order:

  | Field                 | Control                                                                                                                                                                                                                                         | Required                                   | Default                                                                            | Notes and validation                                                                                                                                                                                                                                                                                          |
  | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Payer                 | select: each guardian linked to at least one in-scope student, labelled "{name} ({n} child/children)" counting in-scope children only; then "Someone else"                                                                                      | yes                                        | the first guardian, or the paying guardian of the student the sheet was opened for | Hint "Pick a guardian to prefill each child’s outstanding balance." Changing it rebuilds the split rows                                                                                                                                                                                                       |
  | Payer name            | text, placeholder "e.g. Mrs Ojo"                                                                                                                                                                                                                | yes, only for Someone else                 | empty                                                                              | "Enter who paid."                                                                                                                                                                                                                                                                                             |
  | Student               | select of in-scope students "{name} · {GF-0123}", sorted by name                                                                                                                                                                                | only for Someone else                      | the student the sheet was opened for, else the first                               | Rebuilds the single split row                                                                                                                                                                                                                                                                                 |
  | Amount received (₦)   | decimal text                                                                                                                                                                                                                                    | yes                                        | sum of the split rows' outstanding balances                                        | Hint "Part payments are fine: enter what was actually paid." Empty or zero: "Enter the amount received."                                                                                                                                                                                                      |
  | Paid on               | date                                                                                                                                                                                                                                            | yes                                        | today                                                                              | Becomes `paid_on` and the entry's `effective_on`. Not after today (new rule)                                                                                                                                                                                                                                  |
  | Into                  | select of money accounts for recording (non-gateway, school-wide or in scope), labelled as in Money accounts                                                                                                                                    | yes                                        | the first (the prototype hardcodes GTBank)                                         | Must be one of the listed accounts                                                                                                                                                                                                                                                                            |
  | How they paid         | select of the methods switched on in Payment rules: "Cash", "Bank transfer", "POS"                                                                                                                                                              | yes                                        | the first switched-on method                                                       | A method switched off can't be recorded                                                                                                                                                                                                                                                                       |
  | Proof of transfer     | file; accepts JPEG, PNG, WebP, HEIC, PDF                                                                                                                                                                                                        | yes when the method is Bank transfer       | none                                                                               | Label "Proof of transfer (needed for bank transfers)". Hint "A photo, a screenshot from WhatsApp or the bank app, or a PDF. It is kept with the receipt." Missing: "Add the proof of transfer (a photo, screenshot or PDF) before recording." Wrong type: "The proof must be a photo, a screenshot or a PDF." |
  | Split across children | inset card, title "Split across children", description "One receipt. Share the amount between the children below." One row per child: student name with "owes ₦{balance}", and an amount input prefilled with what they owe (zero if in credit) | at least one row with an amount above zero | see rule 6                                                                         | Empty list: "No children in your scope."                                                                                                                                                                                                                                                                      |
  | References            | collapsed disclosure titled "References · {our reference}"                                                                                                                                                                                      | —                                          | collapsed                                                                          | —                                                                                                                                                                                                                                                                                                             |
  | Bank or POS reference | text, placeholder "e.g. GTB/FT/2610070031"                                                                                                                                                                                                      | no                                         | empty                                                                              | Hint "Optional. The number on the bank alert or POS slip." Already used: "Provider reference {ref} is already on {receipt}."                                                                                                                                                                                  |
  | Our reference         | monospace text                                                                                                                                                                                                                                  | yes                                        | generated (rule 3)                                                                 | Hint "Filled in for you. If the same payment is entered twice, it is only recorded once." Blank: "Enter a reference. It makes a retried request apply at most once."                                                                                                                                          |

- Live split line under the rows:
  - When the split total differs from the amount (destructive): "Split ₦{total} ≠ amount ₦{amount}".
  - When they match (success): "Split ₦{total} matches the amount", then " · part payment, ₦{rest} still owed after this" when the amount is less than what the children owe, or " · ₦{extra} extra kept as credit" when it is more.
- Buttons: **Cancel** (ghost), **Record payment** (primary, check).
- Validation order on submit (each shown as a destructive toast in the prototype, inline in the build): proof (for transfer), permission ("You need payment:record."), reference, duplicate reference (rule 4), amount, at least one split ("Split the payment across at least one student."), payer name, provider reference clash, split total ("Allocations add up to ₦{total} but the payment is ₦{amount}.").
- On success:
  - Posts the payment, issues the receipt number, and navigates to the receipt. Toast (success): "**{RCT-2026-00088}** recorded: ₦{amount} from {payer}." plus " ₦{extra} was paid in extra and is kept for the next fees." when any allocated child is now in credit.
  - Opened from a statement, the page stays on the statement and the toast carries a **View receipt** action.
  - A fresh reference is generated the next time the sheet opens.
- On a repeated reference: nothing posts; toast (warning) "Reference {ref} was already recorded as {receipt}. Nothing was posted twice."; the sheet closes and the existing receipt opens.

### Receipt

- Route: the prototype uses `/finance/payments?receipt={id}`; the build uses `/finance/payments/$paymentId` (nav false, parent Payments), gate `payment:read`.
- Breadcrumb: Payments › {receipt number}.
- Header: title "Receipt {RCT-2026-00088}"; status badge; description "₦{amount} from {payer} on {date}"; actions **Print receipt** (outline, printer icon), and from M3.5 **Request void** (destructive, ban icon) only when the status is Recorded, the payment is not a store sale's (rule 22) and the viewer has `payment:void`.
- Callouts, at most one of:
  - Right after recording (success): "Payment recorded. Entering it again by mistake will not record it twice."
  - Cancellation waiting (warning): "Cancellation asked for by {name}: “{reason}”. Waiting for a boss to approve it." with a link "See in Approvals".
  - Cancelled (destructive): "Cancelled, approved by {name}. The receipt is kept, and the family owes this money again." When the school's cancellation approval was switched off (approved_by null), the build says "Cancelled straight away (approval is switched off). The receipt is kept, and the family owes this money again."
- Main column:
  1. **Allocation** card (users icon). Table: Student (name and current class), Allocated, Balance now (red pill "₦{x}" when owing, "₦{x} extra paid" when in credit, "Paid up" at zero). Footer row "Total" with the payment amount. A row opens that student's statement (staff only). Students outside the viewer's scope are listed by name only, without balance or link (rule 14).
  2. **For your accountant: {reference}** collapsible card (book icon, description "Each money movement and the category it belongs to."). Table: Account (code and name), Student, Campus ("School-wide" when null), Debit, Credit; footer "Balanced" badge and totals. Shown to anyone who can open the receipt; no permission beyond `payment:read` ([D-022](../technical-reference.md#decision-log)).
  3. **For your accountant: VOID-{reference} (cancellation)**, the same, when cancelled.
- Side column, **Receipt** card (receipt icon), key-value list:
  - Receipt no.
  - Reference, with info tip "If this payment is entered twice with the same reference, it is only recorded once."
  - Provider ref. ("—" when none)
  - Method (icon and label)
  - Into
  - Recorded by (avatar and name)
  - Proof of transfer (transfers, and a store sale's POS slip): file name with a file icon, opening the file through `GET /files/:id` ([03](03-foundation-ledger-and-documents.md), [D-028](../technical-reference.md#decision-log)); or "Not uploaded (recorded before uploads were required)".
  - Store sale (store sale payments only): the `ISS-…` number, linking to the sale ([61-store.md](61-store.md)).
- Not found or out of scope: page title "Not found", breadcrumb Payments › Not found, empty state "No receipt here" (search icon), "It may have been moved, or it may belong to a campus you don’t look after.", button **Back to payments**.

### Receipt print view (M3.4)

- Route `/finance/payments/$paymentId/print` (nav false), opened from **Print receipt**; gate `payment:read`, same scope as the receipt. The page opens the browser's print dialog and is laid out for A5 portrait.
- Content, top to bottom: the school's logo, name, address and phone (School profile, [33](33-school-settings.md)); "Receipt {RCT-2026-00088}"; Paid on, Payer, How they paid, Our reference and Bank or POS reference; a table of Student, Class and Amount per allocation, with the Total; "Recorded by {name}"; the school's receipt footer (rule 23).
- A cancelled payment prints with a "Cancelled" mark beside the title and the date it was cancelled.
- Allocations to students outside the viewer's scope print by name and amount only, as on the receipt (rule 14).

### Request void (dialog, M3.5)

- Ships in M3.5 with its approval ([D-032](../technical-reference.md#decision-log)). From **Request void** on a Recorded receipt (`payment:void`). Not offered on a store sale's payment (rule 22).
- Title "Void receipt {RCT}?"; description "₦{amount} from {payer}".
- Body: "The receipt is kept. Once a boss approves, the payment is cancelled and the family owes that money again." Field **Reason**, textarea, required, placeholder "e.g. Keyed the wrong amount".
- Buttons: **Cancel** (ghost), **Request void** (destructive, ban).
- On submit, approval switched on: the payment becomes "Cancellation waiting"; toast (warning) "Void requested. It needs a second person’s approval." with an **Open voids** action (to Discounts and refunds › Cancelled payments) when the viewer has `adjustment:read`.
- On submit, approval switched off: the cancellation posts at once; toast (success) "Payment cancelled. The receipt is kept, and the family owes that money again." (new copy; the prototype shows the waiting toast either way).
- Errors: "A void already exists for this payment." (rule 11); without the permission "You need payment:void."
- Approving and declining happen in [57-approvals.md](57-approvals.md); the voids list is a tab of [55-discounts-and-refunds.md](55-discounts-and-refunds.md).

### Payment rules (settings)

The Payment rules screen, its route `/settings/payment-rules` and its layout belong to [33-school-settings.md](33-school-settings.md) (M3.4, [D-035](../technical-reference.md#decision-log)). This module relies on what the screen sets:

- **Ways to pay**: cash, bank transfer and POS, each switched on or off; only switched-on methods appear in "How they paid" and can be recorded (rule 8).
- **Proof**: a bank transfer can't be recorded without proof of transfer (rule 9); the switch description says so ("Staff add the proof of transfer when they record it.").
- **At least one way stays on** (rule 20).
- **Receipt footer**: printed at the bottom of every receipt's print view (rule 23).

## Business rules

1. **Posting.** A payment posts at once as one journal entry: Dr the money account (its campus, null if school-wide) for the full amount; Cr Fees receivable, one line per allocation, each with `student_id` and the student's placement campus for the current term (finance doc [Posting rules](../brainstorming/data-model-finance.md#posting-rules)). Entry `reference` = the payment's reference; `effective_on` = Paid on; memo "Receipt {RCT} · {payer}".
2. **Receipt number** comes from `document_sequence` kind receipt: `RCT-2026-00088`, per school and year (the year it is allocated, [D-033](../technical-reference.md#decision-log)), gaps allowed. Issued in the same transaction as the post.
3. **Our reference is client-generated** (as [D-008](../technical-reference.md#decision-log) does for store sales): format `{CSH|TRF|POS}-{YYYYMMDD}-{suffix}`, the prefix following the chosen method and regenerated when the method changes while the field is untouched; the suffix is 6 random base32 characters ([D-033](../technical-reference.md#decision-log); the prototype's 4 digits collide about 1 day in 8 at 50 payments a day). Staff may edit it. Shared rule: [03](03-foundation-ledger-and-documents.md) rule 9.
4. **Idempotency.** `UNIQUE (organization_id, reference)`. A request with a reference already used by a payment with the same payer, amount, money account, method, date and allocations returns the earlier payment with `replayed: true` and posts nothing. The same reference with a different payload answers 409 "Reference `{ref}` is already used by {receipt}." ([03](03-foundation-ledger-and-documents.md) rule 10, [D-033](../technical-reference.md#decision-log)).
5. **Allocations sum to the amount** exactly, each allocation is above zero, and each student is in the recorder's scope (404 otherwise). One payment, one receipt, one entry.
6. **Prefill and spread.** Each child's row prefills with what they owe (zero if paid up or in credit), and the amount with their sum. When the recorder edits the amount, it is spread child by child, in list order, up to what each owes; anything above the total owed goes to the first child as credit. Edited split rows stay as typed. This is a client behaviour; the server only checks rule 5.
7. **Part payments and overpayments are allowed.** An overpayment leaves the child in credit ("extra paid"), taken off the next fees automatically or refunded through [55](55-discounts-and-refunds.md).
8. **Methods.** Only methods switched on in Payment rules ([33](33-school-settings.md)) can be recorded (400 otherwise). `gateway` is not recordable by staff.
9. **Proof.** A bank transfer needs exactly one proof file (PDF, JPEG, PNG, WebP or HEIC) before it posts. The file is uploaded first through `POST /files` with kind `payment_proof` and the payment carries its id ([D-028](../technical-reference.md#decision-log)); the server checks the file belongs to this school and is not yet attached to another payment. Cash and POS recorded at the bursary take no proof: the POS terminal's own reference is enough. A store sale's POS slip is still kept as its payment's proof (rule 22).
10. **Provider reference** is optional and unique per school when present (`UNIQUE (organization_id, provider_reference)` partial on not null). A clash answers 409 with the receipt it is on.
11. **One cancellation at a time (M3.5).** A payment can be asked to be cancelled only while Recorded. While a request is waiting or once it is approved, another request answers 409. After a decline, a new request may be made.
12. **Cancellation states (M3.5).** Asking sets the payment to `void_pending` ("Cancellation waiting"). Approval posts the mirror entry and sets `voided` ("Cancelled"). Decline sets the payment back to `posted`. Nothing is deleted.
13. **Mirror entry (M3.5).** An approved cancellation posts reference `VOID-{payment reference}` with `reverses_entry_id` = the payment's entry, whose lines are the original lines with debit and credit swapped (same accounts, students and campuses), not recomputed from today's placements. Memo "Void of {RCT}: {reason}".
14. **Split across campuses.** A Lekki bursar sees a payment that also pays an Ikeja child. The allocation table names the Ikeja child but hides their balance and statement link; the API returns `inScope: false` for that row.
15. **Summary figures** on the list count only payments not cancelled. Whether a split payment counts in full or only the in-scope allocations for a campus-scoped viewer: in-scope allocations only (aligned with Who owes, see [54](54-who-owes-and-statements.md) rule 8).
16. **Approval switch (M3.5).** When the school has switched off approval for `payment_void`, the request is approved on creation with `approved_by` null ([D-007](../technical-reference.md#decision-log)) and the mirror entry posts in the same transaction. Switching it off leaves requests already waiting as they are ([D-027](../technical-reference.md#decision-log)).
17. **Approval rights (M3.5).** Approving or declining a cancellation needs `adjustment:approve`, never by the person who asked (409, [D-013](../technical-reference.md#decision-log); [57](57-approvals.md)).
18. **Paid on** can't be after today (Africa/Lagos, [D-023](../technical-reference.md#decision-log)). Backdating is allowed.
19. **Never deleted.** No delete endpoint exists for payments, allocations, cancellations or proof files.
20. **Payment rules** keep at least one of cash, transfer, POS switched on; the server refuses the change that would switch off the last one (400, [33](33-school-settings.md)).
21. **Acting read-only.** A super admin acting without a reason gets 403 on record, upload and void.
22. **Store sale payments.** A store sale ("Record student purchase", [61-store.md](61-store.md)) records its payment through this same path: one allocation to the student, payer = the paying guardian or "Family of {student}", its own reference and receipt. It appears in the Payments list, the summary and "Received this term", and its receipt shows the store sale number. The POS slip or transfer receipt uploaded at the store is that payment's proof. The dashboard's money tiles leave store sales out ([D-026](../technical-reference.md#decision-log)). A store sale's payment can't be cancelled on its own: a void request answers 409 "This payment is for a store sale. It can’t be cancelled on its own." (new copy, [D-020](../technical-reference.md#decision-log)), and its receipt has no Request void. Returning goods is a later store flow.
23. **Receipt footer.** Every receipt's print view ends with the school's receipt footer from Payment rules ([33](33-school-settings.md)); the default is "Thank you for your payment."

## Data

- `payment`, `payment_allocation`, `payment_void`: [Payments](../brainstorming/data-model-finance.md#payments).
- Journal tables and `document_sequence` from [56](56-money-accounts-and-categories.md).
- `school_setting` finance columns: payment-method switches and `receipt_footer` ([33](33-school-settings.md), M3.4), the `payment_void` approval switch (M3.5) ([Settings](../brainstorming/data-model-finance.md#settings)).
- `file_object` from the `FileStore` (M2.2, [03](03-foundation-ledger-and-documents.md)).

Migrations: M3.4 adds `payment` (with `proof_file_id`) and `payment_allocation`; the payment-method and receipt-footer columns on `school_setting` come with Payment rules in the same slice ([33](33-school-settings.md)). M3.5 adds `payment_void` and the approval switch column.

New or changed, not in the data-model docs (flagged):

- **Proof storage.** `payment.proof_file_id` (FK to `file_object`) replaces the data model's `proof_key` ([D-028](../technical-reference.md#decision-log); storage and upload flow in [03](03-foundation-ledger-and-documents.md)). One proof per transfer payment, viewable from the receipt by anyone who can see the payment.
- **`payment_void` uniqueness.** A partial unique `(payment_id) WHERE status IN ('submitted', 'approved')` replaces `UNIQUE (payment_id)`, so a new request can follow a decline (rule 11).
- **Telling a retry from a reused reference** (rule 4): a stored `payment.request_hash` of the business fields, or a comparison of the stored fields; [03](03-foundation-ledger-and-documents.md) owns the choice.

## API

Module `payment`. Contract: `contract.payments`, `contract.paymentVoids`. Proof files go through `POST /files` and `GET /files/:id` ([03](03-foundation-ledger-and-documents.md#api), [D-028](../technical-reference.md#decision-log)); payment rules through `GET` and `PATCH /school-settings` ([33](33-school-settings.md#api)). The void-request and payment-void routes ship in M3.5 ([D-032](../technical-reference.md#decision-log)).

| Method | Path                                  | Permission           | Request                                                                                                                                                                 | Response                                                                                                                                                                                                                                                                                                                                    | Errors                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/finance/payments`                   | `payment:read`       | query `q`, `status`, `page`                                                                                                                                             | `{ items: [{ id, receiptNumber, reference, paidOn, method, payerName, moneyAccount: { id, label }, amountMinor, status, allocations: [{ studentId, studentName, amountMinor }] }], total, summary: { receiptCount, receivedMinor, cancellationsWaiting } }`                                                                                 | 403                                                                                                                                                                                                                                                                                                                     |
| GET    | `/finance/payments/:id`               | `payment:read`       | —                                                                                                                                                                       | payment with `providerReference`, `recordedBy`, `proof: { fileName } \| null`, `allocations[]` (with `inScope`, `className`, `balanceMinor` when in scope), `void: { status, reason, createdBy, approvedBy } \| null`, `storeSale: { id, number } \| null`, `entry` and `voidEntry` lines ([D-022](../technical-reference.md#decision-log)) | 403; 404 other school or no allocation in scope                                                                                                                                                                                                                                                                         |
| POST   | `/finance/payments`                   | `payment:record`     | `{ reference, payerGuardianId?, payerName?, moneyAccountId, method, providerReference?, proofFileId?, amountMinor, paidOn, allocations: [{ studentId, amountMinor }] }` | 201 payment; 200 with `replayed: true` for an identical retry                                                                                                                                                                                                                                                                               | 400 split ≠ amount, zero amount, no allocation, missing payer, method switched off, transfer without proof, future date; 403; 404 student, guardian or money account out of scope; 409 reference reused with a different payload; 409 provider reference already used (`{ receiptNumber }`); 409 proof already attached |
| POST   | `/finance/payments/:id/void-requests` | `payment:void`       | `{ reason }`                                                                                                                                                            | 201 `{ void, autoApproved: boolean }`                                                                                                                                                                                                                                                                                                       | 400 blank reason; 403; 404 out of scope; 409 payment not Recorded, a request already waiting or approved, or the payment is a store sale's ([D-020](../technical-reference.md#decision-log))                                                                                                                            |
| GET    | `/finance/payment-voids`              | `adjustment:read`    | query `status`, `page`                                                                                                                                                  | `{ items: [{ id, payment: { id, receiptNumber, payerName, amountMinor }, reason, status, createdBy, approvedBy, rejectionReason }] }`                                                                                                                                                                                                       | 403                                                                                                                                                                                                                                                                                                                     |
| POST   | `/finance/payment-voids/:id/approve`  | `adjustment:approve` | —                                                                                                                                                                       | 200 void with `journalEntryId`                                                                                                                                                                                                                                                                                                              | 403 no permission; 404 out of scope; 409 self-approval ("You created this. Someone else must approve it."); 409 not waiting ("This has already been decided.")                                                                                                                                                          |
| POST   | `/finance/payment-voids/:id/decline`  | `adjustment:approve` | `{ reason }`                                                                                                                                                            | 200 void                                                                                                                                                                                                                                                                                                                                    | 400 blank reason; 403; 404; 409 self-approval; 409 not waiting                                                                                                                                                                                                                                                          |

The print view reads `GET /finance/payments/:id`, `GET /school-account` and `GET /school-settings`; it needs no route of its own. The record and void-request endpoints run in one transaction each: insert, post, number. Approve uses a conditional update `WHERE status = 'submitted'`; zero rows updated answers 409.

## Acceptance criteria

1. Given Ngozi has three children owing ₦180,000, ₦60,000 and ₦60,000, when Chika picks "Ngozi Okeke (3 children)", then three rows prefill with those amounts and the amount reads 300,000.
2. Given that sheet, when Chika changes the amount to 200,000, then the rows become 180,000, 20,000 and 0, and the line reads "Split ₦200,000 matches the amount · part payment, ₦100,000 still owed after this".
3. Given the amount is 320,000, then the rows become 200,000, 60,000, 60,000 and the line reads "… · ₦20,000 extra kept as credit".
4. Given a split that doesn't add up, when Chika submits, then nothing posts and the message reads "Allocations add up to ₦{x} but the payment is ₦{y}."
5. Given method Bank transfer and no file, when she submits, then nothing posts and the message reads "Add the proof of transfer (a photo, screenshot or PDF) before recording."
6. Given a `.docx` proof, then "The proof must be a photo, a screenshot or a PDF."
7. Given a valid transfer, when she submits, then one entry posts (Dr GTBank ₦300,000; Cr Fees receivable per child), the receipt with the next `RCT-2026-…` number opens with the success callout, and each child's balance drops by their share.
8. Given the same request is sent twice (double click or retry), then one payment, one receipt and one entry exist, and the second response is the first payment with `replayed: true`.
9. Given a reference already used for a different amount, when submitted, then the API answers 409 and nothing posts.
10. Given provider reference `GTB/FT/2609051183` is on RCT-2026-00088, when another payment uses it, then 409 "Provider reference GTB/FT/2609051183 is already on RCT-2026-00088."
11. Given POS is switched off in Payment rules, then "How they paid" offers Cash and Bank transfer only, and a POST with `method: 'pos'` answers 400.
12. Given Cash and POS are off, when the owner switches off Bank transfer, then it is refused with "Keep at least one way to record a payment."
13. Given Chika (Lekki), when she opens an Ikeja-only payment by URL, then she sees "No receipt here" and the API answers 404.
14. Given a payment split between a Lekki and an Ikeja child, when Chika opens it, then she sees both names, but the Ikeja row has no balance and no link.
15. (M3.5) Given a Recorded receipt and approval switched on, when Chika requests a void with reason "Keyed the wrong amount", then the status reads "Cancellation waiting", the warning callout names her and the reason, and Request void is gone.
16. (M3.5) Given that request, when Chika asks again, then 409 "A void already exists for this payment."
17. (M3.5) Given the principal approves it, then `VOID-{reference}` posts with the original lines swapped, the receipt reads "Cancelled", the amount is struck through, and the family's balance goes back up.
18. (M3.5) Given the request is declined, then the payment returns to "Recorded", and Chika can ask again with a new reason.
19. (M3.5) Given cancellation approval is switched off, when Chika requests a void, then the cancellation posts at once with `approved_by` null and the receipt says it was cancelled straight away.
20. Given the administrator (no `payment:record`), then no Record payment button, sheet or command-menu action appears, and POST answers 403.
21. Given Paid on is tomorrow, then the API answers 400.
22. (M3.5) Given the receipt of a store sale's payment, then it shows the `ISS-` number and no Request void, and a void request through the API answers 409 with nothing changed.
23. Given the school's receipt footer is "Thank you for your payment.", when Chika opens Print receipt, then the print view shows the school's name and logo, the allocations and total, and ends with that footer.
24. Given a cash payment, when it is recorded without proof, then it posts; given a transfer with a `proofFileId` already attached to another payment, then 409.

## Tests

- Unit: reference generator (prefix by method, format); spread algorithm (owing order, surplus to first child, zero owing); split line copy (match, part payment, extra); proof type check; payload hash for retries. Web: sheet prefill from a guardian and from "Someone else"; method list follows Payment rules.
- Integration (`api:test-integration`):
  - Isolation for `payment`, `payment_allocation`, `payment_void` (and `file_object` per 03): another school's ids answer 404 on every route.
  - Campus isolation: a payment with only Ikeja allocations is 404 for a Lekki bursar; a split payment is visible with `inScope` set per allocation; recording an allocation to an out-of-scope student answers 404; recording into a school-wide account as a campus bursar succeeds.
  - Money: entry balances; allocations sum; duplicate reference posts once (concurrent requests too); reference reuse with a different payload is 409; provider reference uniqueness; void mirror entry equals the swapped original; balances before and after.
  - Approval: self-approval answers 409 ([D-013](../technical-reference.md#decision-log)) and the DB `CHECK (approved_by <> created_by)` rejects a direct insert; a new request after a decline is accepted; a void request on a store sale's payment answers 409; two approvers racing produce one 200 and one 409; switched-off approval leaves `approved_by` null.
  - Payment rules: a switched-off method answers 400 (switching off the last method is tested with [33](33-school-settings.md)).
  - Permissions: 403 for each route without its permission; acting read-only writes 403.
- E2E (required, `eduvault-e2e`): bursar records a split transfer with proof and lands on the receipt; a double submit yields one receipt; bursar requests a void, principal approves it in Approvals, and the receipt shows Cancelled.

## Open decisions

Reference reuse and the reference suffix are decided in [D-033](../technical-reference.md#decision-log) and proof storage in [D-028](../technical-reference.md#decision-log), with the detail in [03-foundation-ledger-and-documents.md](03-foundation-ledger-and-documents.md), so they are not repeated here; numbering starts at 4.

| #       | Question                                                    | Options                                                                                                                       | Recommendation                                                                                                                                          | Confidence | Decided                                                                                             |
| ------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| OD-53-4 | Proof for POS                                               | (a) Transfers only (finance doc, this screen); (b) POS too (the store sale form already requires the POS slip)                | (a) for payments now, and align the store later: the POS terminal's own reference is enough at the bursary                                              | Medium     | Adopted                                                                                             |
| OD-53-5 | New cancellation request after a decline                    | (a) Never (prototype, `UNIQUE (payment_id)`); (b) allowed, with a partial unique on waiting or approved                       | (b): a declined request with a weak reason shouldn't lock a wrong payment forever                                                                       | Medium     | Adopted                                                                                             |
| OD-53-6 | Who sees the "For your accountant" journal card on receipts | (a) Anyone with `payment:read` (prototype); (b) only with `ledger:read`                                                       | (b): the administrator holds `payment:read` but not the categories                                                                                      | Medium     | [D-022](../technical-reference.md#decision-log): no extra gate (`payment:read`)                     |
| OD-53-7 | The sibling discount rule on Payment rules                  | (a) Show as "Not active yet" (prototype); (b) hide until built                                                                | (a), as designed; whether it replaces per-student sibling discounts stays open in the finance doc                                                       | High       | [D-021](../technical-reference.md#decision-log): hidden in production; sibling discount not shipped |
| OD-53-8 | Printable or shareable receipt                              | (a) None in M3.4; (b) a print view using `receipt_footer` and `signoff`                                                       | (b) in M3.4: parents expect a receipt and the settings already hold the footer; the format itself is still open in the finance doc                      | Medium     | Adopted, with the footer only (`signoff` isn't in v1, see [33](33-school-settings.md))              |
| OD-53-9 | Cancelling the payment of a store sale                      | (a) Allowed like any payment (prototype): the student then owes the store charge; (b) refused here, handled as a store return | (a): a wrongly keyed payment is a payment error, not a return; returning goods (stock back, charge reduced) stays a [61-store.md](61-store.md) question | Medium     | [D-020](../technical-reference.md#decision-log): refused (409); returns later                       |

## Prototype gaps noticed

- The reference is always generated with the transfer prefix (`finGenRef('transfer')`), whatever the method.
- The reference suffix is 4 random digits, and a reused reference with a different payload silently returns the old receipt.
- "Into" defaults to the GTBank account by id.
- Paid on accepts future dates.
- The payer list offers every guardian of an in-scope student, not only those marked as paying fees; that is fine, but the default is simply the first guardian in the list.
- The void toast says "It needs a second person’s approval." even when the school has switched that approval off and it was applied at once.
- Auto-approved cancellations record the requester as approver, against D-007, so "Cancelled, approved by {name}" names the requester.
- After a declined void, the payment can never be asked to be cancelled again.
- The cancellation entry is built from today's placements, not the original lines.
- Proof is stored as a file name only; there is no way to open it from the receipt.
- The receipt has no print or share view; `receipt_footer` and `signoff` are unused.
- The "Received" summary counts the whole amount of a split payment for a campus-scoped bursar.
- Validation messages appear as toasts; the build shows them inline on the field.
- The permission-error copy ("You need payment:record.") exposes a permission key; the build hides the action instead and the API answers 403.
- Store sales record their payment through the same function, so store receipts appear in Payments and can be voided from the receipt, but the store proof is kept on the sale, so a store transfer's receipt says "Not uploaded (recorded before uploads were required)".

## Dependencies

- M3.1 ledger core and money accounts ([56](56-money-accounts-and-categories.md)).
- M3.3 charges (balances to prefill; not strictly required to record a payment).
- M2.4 guardians and `guardian_student.pays_fees`.
- M3.5 ships cancellation requests together with their approval in the Approvals queue ([D-032](../technical-reference.md#decision-log)); M3.4 has no Request void.
- The `FileStore` and `/files` (M2.2, [03](03-foundation-ledger-and-documents.md), [D-028](../technical-reference.md#decision-log)) before transfers can be recorded.
- Payment rules ([33](33-school-settings.md), M3.4) for the method switches and the receipt footer; School profile (M2.2) for the print view's name and logo.

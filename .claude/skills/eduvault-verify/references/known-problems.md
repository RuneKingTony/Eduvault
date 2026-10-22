# Known problems (baseline)

Problems found by hand in manual testing. Each check asserts the behaviour the product should have, so the baseline run FAILs until #257 or #258 fixes it. Personas: [eduvault-e2e personas](../../eduvault-e2e/references/personas.md).

### KP-01 · browser · owner

Known: #257
Do: As `bursar` ask a payment void (flows: EDU-37 step 2), then as `owner` ask a void for another payment and open Approvals.
Expect: the owner's own request shows Approve and Decline (no "Your own" badge, no "You created this" message); approving it succeeds with the toast "Approved. The payment is cancelled and the receipt is kept."; the audit entry marks it as approved by its own requester.

### KP-02 · api · owner

Known: #257
Do: `POST /finance/payment-voids/<id>/approve` as `owner` on a void the owner asked.
Expect: 200, for every approval kind (`payment_void`, `credit_note`, `write_off`, `refund`, `discount`, `leave`, `store_write_off`).

### KP-03 · api · principal

Known: #257

Do: As `principal` request own leave (`POST /leave`) and `POST /leave/<id>/approve` as the same principal; then as `owner` approve the principal's leave, and request and approve the owner's own leave.

Expect: the principal's own approval answers 409 `SelfApproval` with a message that tells them another approver is needed; the owner approving the principal's leave is 200; the owner approving their own leave is 200. Only the owner is exempt.

### KP-04 · browser · bursar

Known: #257
Do: Press the submit button on Record payment, Record student purchase, store delivery, stock count, Request adjustment, Request discount, Billing run post, Money journal and Opening balances.
Expect: each opens a confirmation dialog first (amount and student or target named, Cancel and Confirm); Cancel records nothing; Confirm records once. Declining an approval asks for a reason.

### KP-05 · api · owner

Known: #257
Do: `POST` a leave request with each type from the form, then with a type outside sick, maternity and bereavement.
Expect: sick, maternity and bereavement answer 2xx; any other type answers 400; `GET` of the leave form options lists exactly those three.

### KP-06 · browser · bursar

Known: #257
Do: Open Request leave as a member.
Expect: the type select offers only Sick, Maternity and Bereavement.

### KP-07 · browser · bursar

Known: #258
Do: Open Record payment and choose the method Cash.
Expect: the "Into" field is hidden; the recorded payment's money account is the school's cash account (read it from `GET /finance/payments/<id>`). With no cash account the form shows a message to create one and does not submit.

### KP-08 · api · bursar

Known: #258
Do: `POST` a cash payment that names a bank account as `moneyAccountId`.
Expect: the stored payment is on the cash account, or the call is refused with 400; it is never recorded against the bank account.

### KP-09 · browser · bursar

Known: #258
Do: Create 30 students through the API (ledger them), open Record student purchase and type part of a student's name, then part of an admission number, into the student search.
Expect: a search field is present; the list narrows to matches for each; the chosen student stays visible; selecting one and submitting records the purchase for that student.

### KP-10 · browser · bursar

Known: #258
Do: Request a discount for Ada, approve it as `owner`, open Ada's statement; then edit the discount and end it.
Expect: no step shows an error toast; the request form saves; after approval Ada's balance drops by the discount; after the edit the balance follows the new amount; after End discount the balance is restored.

### KP-11 · api · bursar

Known: #258
Do: `POST` a discount request, `PATCH` it, and end it, each as `bursar`; read `GET /students/<id>/account` after each.
Expect: 2xx for each call and the balance matches the browser result in KP-10; as `foreign` the same ids answer 404.

### KP-12 · browser · owner

Known: #258
Do: Open Ada's profile in web-admin.
Expect: no "Optional fees" opt-in card; fee lines and charges still render.

### KP-13 · browser · owner

Known: #258

Do: Approve a discount that starts in Second term, then open End discount and end it with the default "Last term it applies to".

Expect: the last-term choices start at the discount's first term; ending before it starts is refused (API and UI). Found in the baseline: the dialog defaulted to First term and the toast read "It last applies in First term".

### KP-14 · browser · owner

Known: #257

Do: Open Settings, Approval rules.

Expect: the copy no longer says "Nobody can approve their own request" and states that only the owner can approve their own requests.

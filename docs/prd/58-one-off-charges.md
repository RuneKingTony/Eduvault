# PRD: One-off charges

- Status: draft (EDU-147, first phase: one-off charges; store charges from the Charges screen follow in their own issue)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53` (the Charges screen and its One-off kind; the New charge sheet is not in the prototype)
- Milestone and slice: `M3.8` (see [roadmap](README.md))
- Related: [52-charges.md](52-charges.md) (kinds, postings, numbering), [51-charge-students.md](51-charge-students.md), [61-store.md](61-store.md#sheet-record-student-purchase-m44) (the sheet and reference pattern this follows), [data-model-finance.md](../brainstorming/data-model-finance.md) (Fees and charging, Posting rules), [ADR 0008](../adr/0008-append-only-balanced-journal.md), [technical reference](../technical-reference.md) decisions [D-342](../technical-reference.md#decision-log) to [D-349](../technical-reference.md#decision-log), [D-041](../technical-reference.md#decision-log), [D-216](../technical-reference.md#decision-log), [D-290](../technical-reference.md#decision-log)

## Summary

A bursar adds a numbered, sent one-off charge (`CHG-…`) to one student's account from **Charges**: a school trip, a replacement ID card, a late-collection fee. The charge has one to twenty lines, each on a fee type, and is posted through the same pipeline as term and store charges. It carries a client reference, so a double click or a retry never charges twice.

## Who uses it

| Persona                       | Permission(s)     | What they can do here                                             |
| ----------------------------- | ----------------- | ----------------------------------------------------------------- |
| Owner                         | all               | Add a one-off charge for any student                              |
| Bursar (Lekki or Ikeja)       | `invoice:charge`  | Add a one-off charge for students on their campuses               |
| Administrator, Principal      | `invoice:read`    | See one-off charges; no **New charge** button, `POST` answers 403 |
| Teacher, member with no roles | none              | Not shown; route redirects                                        |
| Student, guardian             | `invoice:readOwn` | Not here                                                          |
| Acting super admin, no reason | read permissions  | Button hidden; `POST` answers 403 `ActingReadOnly`, audited       |

Gate `invoice:charge` ([D-342](../technical-reference.md#decision-log)), granted to the bursar starter role only. Scope: campus, never class. A student outside the caller's finance scope (the current campus is not in their campus scope, [D-041](../technical-reference.md#decision-log)) or in another school answers 404; without the permission, 403 [tenancy-001].

## Screens

### New charge (sheet)

- Opened from the **New charge** action on [Charges](52-charges.md#charges) (`/finance/invoices?new=1`). Gate `invoice:charge`; shown only to members who hold it.
- Sheet. Title **New charge**. Description "Adds a one-off charge to a student's account. It is sent at once and never changes."
- Opening the sheet makes the reference on the client: `ONEOFF-YYYYMMDD-` followed by the first 8 characters of a client UUID (`oneOffChargeReference(date, uuid)` in the contract). It is made once per open, kept across validation errors and retries, and made again only when the sheet is reopened.
- Fields:
  - **Student**: the student picker over students in the viewer's campus scope. Required.
  - **Term**: read-only, the current term (`<term>, <school year>`).
  - **Lines**: one row at first, repeatable up to 20:
    - **Fee type**: select of the school's active fee types (children of 4000). Required.
    - **Description**: text, 1 to 300 characters after trimming. Required.
    - **Amount**: naira, greater than zero, at most two decimals. Required.
    - A remove button per row (hidden while one row is left) and **Add line** (disabled at 20).
  - **Total**: the sum of the lines, `₦<total>`.
- Buttons: **Cancel** (ghost) and **Add charge** (primary, gate `invoice:charge`). **Add charge** is disabled while the request is in flight.
- Validation (shown in the sheet; the request is not sent):
  - No student: "Choose a student."
  - A line without a fee type: "Choose a fee type."
  - A blank or too-long description: "Describe the charge." and "Keep the description under 300 characters."
  - A missing, zero or negative amount: "Enter an amount above zero."
- On success: the sheet closes, toast (success) "Charge `<CHG-…>` added", and the app opens the charge detail (`/finance/invoices/$invoiceId`). The invoices, the student's account and the dashboard charge queries are refreshed.
- Same reference already posted with the same body (retry or double submit): the server returns the earlier charge and posts nothing. Toast (warning) "This charge was already added." The sheet closes and the charge opens.
- Refusals (toast, danger; the sheet stays open): the server message for a reused reference with another body, a student off the roll, no current term, or a fee type not found.
- States: loading (term and fee types), error (`ErrorMessage` in the sheet), read-only (acting super admin without a reason: no button).

The Charges list and detail are unchanged except as listed in [52-charges](52-charges.md): a one-off charge shows kind **One-off**, its line descriptions in **For**, and **Sent** from creation.

## Business rules

1. **Who and where.** `POST /invoices` needs `invoice:charge`. The student must be in the caller's finance scope; otherwise 404 with the existing invoice student-not-found message. Every query filters by `ctx.organizationId` and the campus scope.
2. **Term.** The charge belongs to the school's current term at creation ([D-343](../technical-reference.md#decision-log)). With no current term the API answers 409 and the sheet shows the message. Another term cannot be chosen.
3. **Campus.** `invoice.campus_id` is the student's current campus at creation (current-term placement, else the home campus), frozen like every charge's campus ([D-343](../technical-reference.md#decision-log), [52](52-charges.md#business-rules) rule 6).
4. **Lines.** One to 20 lines. Each is `{ feeTypeId, description, amountMinor }`: the description trimmed, 1 to 300 characters, the amount a positive integer in minor units, at most ₦10,000,000,000 so a charge total stays an exact number ([D-346](../technical-reference.md#decision-log)). The total is the sum of the lines. A one-off charge has no discount lines.
5. **Fee types.** Each `feeTypeId` must be an active child of 4000 from the fee-type list, so **Other charges** (4060) is not offered. An unknown, retired or other-school fee type answers 404 "Fee type not found". Each line debits 1100 and credits its fee type ([52](52-charges.md#business-rules) rule 6).
6. **Who can be charged.** Only a student on the roll (not Left or Graduated). An archived or departed student answers 409 "Only students on the roll can be charged." ([D-347](../technical-reference.md#decision-log)).
7. **Sent at once.** The charge is created `issued` with its `CHG-` number, `issued_at`, `issued_by` and journal entry in one transaction. There is no Prepared state, edit, cancel or delete; a mistake is fixed with an approved fee reduction ([55](55-discounts-and-refunds.md)) ([D-348](../technical-reference.md#decision-log)).
8. **Reference.** The body carries `reference` (1 to 80 characters after trimming), stored on the charge with `request_hash`. Both are set on every `adhoc` charge and on no other kind. The reference is unique within a school ([D-344](../technical-reference.md#decision-log)). The journal entry's reference stays the `CHG-` number ([52](52-charges.md#business-rules) rule 6).
9. **Replay.** The request hash is SHA-256 of the canonical `{ studentId, lines }`, with line order kept because the order is shown. The same reference with the same hash answers 200 with the existing charge and `replayed: true`, and posts nothing. The same reference with a different hash answers 409 "Reference `<ref>` is already used by `<CHG-…>`." If that charge is outside the caller's finance scope, the message omits the number: "That reference is already used by another record."
10. **Concurrency.** The post takes an advisory lock on `invoice-charge:<organization>:<reference>`, then checks the reference, student, fee types and term again inside the transaction, with the caller's campuses, so two simultaneous posts make one charge. A reference that turns out to belong to a charge on a campus the caller cannot see answers 409 without the number.
11. **Posting.** The charge is sent through the shared `sendCharge` helper ([D-345](../technical-reference.md#decision-log)): the number comes from the `CHG` sequence shared with term and store charges, the entry has kind `adhoc`, memo `Charge · <first> <last>`, reference = the number, `source_id` = the charge, `campus_id` on every line and `student_id` on every 1100 line. The entry balances by construction and posts at most once.
12. **Activity.** The same transaction writes one finance activity row, kind `charge.adhoc`, on the student's current campus: `Charged <student> ₦<total> (<CHG number>)`.
13. **Balances.** The student's balance and brought forward rise by the total. Both stay derived ([52](52-charges.md#business-rules) rules 8 and 9). Amounts are integer minor units.

## Data

See [52-charges, Data](52-charges.md#data). Migration `<ts>_invoice_reference.sql`:

- **New columns on `invoice`:** `reference TEXT` with `CHECK (length(btrim(reference)) BETWEEN 1 AND 80)`, and `request_hash TEXT`.
- `CHECK ((kind = 'adhoc') = (reference IS NOT NULL AND request_hash IS NOT NULL))`.
- Partial unique index on (`organization_id`, `reference`) `WHERE reference IS NOT NULL`.
- `invoice_immutable` is replaced so `reference` and `request_hash` join the frozen fields.
- The down section restores the old function and drops the columns.

`invoice` already carries `organization_id`, so no new table or tenancy column is needed. `kind = 'adhoc'` and journal kind `adhoc` already exist. `schema.sql` and `db-types.ts` are regenerated with `pnpm drift:fix`, never hand-edited.

## API

Module `apps/api/src/app/modules/invoice`. Contract `contract.invoices.create`.

| Method | Path        | Permission       | Request                                                                                                                          | Response                                                                                               | Errors                                                                                                                                                     |
| ------ | ----------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/invoices` | `invoice:charge` | `createOneOffChargeSchema`: `studentId`, `reference` (1-80), `lines[1..20]` of `{ feeTypeId, description (1-300), amountMinor }` | `createdChargeSchema`: the `Invoice` of `GET /invoices/:id` plus `replayed`. 201, or 200 when replayed | 400 bad body; 403; 404 student out of scope, fee type not found; 409 reference used (with or without the number), student not on the roll, no current term |

Types live in `@eduvault/api-contract`, with the message constants and `oneOffChargeReference(date, uuid)`.

## Acceptance criteria

1. Given the Lekki bursar, when she adds a charge of two lines on different fee types for a Lekki student, then the charge is Sent with a `CHG-` number from the shared sequence, the current term and the student's campus, and the toast reads "Charge `<number>` added".
2. Given that charge, then `GET /invoices` lists it with kind `adhoc`, **One-off** shows its count plus one, and the detail shows the lines, the total and **Balanced**.
3. Given that charge, then the journal is Dr 1100 (with the student) and Cr each fee type, with the charge's campus, kind `adhoc` and memo `Charge · <first> <last>`.
4. Given the student owed ₦12,000, when a ₦5,000 charge is sent, then Balance today and Brought forward for later charges rise by ₦5,000, and the activity row is written.
5. Given the same reference and body posted twice, then the second answers 200 `replayed: true`, and there is one charge and one journal entry.
6. Given the same reference with a different amount, description or line order, then 409 naming the charge number; when the first charge is outside the caller's scope, 409 without the number.
7. Given an archived student, then 409 "Only students on the roll can be charged." Given no current term, then 409.
8. Given a retired or unknown fee type, or one from another school, then 404 "Fee type not found".
9. Given an administrator, a principal or a member without `invoice:charge`, then `POST /invoices` answers 403 and the **New charge** button is hidden.
10. Given a form with no student, a blank description or a zero amount, then the sheet shows the message and sends nothing.
11. Given the sheet open and **Add charge** clicked twice, then one charge is created.
12. Given an Ikeja student's id, when the Lekki bursar posts, then 404; given school A's student, when school B's owner posts, then 404.
13. Given an acting super admin without a reason, then `POST /invoices` answers 403 `ActingReadOnly` and the attempt is audited.
14. Given a sent one-off charge, when anyone tries to change the charge or its lines through the database, including its `reference` or `request_hash`, then the trigger refuses it.

## Tests

- Unit (`nx run <project>:test`): `oneOffChargeReference` and the request schemas (no lines, 21 lines, a zero or negative amount, a blank description, a too-long reference are refused); the request hash (same input, same hash; a changed amount, description or order, another hash); the input-to-posting mapping of `sendCharge` (memo, kind, reference = number, `sourceId` = invoice id); `InvoiceService.create` with a fake repository (each outcome's status and message, `replayed: true`); the policy catalogue, role grants and role-editor wording; the web form model (naira parsing, validation, total, request body) and the sheet and button (`renderWithApi`).
- Integration (`api:test-integration`) [tenancy-002] [testing-002]: `one-off-charges.integration.spec.ts` covers criteria 1 to 9 and 11 to 13 against real Postgres, and its `describe('isolation')` covers cases 1, 3, 5, 6, 7, 10 and 12 of the [twelve-case table](../conventions.md#isolation-cases) plus an assertion that the Lekki-only list hides an Ikeja one-off charge. Cases 2 and 4 are read cases the existing list covers; cases 8, 9 and 11 do not apply (no class-scoped teacher, no portal route, no approval). `invoice-constraints.integration.spec.ts` covers an `adhoc` row without a reference, a duplicate reference in one school (and allowed across schools), and a frozen reference. Billing and store-sale specs stay green on the shared pipeline.
- E2E (required, `eduvault-e2e`): the Lekki bursar adds a two-line charge for a Lekki student and sees the `CHG-` toast, kind One-off and **Balanced**; a double click makes one charge; the principal sees no **New charge** button and `POST /invoices` answers 403; the Lekki bursar posting an Ikeja student gets 404.

## Open decisions

| #   | Question                                                                        | Recommendation                                                                          | Confidence                                             | Decided                                                           |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| 1   | Which permission adds a one-off charge?                                         | A new `invoice:charge`, bursar only. Option: reuse `invoice:bill`.                      | High: it charges an arbitrary amount (least privilege) | [D-342](../technical-reference.md#decision-log): `invoice:charge` |
| 2   | Which term and campus does it use?                                              | The current term and the student's current campus.                                      | High                                                   | [D-343](../technical-reference.md#decision-log): as recommended   |
| 3   | How is a retry told from a reused reference?                                    | `reference` and `request_hash` on `invoice`, as the store sale does.                    | High                                                   | [D-344](../technical-reference.md#decision-log): as recommended   |
| 4   | Copy the issue steps again, or share them?                                      | One `sendCharge` helper for billing, store and one-off charges.                         | High: no parallel posting path                         | [D-345](../technical-reference.md#decision-log): shared helper    |
| 5   | Can a line credit an account outside the fee types, such as 4060 Other charges? | No; a line is a fee type. A later slice can add it if schools ask.                      | Medium                                                 | [D-346](../technical-reference.md#decision-log): fee types only   |
| 6   | Can a student off the roll be charged?                                          | No: 409. Out of scope is 404.                                                           | High                                                   | [D-347](../technical-reference.md#decision-log): on the roll only |
| 7   | Does a one-off charge wait for approval or sit as a draft?                      | No; it is sent at once and corrected with a fee reduction.                              | Medium                                                 | [D-348](../technical-reference.md#decision-log): sent at once     |
| 8   | Can the bursar pick another term?                                               | No, the current term only. Back-dated or next-term charges need a brought-forward rule. | Medium                                                 | Adopted (descoped)                                                |

## Prototype gaps noticed

- The prototype has no way to create a one-off charge, so the **New charge** action and sheet are new; they follow the Record student purchase sheet ([61](61-store.md#sheet-record-student-purchase-m44)).
- The Charges description in the prototype omits store purchases; it is reworded in [52](52-charges.md).
- `adhoc` is not in the data model's journal kinds; it exists in the build ([52](52-charges.md#data)).

## Dependencies

- M3.3 charges ([52](52-charges.md), [51](51-charge-students.md)): the `invoice` table, the `adhoc` kind, the shared `CHG` sequence and the posting service.
- M3.1 ledger core (accounts, `LedgerPoster`) and M3.2 fee types ([50](50-fees.md)).
- M3.4 statements (the student's account shows the charge).
- M4.4 store sale: its charge issue moves onto the shared helper with no change in behaviour.
- Store charges from the Charges screen are the next phase of the same issue and reuse Record student purchase ([D-290](../technical-reference.md#decision-log)).

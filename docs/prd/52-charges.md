# PRD: Charges

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M3.3` (see [roadmap](README.md)); store charges are created by `M4.4`
- Related: [data-model-finance.md](../brainstorming/data-model-finance.md) (Fees and charging, Posting rules, Invariants, Reports), [data-model-inventory.md, Sales to students](../brainstorming/data-model-inventory.md), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-008](../technical-reference.md#decision-log), [D-022](../technical-reference.md#decision-log), [D-031](../technical-reference.md#decision-log), [D-041](../technical-reference.md#decision-log), [D-042](../technical-reference.md#decision-log), [D-043](../technical-reference.md#decision-log); sibling PRDs [50-fees.md](50-fees.md), [51-charge-students.md](51-charge-students.md)

## Summary

A charge (invoice) is the bill a family sees: a term's fees and discounts, a store purchase, or a one-off charge. **Charges** lists every charge in the viewer's campuses with kind and status filters; **charge detail** shows the lines, what was owed before it ("brought forward"), what was due when it was sent, and, for the accountant, the journal entry it posted. A sent charge never changes.

## Who uses it

| Persona                       | Permission(s)     | What they can do here                                 |
| ----------------------------- | ----------------- | ----------------------------------------------------- |
| Owner                         | all               | Every charge                                          |
| Bursar (Lekki or Ikeja)       | `invoice:read`    | Charges of students on their campuses                 |
| Administrator, Principal      | `invoice:read`    | Every charge (both hold `campus:readAll`)             |
| Teacher, member with no roles | none              | Not shown; route redirects                            |
| Student, guardian             | `invoice:readOwn` | Not here; the portal's charges are M3.7               |
| Acting super admin, no reason | read permissions  | Everything visible; nothing to write on these screens |

Gate `invoice:read`. Scope: campus only, never class. A charge is visible when its student is in finance scope: the student's current-term campus is in the member's campus scope, not the charge's frozen `campus_id` ([D-041](../technical-reference.md#decision-log)). A charge outside scope answers 404; without the permission, 403 [tenancy-001]. These screens have no write actions.

## Screens

Both sit in the Fees sub-tab frame ([50-fees, Fees sub-tabs](50-fees.md#fees-sub-tabs-shared-frame)) with **Charges** selected. Phase F1.

### Charges

- Route `/finance/invoices` (web-admin), Finance › Fees › Charges tab. Gate `invoice:read`.
- Header: title **Charges**; description "Everything students have been charged: term fees and one-off charges."; info tip "Every charge is added to the student’s account." No actions.
- Summary line (small, muted): `<n> charges sent · ₦<total of sent charges> · <d> waiting to be sent`, over every charge in scope regardless of filters.
- Card with a toolbar:
  - Search (placeholder "Search student or number"): matches student name, charge number or admission number, case-insensitive.
  - **Kind** select (aria-label "Kind"): **All kinds**, `Term fees (<n>)`, `One-off (<n>)`, `Store purchase (<n>)`; counts are over charges in scope.
  - **Status** select (aria-label "Status"): **Any status**, **Prepared**, **Sent**, **Cancelled**.
  - Right-aligned: `<n> shown`.
- Table:

| Column  | Content                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Student | Avatar, name; below: the charge number in mono, or "Draft" when it has none                                                                                  |
| Date    | Date sent, else the date prepared                                                                                                                            |
| Kind    | Badge: **Term fees** (secondary), **One-off** (outline), **Store purchase** (outline)                                                                        |
| For     | Term fees: the term (`First term, 2026/2027`). Other kinds: the line descriptions joined with "; " (for example "School shirt, Size 10 × 2; School tie × 1") |
| Total   | Net total (fee lines plus discount lines)                                                                                                                    |
| Status  | **Prepared**, **Sent** or **Cancelled**                                                                                                                      |

Sort: date descending, then number descending. Rows open the charge. Paged 10.

- Empty (no match): "No charges match" (search icon), "Try another kind, status or search."
- Loading: skeleton. Error: `ErrorMessage`.

### Charge detail

- Route `/finance/invoices/$invoiceId`. Gate `invoice:read`.
- Header: breadcrumb **Charges › `<number>`** (or **Prepared** for a draft); title the charge number, or **Prepared charge** for a draft; status badge; description `<kind label> · <student name, linked to their statement> · <class arm for the charge's term>`; info tip "A charge that has been sent never changes. A mistake is fixed with an approved fee reduction."; action **Student statement** (wallet icon) to the student's statement (M3.4).
- Two columns.
- Main column:
  1. **Lines** card (receipt icon, flush): table **Description**, **Amount**; discount lines (negative) shown muted with a negative row style; footer **Total**.
  2. Sent charge: **For your accountant: `<reference>`** card, collapsible, closed by default, book icon, description "Each money movement and the category it belongs to." Table: **Account** (`<code>` and name), **Student** (name or "—"), **Campus**, **Debit**, **Credit**; footer: badge **Balanced** (check) when debits equal credits, else **Out of balance** (x), then the debit and credit totals.
     Draft or cancelled charge: info callout "Nothing is recorded in the books until these charges are sent."
- Side column:
  1. **Amount due** card: label "Due at issue" and, large, brought forward + this charge. Below, key-value rows: **This charge** (total); **Brought forward** (amount, info tip "What the family already owed before this charge was sent."); **Balance today** (bold, the student's current balance).
  2. **Details** card, key-value rows:
     - **Number**: the number in code, or "Given when sent".
     - **Term**: the charge's term.
     - **Sent with**: the round number linking to the round ([51](51-charge-students.md#charge-round)), or "—".
     - **Source**: for a store charge, the store sale number (`ISS-…`) linking to the sale (M4.4); otherwise "—".
     - **Issued**: `<date> by <name>`, or "—".
     - **Charged to**: the fee-paying guardian, `<name> (<relationship>)`; with several, the first; none → "—".
- Not found (404): breadcrumb **Charges › Not found**, title "Not found", empty state "No charge here", "It may have been moved, or it may belong to a campus you don’t look after.", button **Back to charges**.
- Denied (403): tab hidden, route redirects.

### Store charges (display only)

Created by the store sale (M4.4, "Record student purchase"), never by Charge students. They appear in Charges with kind **Store purchase** and open in the same detail screen:

- Number `CHG-…`, status Sent from creation (never Prepared), term = the current term at the time of sale, no round ("Sent with" "—"), Source = the `ISS-…` sale.
- Lines `<item name> × <qty>` at the item's selling price, posted to **Store sales** (4500).
- The journal card shows the charge entry (reference = the charge number). The cost entry (`<number>-COST`, valued at the store's moving average cost, [D-031](../technical-reference.md#decision-log)) and the payment taken at the till are separate entries, not shown on this card.
- Because the sale is paid at once, "Balance today" usually doesn't move.

### Entry points elsewhere

- Charge round rows ([51](51-charge-students.md#charge-round)), the send toast's **See charges**, the dashboard's "Charged this term" tile (home PRD), statements' reference cells (M3.4).

## Business rules

1. **Frozen lines.** Invoice lines are copied when a charge is prepared: fee lines from [50-fees](50-fees.md#business-rules) rule 6 (description = the fee line's name, `ledger_account_id` = its fee type, `fee_line_id` set), then discount lines. They never change afterwards, whatever happens to the fee line or the discount.
2. **Status.** `draft` (Prepared) → `issued` (Sent) through a round's send; `draft` → `cancelled` through a round's cancel. Store charges are created `issued`. Nothing else changes a charge; there is no edit or delete endpoint. Only status, number, `issued_at`, `issued_by` and `journal_entry_id` are ever written after insert, and only on the draft → issued step.
3. **Discount lines** (prepare only, from approved `student_discount` rows):
   1. A discount applies when `status = approved` and the charge's term lies between `from_term` and `to_term` (inclusive; open-ended when `to_term` is null), comparing terms by school-year start then term sequence.
   2. Base: the sum of the charge's **fee lines** of the discount's fee type, or of all fee lines when the discount has no fee type. Earlier discount lines are never part of a base, so the order of discounts doesn't change a base ([D-043](../technical-reference.md#decision-log); the prototype includes them for whole-charge discounts).
   3. Amount: percent → `round(base × value / 100)` (half up, in minor units); fixed → `value`. Capped at the base ([D-043](../technical-reference.md#decision-log)). A discount whose capped amount is 0 adds no line.
   4. Line: amount negative, `ledger_account_id` = **Discounts given** (5000), `student_discount_id` set, description `<reason> (<value>% of <fee type name, lower case>)` for a percent on a fee type, `<reason> (<value>% of the charge)` for a percent on the whole charge, `<reason>` for a fixed amount.
   5. Several discounts all apply, in order of approval time; each takes its base from the fee lines ([D-043](../technical-reference.md#decision-log)). A later discount is cut so that the discount lines on a charge never total more than the fee lines they apply to ([55](55-discounts-and-refunds.md#business-rules) rule 16).
4. **Total** = sum of all lines (fee lines positive, discount lines negative); never negative.
5. **Kinds and journal kinds:** `term` posts kind `invoice`; `store` posts kind `store`; `adhoc` posts kind `adhoc` (not yet in the data model's kind list; flagged). Memos: `Term fees · <student>`, `Store items · <student>`, `Charge · <student>`.
6. **Postings** for a sent charge (one entry, reference = the charge number, `campus_id` = the charge's campus on every line, `student_id` on every 1100 line):

   | Line                                                                          | Debit                         | Credit                       |
   | ----------------------------------------------------------------------------- | ----------------------------- | ---------------------------- |
   | Fee line (term or one-off)                                                    | 1100 Fees owed to the school  | the fee type (child of 4000) |
   | Discount line                                                                 | 5000 Discounts given          | 1100 Fees owed to the school |
   | Store line                                                                    | 1100 Fees owed to the school  | 4500 Store sales             |
   | Store cost (separate entry `<number>-COST`, M4.4, at the moving average cost) | 5200 Cost of store items sold | 1300 Store stock             |

   The entry balances by construction; the deferred trigger enforces it; the reference posts at most once.

7. **Numbering.** `CHG-<year>-<NNNNN>` (5 digits) from `document_sequence` kind `CHG`, shared by term, store and one-off charges, given when the charge is sent (store: at sale). A draft has no number; a cancelled draft never gets one.
8. **Brought forward.** For a sent charge: the student's balance on 1100 from every entry posted **before** this charge's entry, in posting order by `journal_entry.sequence` ([D-042](../technical-reference.md#decision-log)), not business date. For a draft or cancelled charge: the student's balance today. Never stored, never an invoice line.
9. **Due at issue** = brought forward + this charge. **Balance today** = the student's current 1100 balance. Both derived.
10. **Charged to** is display only: the guardian with `pays_fees` on the student (first by name when several). The charge belongs to the student's account, not the guardian's.
11. The journal card is shown to anyone who can open the charge (`invoice:read`); it needs no further permission ([D-022](../technical-reference.md#decision-log)).
12. Visibility (rule in "Who uses it"): list, counts, summary line and detail all use the same scope filter.

## Data

See [data-model-finance.md, Fees and charging](../brainstorming/data-model-finance.md#fees-and-charging).

- **New `invoice`**: as in the data model, plus **new columns** `campus_id` (composite FK to `campus`, the student's campus for the term, frozen at prepare; drives posting) and `created_by` (the prototype stores who prepared it). `kind` `CHECK IN ('term','store','adhoc')`; `status` `CHECK IN ('draft','issued','cancelled')`; `number` `UNIQUE (organization_id, number)`; `CHECK ((status = 'issued') = (number IS NOT NULL AND issued_at IS NOT NULL AND journal_entry_id IS NOT NULL))`; partial unique `(student_id, term_id) WHERE kind = 'term' AND status <> 'cancelled'`. FKs `ON DELETE RESTRICT`.
- **New `invoice_line`**: as in the data model; `CHECK (amount_minor <> 0)`; `CHECK ((student_discount_id IS NOT NULL) = (amount_minor < 0))`; a trigger refuses insert, update or delete once the parent invoice is not `draft` (store charges insert their lines in the same transaction before issuing).
- `journal_entry.kind` gains `adhoc` (**not in the data model's list**).
- Ordering for brought forward: entries posted in one transaction share `posted_at` (`now()`), and a store sale posts its charge and payment together. **New column** `journal_entry.sequence BIGINT GENERATED ALWAYS AS IDENTITY`, owned by M3.1 ([D-042](../technical-reference.md#decision-log)).
- Reads `ledger_account`, `journal_line` (M3.1), `guardian_student.pays_fees` (M2.4), `store_sale.invoice_id` (M4.4).

Migrations: shared with [51](51-charge-students.md#data) (`create_invoice`, `create_invoice_line`).

## API

Module `apps/api/src/app/modules/invoice`. Contract `contract.invoices`.

| Method | Path            | Permission     | Request                                                                                                                                       | Response                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Errors                                            |
| ------ | --------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| GET    | `/invoices`     | `invoice:read` | query `kind?` (`term`\|`adhoc`\|`store`), `status?` (`draft`\|`issued`\|`cancelled`), `q?`, `studentId?`, `termId?`, `billingRunId?`, `page?` | `{ items: InvoiceSummary[] (id, number, studentId, studentName, admissionNumber, kind, termId, termName, forText, totalMinor, status, date), total, counts: { term, adhoc, store }, summary: { sentCount, sentTotalMinor, draftCount } }`                                                                                                                                                                                                                       | 400 bad filter; 403; 404 `studentId` out of scope |
| GET    | `/invoices/:id` | `invoice:read` | none                                                                                                                                          | `Invoice` (header fields, `lines[]` with `description, amountMinor, ledgerAccountId, feeLineId?, studentDiscountId?`, `totalMinor`, `broughtForwardMinor`, `dueAtIssueMinor`, `balanceTodayMinor`, `billingRun? {id, number}`, `source? {kind:'store_sale', id, number}`, `issuedAt?`, `issuedBy?`, `chargedTo? {name, relationship}`, `journal? {reference, lines[{accountCode, accountName, studentName?, campusName?, debitMinor, creditMinor}], balanced}`) | 403; 404 not in school or student out of scope    |

No write endpoints here: charges are written by [51](51-charge-students.md#api) (term) and M4.4 (store).

## Acceptance criteria

1. Given the Lekki bursar, when she opens Charges, then she sees only charges of students whose current-term campus is Lekki, and the Kind counts and summary line count only those.
2. Given 40 sent and 3 prepared charges in scope, then the summary reads "40 charges sent · ₦`<sum>` · 3 waiting to be sent".
3. Given Kind = Store purchase, then only store charges show, each with its item lines in For.
4. Given a search "CHG-2026-00012", then only that charge shows.
5. Given a draft charge, when opened, then the title is "Prepared charge", Number reads "Given when sent", Issued "—", and the callout "Nothing is recorded in the books until these charges are sent." shows instead of the journal card.
6. Given Ada owed ₦12,000 before her First term charge of ₦226,000 was sent and has paid ₦180,000 since, when the charge is opened, then Brought forward is ₦12,000, Due at issue ₦238,000, This charge ₦226,000 and Balance today ₦58,000.
7. Given a sent charge with a discount line, when the journal card opens, then it lists Dr 1100 (student) and Cr the fee type per fee line, Dr 5000 / Cr 1100 for the discount, all with the charge's campus, and the footer shows Balanced with equal totals.
8. Given a percent discount with no fee type and a second discount, then each discount's amount is computed on the fee lines only.
9. Given a fixed ₦50,000 discount on a fee type whose lines total ₦45,000, then the discount line is −₦45,000 and the charge total is not negative.
10. Given a sent charge, when anyone tries to change a line or the charge through the database, then the trigger refuses it.
11. Given a store charge, when opened, then Sent with is "—" and Source shows its `ISS-` number.
12. Given an Ikeja student's charge id, when the Lekki bursar opens it, then 404 with "No charge here".
13. Given school B's charge id, when school A's owner opens it, then 404.
14. Given a teacher, when they navigate to `/finance/invoices`, then they are redirected.

## Tests

- Unit (`nx run api:test`): discount computation (percent per fee type, whole charge, fixed, cap, rounding, several discounts, term range); description wording; brought-forward from an ordered entry list. (`nx run web-admin:test`): Charges filter and search, "Draft" label, journal footer badge.
- Integration (`api:test-integration`) [tenancy-002] [testing-002]:
  - Isolation for `invoice`, `invoice_line` and both routes: other school 404; other campus 404 and absent from list, counts and summary.
  - 403 without `invoice:read`.
  - Constraints: issued charge must have number, `issued_at`, `journal_entry_id`; line trigger refuses changes after send; partial unique index.
  - Money: the posted entry for a charge mirrors its lines (rule 6), balances, and carries `student_id` on every 1100 line; brought forward equals the balance immediately before the charge's entry, including when a store charge and its payment post in one transaction.
- E2E (opt-in, `eduvault-e2e`): bursar filters Charges by Store purchase and by Prepared, opens a sent charge and expands For your accountant; Lekki bursar opens an Ikeja charge URL and sees "No charge here".

## Open decisions

| #   | Question                                                                                                                                                                                  | Recommendation                                                                                                                | Confidence                                                                                         | Decided                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Is a charge's visibility tied to the student's **current** campus (prototype) or to the charge's own `campus_id`? After a move, the old campus's bursar loses sight of charges they sent. | The prototype rule: the student's current-term campus. Option: either the current campus or the charge's `campus_id`.         | Medium: keeps every money screen (Who owes, statements, Charges) on one filter; revisit with M3.4. | [D-041](../technical-reference.md#decision-log): the student's current campus |
| 2   | One-off (adhoc) charges: the kind, filter and journal label exist, but no screen creates one.                                                                                             | Keep the filter (count 0) and the kind; build creation in a later slice with its own PRD. Option: hide the option until then. | Medium                                                                                             | Adopted                                                                       |
| 3   | Base for a whole-charge discount when another discount came first. The prototype includes the earlier discount line.                                                                      | Fee lines only, so the order of discounts doesn't change the result.                                                          | High                                                                                               | [D-043](../technical-reference.md#decision-log): fee lines only               |
| 4   | Can a fixed discount exceed its base and make a charge negative?                                                                                                                          | Cap at the base. Option: let the excess become credit.                                                                        | Medium                                                                                             | [D-043](../technical-reference.md#decision-log): capped at the base           |
| 5   | Should the "For your accountant" card need `ledger:read`? The administrator sees it today without it.                                                                                     | Keep it on `invoice:read` (prototype).                                                                                        | Medium: it only restates the charge in account terms.                                              | [D-022](../technical-reference.md#decision-log): no extra gate                |
| 6   | How are entries ordered for brought forward when several post in one transaction?                                                                                                         | Add `journal_entry.sequence` (identity) in M3.1 and order by it.                                                              | Medium                                                                                             | [D-042](../technical-reference.md#decision-log): `journal_entry.sequence`     |
| 7   | "Charged to" with several fee-paying guardians.                                                                                                                                           | Show the first by name; a later printable charge can list all.                                                                | Low                                                                                                | Adopted                                                                       |
| 8   | Printable or downloadable charge for parents (data model "Still open").                                                                                                                   | Not in M3.3; portal (M3.7) shows charges on screen.                                                                           | Medium                                                                                             | Adopted                                                                       |

## Prototype gaps noticed

- "Source" reads `sourceRef`, which nothing sets; it is always "—". The build shows the `ISS-` sale for store charges.
- The Student cell's subline says "Draft" while the status badge says "Prepared"; cancelled drafts also say "Draft". Use "Not numbered".
- Description says "term fees and one-off charges" but the list also holds store purchases.
- One-off charges can't be created (#2); `adhoc` isn't in the data model's journal kinds.
- The preview's discount descriptions differ from the charge's (see [50-fees](50-fees.md#prototype-gaps-noticed)).
- Discount base includes earlier discount lines (#3); no cap (#4).
- Brought forward relies on array order of the in-memory journal (#6).

## Dependencies

- M3.1 ledger core (accounts, journal, balances, `document_sequence`, posting service).
- M3.2 fee lines ([50-fees](50-fees.md)); [51-charge-students](51-charge-students.md) in the same slice creates term charges.
- M3.4 for the **Student statement** action and statement links (until then, hide the action).
- `student_discount` (see [51 Dependencies](51-charge-students.md#dependencies)).
- M4.4 creates store charges and the `ISS-` link; until then the Store purchase filter shows 0.
- M2.4 guardians (`pays_fees`) and placements.

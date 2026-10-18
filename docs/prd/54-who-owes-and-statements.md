# PRD: Who owes and statements

- Status: implemented (M3.4, EDU-36); Pay the extra back follows with refunds in M3.5
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M3.4` (who owes, statements) (see [roadmap](README.md))
- Related: [data-model-finance.md](../brainstorming/data-model-finance.md) (Decisions: balances over time, student account shape; Journal; Reports), [data-model-overview.md](../brainstorming/data-model-overview.md) (Foundation model: opening balances; student lifecycle), [53-payments.md](53-payments.md), [55-discounts-and-refunds.md](55-discounts-and-refunds.md), [56-money-accounts-and-categories.md](56-money-accounts-and-categories.md), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-012](../technical-reference.md#decision-log), [D-026](../technical-reference.md#decision-log), [D-038](../technical-reference.md#decision-log), [D-042](../technical-reference.md#decision-log)

## Summary

Who owes is the bursar's home: every student's balance worked out from the books, with current students and those who left or graduated kept apart, so no debt quietly disappears. From any row the bursar opens the student's statement (what was charged, paid and reduced, with a running total), flips to the family view that puts a paying guardian's children side by side, records a payment, or pays back money a family overpaid.

## Who uses it

| Persona                      | Permission(s)                                                         | What they can do here                                                                          |
| ---------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Bursar (Chika, Lekki)        | `invoice:read`, `payment:read`, `payment:record`, `adjustment:create` | See balances for Lekki students, open statements, record payments, start a refund or reduction |
| Owner                        | all                                                                   | Everything, every campus                                                                       |
| Principal (custom)           | `invoice:read`, `payment:read`, `campus:readAll`                      | Read-only across campuses                                                                      |
| Administrator                | `invoice:read`, `payment:read`, `campus:readAll`                      | Read-only across campuses                                                                      |
| Teacher, new hire            | none                                                                  | No access                                                                                      |
| Guardian, student (portal)   | `invoice:readOwn`, `payment:readOwn`                                  | Their own statement or family statement in the portal (M3.7, [72-portal.md](72-portal.md))     |
| Super admin acting read-only | read permissions                                                      | Reads; no Record payment, no Pay the extra back                                                |

Scopes applied:

- A student is in finance scope when their campus for the current term (placement, else home campus) is in the viewer's campus scope. Finance is campus-scoped, never class-scoped: a bursar sees every student on her campuses.
- Leavers and graduates stay in scope through their last placement or home campus.
- The summary's `receivedThisTermMinor` and `paymentsThisTerm` are present only with `payment:read` ([D-230](../technical-reference.md#decision-log)).
- Out of scope answers 404 [tenancy-001]; with neither `invoice:read` nor `payment:read` answers 403.
- The family view lists only the paying guardian's children who are in the viewer's scope.

## Screens

Who owes is the Finance nav item **Fees** (section Finance, nav order 1, phase F1). The Fees sub-tab strip shows "Who owes", "Charge students", "Charges", "School fees", "Other fees", each only if the viewer can open it.

Command menu (⌘K) quick action: "See who owes fees" (hint "Fees"), shown with `invoice:read`.

### Who owes

- Route `/finance/accounts`, web-admin, nav title "Fees", nav order 1, phase F1, gate `invoice:read` or `payment:read`.
- Header: title "Who owes"; description "Students with school fees still to pay."; info tip "What a family owes is worked out from every charge and payment, so nobody types it in by hand." No header actions.
- **Stat tiles**, three (two without `payment:read`, [D-230](../technical-reference.md#decision-log)):

  | Tile               | Value                           | Sub-line                                                                                     | On click                 |
  | ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ |
  | Total owed         | Sum of positive balances        | Scope note: "All campuses", or "Lekki campus" (campus names joined with ", " then " campus") | Sets the filter to Owing |
  | Students owing     | Count with a positive balance   | "out of {n} students" (every student in scope, any lifecycle)                                | Sets the filter to Owing |
  | Received this term | Sum received this term (rule 8) | "{n} payments"                                                                               | Opens Payments           |

- **Card with toolbar**: search box, placeholder "Search name or GF number" (name or admission number, case-insensitive); a "Show" select:
  - "Owing" (default): balance above zero.
  - "Owing: current students": balance above zero, lifecycle Active or Inactive.
  - "Owing: left or graduated": balance above zero, lifecycle Left or Graduated.
  - "Paid up": balance zero or in credit.
  - "Everyone".
- **Table**, sorted by balance, highest first (ties by name), 10 per page; the row opens the student's statement:

  | Column   | Content                                                                                                                                                                                                                            |
  | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Student  | Avatar, name, admission number ("GF-0123"), and " · inactive", " · left" or " · graduated" when not Active                                                                                                                         |
  | Class    | Current-term class ("JSS 2 Gold"), else the enrolment's level, else "—"                                                                                                                                                            |
  | Guardian | The first fee-paying guardian, else the first guardian: name and phone; "—" if none                                                                                                                                                |
  | Owing    | Red pill "₦{x}" when owing; green "₦{x} extra paid" when in credit; "Paid up" at zero                                                                                                                                              |
  | Paid     | Total paid (rule 4)                                                                                                                                                                                                                |
  | Total    | Total charged (rule 4)                                                                                                                                                                                                             |
  | (action) | **Record payment** (ghost, small) only when owing and the viewer has `payment:record`. Opens the Record a payment sheet in place, prefilled for this student's paying guardian, or "Someone else" with this student when none pays |

- Empty: with the Owing filter, "Nobody owes fees", "Every student you look after is paid up." (check icon); otherwise "No students match" (search icon).
- States: loading skeleton; error through `ErrorMessage`; denied: nav item hidden, route redirects; acting read-only: no Record payment.

### Student statement

- Route: the prototype uses `/finance/accounts?student={id}`; the build uses `/finance/accounts/$studentId` (nav false, parent Fees), gate `invoice:read` or `payment:read`.
- Breadcrumb: Who owes › {student name}.
- Header: title = student name; description "What was charged and what was paid."
- Actions:
  - **Family view ({n})** (secondary, users icon), shown when the student's paying guardian has more than one child in scope.
  - **Record payment** (primary, banknote), with `payment:record`: opens the sheet prefilled as on Who owes; after recording, the page stays here and the success toast carries **View receipt**.
  - More menu: **Discount or refund** (scale icon, `adjustment:create`): opens Discounts and refunds › Refunds and corrections with the request sheet open and this student chosen. **Student profile** (graduation-cap icon, `student:read`).
- **Student card**:
  - Heading: avatar, name, and "{GF-0123} · {class} · {campus}", plus " · archived" when the student is archived.
  - **Money tiles**:
    - First tile: "Owing" with the balance when owing; "Extra paid" with the credit when in credit; "Owing" with "Nothing" at zero.
    - "Paid".
    - "Reduced", only when above zero.
    - "Total".
  - When in credit, an info callout: "₦{x} was paid in extra. It is taken off the next fees automatically, or you can pay it back." and a button **Pay the extra back** (outline, undo icon, `adjustment:create`).
  - **Entries table**:
    - Columns: Date, What, Status, Amount. Oldest first, 10 per page, opening on the last page so the newest entries show first.
    - Each journal entry touching the student's account gives one row for what it added and one for what it took off. For example, a charge with a sibling discount shows a "Charged" row for the fees and a "Reduced" row for the discount.
    - What: the description (below) and, in small muted text, the entry reference.
    - Status badge (rule 5): "Charged", "Paid", "Reduced", "Payment cancelled", "Refunded".
    - Owing rows and amounts in the owe colour; paid and reduced rows in the paid colour.
    - Footer row: "Owing now" with the balance; "Extra paid" with the credit; or "Nothing owing" with ₦0.
    - Empty: "No entries yet" (receipt icon).
  - Descriptions, as written:
    - Term charge: "Term fees, {First term, 2026/2027}"
    - Store or one-off charge: "Store purchase: {line descriptions joined with "; "}" or "One-off: …"
    - Payment: "Payment {RCT-2026-00088} from {payer} ({Cash|Bank transfer|POS})"
    - Payment cancellation: "Void: Void of {RCT}: {reason}" (the build drops the doubled word: "Cancelled: {RCT}, {reason}")
    - Adjustment: "{Reduce a fee|Cancel a balance|Refund}: {reason}"
    - Opening balance: "Opening balance: {memo}"
  - Staff see the reference as text in small type; a charge number links to the charge and a receipt number to the receipt.
  - **Unpaid charges** footer, shown when anything is unpaid: "Unpaid charges, oldest first" and one outline badge per item with its reference and the amount still unpaid (rule 6).
- Not found or out of scope: title "Not found", breadcrumb Who owes › Not found, empty state "No student account here", "It may have been moved, or it may belong to a campus you don’t look after.", button **Back to who owes**.

### Family statement

- Same route with the family view on (the build uses `?view=family` so it survives reload; the prototype keeps it in UI state).
- Header: title "Family statement: {paying guardian}"; description "{n} children. Each keeps their own account; this view combines them."; the toggle reads **One child**; **Record payment** and the More menu as above (the payment sheet prefills every child of that guardian).
- **Stat tiles**, one per child (name; balance; class) and **Family total** (users icon; the sum of what the children owe, leaving out any child's credit, [D-038](../technical-reference.md#decision-log); sub-line "Owed across all children" when above zero, else "Nothing owed"; when any child holds credit, the sub-line adds " · ₦{x} extra paid kept separately" (new copy)).
- Then one student card per child, as in Student statement, each with its own tiles, credit callout, entries and unpaid list.

### Brought forward

- Debt and credit carry forward from term to term and year to year. There is no closing step (finance doc decision "Balances over time").
- History from before Eduvault appears as the student's opening entry, "Opening balance: {memo}", dated the go-live day ([56](56-money-accounts-and-categories.md), opening balances).
- The charge page shows "Brought forward" (info tip "What the family already owed before this charge was sent.") and "Due at issue" (brought forward plus the charge). They are computed when displayed, never stored as invoice lines; that page belongs to [52-charges.md](52-charges.md) (M3.3). This module provides the balance-before-entry calculation it uses (rule 7).
- The statement shows the whole history, paginated, until a term is chosen ([D-341](../technical-reference.md#decision-log)). Choosing a term shows only that term's entries under a "Brought forward" row, computed at read time and never stored or posted:
  - **Term window.** Terms are ordered by start date across sessions, school-wide. A term's window opens at the earlier of its start and the first charge sent for it (the same opening point as rule 8) and closes the day before the next term's window opens. The latest term has no end. The windows split the dates with no gaps or overlaps, so each entry belongs to exactly one term; entries before the first term's window count only in the first brought forward (rule 15).
  - **Brought forward** is the student's balance from every entry dated before the window opens, shown at the top of page 1 even when it is ₦0 (rule 16).
  - **Closing** is brought forward plus the term's entries. The latest term closes on the account balance; an earlier term closes on the next term's brought forward (rule 17).
  - **Voided payments.** The payment's Paid row stays in the term of its payment date. The approved cancellation is its own entry, dated the day it was approved, and shows as "Payment cancelled" in whichever term that day falls in. A pending cancellation has no entry and changes nothing. Nothing is altered, hidden or deleted (rule 18).
  - **Fee periods.** Every entry, charges included, is placed by its own date and never by the term named in its description. A charge sent early lands in the term whose window it opened; a charge sent after the next term's window opened shows in the later term and still names its fee period (rule 19).
  - The money tiles, the unpaid list and the family block stay whole-account (rule 20).

## Business rules

1. **Balance** = `SUM(debit_minor - credit_minor)` over the student's `journal_line` rows on `fees_receivable`. Positive is owing, negative is credit held, zero is paid up. Never stored.
2. **Lifecycle split.** "Current students" are Active or Inactive; "left or graduated" are Left or Graduated. Leavers keep their balance and stay on Who owes until it reaches zero.
3. **"Out of {n} students"** counts every student in scope regardless of lifecycle or balance.
4. **Tile and column totals**, all from the student's receivable lines:
   - **Total** = sent charges (gross, before their discount lines) plus opening debt.
   - **Reduced** = discount lines, approved fee reductions, cancelled balances and opening credit.
   - **Paid** = allocations of payments that are not cancelled, minus approved refunds.
   - Balance = Total − Reduced − Paid always holds. Cancellation entries and their reversed payments cancel out and appear in neither Paid nor Total.
5. **Row labels.** A debit from a charge or opening debt is "Charged"; a credit from a payment is "Paid"; a credit from a discount line, reduction, cancelled balance or opening credit is "Reduced"; the debit from an approved payment cancellation is "Payment cancelled"; the debit from a refund is "Refunded".
6. **Unpaid charges** are matched oldest-first at read time: every entry that raised the balance (net per entry) is paid off in date order from the pool of everything that lowered it. What remains is listed with its reference. Nothing about matching is stored.
7. **Brought forward** for an entry = the student's balance from all entries posted before it (by `journal_entry.sequence`, [D-042](../technical-reference.md#decision-log)). Used by the charge page.
8. **Received this term** = the sum of in-scope allocations of fee payments (store-sale payments excluded, as on the dashboard, [D-026](../technical-reference.md#decision-log)) that are Recorded or Cancellation waiting, dated on or after the earlier of the current term's start and the first charge sent for that term, and on or before the term's end. For a campus-scoped viewer only allocations to in-scope students count. Store sale payments count here, as they do on Payments ([53](53-payments.md#business-rules) rule 22); only the dashboard's money tiles leave them out ([D-026](../technical-reference.md#decision-log)).
9. **Credit is used automatically.** Because the balance is a sum, credit held reduces what the next charge leaves owing. Nothing has to be applied by hand.
10. **Pay the extra back** shows only when the balance is negative and the viewer has `adjustment:create`. It opens the refund request prefilled with kind Refund, this student, and amount = the credit held; the refund rules are in [55](55-discounts-and-refunds.md).
11. **Family.** The family is the student's first guardian marked as paying fees (by link order). The family view lists that guardian's in-scope children, each with their own account. The family total adds up what each child owes; a child's credit shows on their own tile and is never netted against a sibling's debt ([D-038](../technical-reference.md#decision-log)). A student with no paying guardian has no family view.
12. **Search** matches name or admission number; the filter applies before search; both apply before pagination.
13. **Statement scope.** The statement lists every entry touching the student's receivable account, whatever campus each line carries, once the student is in scope.
14. **Read-only.** Neither screen changes anything; actions open the payment or adjustment flows, which check their own permissions.
15. **Term window** (statement `termId`, [D-341](../technical-reference.md#decision-log)). Terms are ordered by `starts_on` across sessions; a term has no campus.
    - `since_day(T)` = the earlier of `T.starts_on` and the earliest `effective_on` of an issued, non-store charge for `T`. This is the opening point rule 8 uses.
    - Window(T) runs from `since_day(T)` to the day before the earliest later term's `since_day` (the next term's, unless a later term opened out of order). The latest term's window has no end. If that day is before `since_day(T)`, T's window is empty.
    - This differs from rule 8 on purpose: rule 8 counts payments from `since_day` to the term's `ends_on`, so a payment in a holiday gap is in no term. The statement must put every entry in exactly one term so that each is counted once and the next term's brought forward equals this term's closing. Rule 8 is unchanged.
16. **Brought forward for a term** = the sum of the student's receivable movements dated (`effective_on`) before `since_day(T)`. It is built on the same balance reducer as rule 7, keyed on date because the statement orders by date then sequence, whereas rule 7 is keyed on sequence. Shown whenever a term is chosen, including ₦0. Never stored.
17. **Closing** = brought forward plus the signed net of the term's rows. For the latest term it equals `totals.balanceMinor`; for an earlier term it equals the brought forward of the term whose window follows it (the next term, unless a later term opened out of order), and a term with an empty window closes at its own brought forward.
18. **Voided payments under a term.** The payment's entry is dated `paid_on` and the approved cancellation is a separate entry dated its approval day (`effective_on`). Each sits in the term its own date falls in, so a payment cancelled in a later term shows "Paid" in the first and "Payment cancelled" in the second, and the second's brought forward already includes the payment's credit.
19. **Fee periods.** Charges, payments, cancellations, adjustments and opening entries are all placed by `effective_on`, never by the charge's `term_id`. Because the window opens at the first charge sent for the term, charges sent early during the holiday land in that term. A charge sent late shows in the later term, and its description still names its fee period ("Term fees, First term, 2026/2027").
20. **Whole-account under a filter.** `totals` (rule 4), the money tiles, the unpaid list (rule 6) and the family block ignore the term and always cover the whole account. Only `rows`, `total`, `page`, `term`, `broughtForward` and `closingMinor` follow it. Without a `termId` the response is the whole history, opening on the last page, and `term`, `broughtForward` and `closingMinor` are null. A filtered view paginates its own rows the same way, and the Brought forward row sits at the top of page 1. The family views stay whole history.
21. **Term options.** The response always carries `termOptions`: the school's terms whose window has opened on or before today, newest first, as `{ id, label }` (label "First term, 2026/2027"). The portal has no endpoint that lists terms, and `/school-years` needs `session:read`, so the statement carries them. An unknown term, or one from another school, answers 404, after the student scope check.

## Data

No new tables. Reads `journal_entry`, `journal_line`, `payment`, `payment_allocation`, `payment_void`, `adjustment`, `invoice`, `student`, `enrollment_placement`, `guardian`, `guardian_student` ([finance](../brainstorming/data-model-finance.md#model), [overview](../brainstorming/data-model-overview.md#foundation-model)).

Index needed for balances at school scale: `journal_line (organization_id, ledger_account_id, student_id)` including `debit_minor`, `credit_minor`. Balances are aggregated per request with this index; no materialised view until a school passes about 2,000 students.

## API

Module `student-account` (read-only). Contract: `contract.studentAccounts`.

| Method | Path                                                   | Permission                       | Request                                                                             | Response                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Errors                                                                    |
| ------ | ------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/finance/balances`                                    | `invoice:read` or `payment:read` | query `filter` (`owing`, `owing_current`, `owing_gone`, `paid`, `all`), `q`, `page` | `{ items: [{ studentId, name, admissionNumber, lifecycle, className, guardian: { name, phone } \| null, balanceMinor, paidMinor, totalMinor }], total, summary: { totalOwedMinor, studentsOwing, studentsInScope, receivedThisTermMinor?, paymentsThisTerm?, scopeNote } }`                                                                                                                                                                                                            | 400 bad filter; 403                                                       |
| GET    | `/finance/students/:studentId/statement`               | `invoice:read` or `payment:read` | query `page`, `termId`                                                              | `{ student: { id, name, admissionNumber, className, campusName, archived }, totals: { balanceMinor, totalMinor, paidMinor, reducedMinor }, rows: [{ entryId, effectiveOn, reference, description, status, amountMinor, link }], unpaid: [{ reference, outstandingMinor }], family: { guardianId, guardianName, childCount } \| null, term: { id, label, fromOn, toOn \| null } \| null, broughtForward: { amountMinor } \| null, closingMinor \| null, termOptions: [{ id, label }] }` | 403; 404 other school or out of scope, or an unknown or other-school term |
| GET    | `/finance/guardians/:guardianId/statement`             | `invoice:read` or `payment:read` | —                                                                                   | `{ guardian: { id, name }, familyTotalMinor, children: [<student statement>] }`                                                                                                                                                                                                                                                                                                                                                                                                        | 403; 404 other school, or no child in scope                               |
| GET    | `/finance/students/:studentId/balance-before/:entryId` | `invoice:read`                   | —                                                                                   | `{ broughtForwardMinor }`                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 403; 404. May instead be folded into the charge detail response           |

The portal (M3.7) reuses the statement services behind `readOwn` routes; not specified here.

## Acceptance criteria

1. Given Chika (Lekki), when she opens Who owes, then only Lekki students are counted, the first tile's sub-line reads "Lekki campus", and the default filter is Owing.
2. Given a student recorded as Left with ₦12,000 owing, when the filter is "Owing: left or graduated", then they are listed with " · left" after their number; with "Owing: current students" they are not.
3. Given David holds ₦5,000 credit, when the filter is Paid up, then David shows "₦5,000 extra paid".
4. Given the filter is Owing and nobody owes, then the empty state reads "Nobody owes fees" / "Every student you look after is paid up."
5. Given an Ikeja student id, when Chika opens their statement, then she sees "No student account here" and the API answers 404.
6. Given Ada was charged term fees with a 5% sibling discount and paid ₦180,000, when her statement opens, then it shows a Charged row for the fees, a Reduced row for the discount, a Paid row "Payment RCT-2026-00088 from Ngozi Okeke (Bank transfer)", and the footer equals her balance.
7. Given a payment was cancelled, then the statement shows the original Paid row and a "Payment cancelled" row, Paid excludes it, Total doesn't include the reversal, and Total − Reduced − Paid equals the balance.
8. Given David is in credit, when Chika (with `adjustment:create`) opens his statement, then the callout reads "₦5,000 was paid in extra. It is taken off the next fees automatically, or you can pay it back." and **Pay the extra back** opens the refund request with ₦5,000 and David chosen.
9. Given the principal (no `adjustment:create`), then the callout shows without the button.
10. Given Ngozi pays for three in-scope children, when Chika opens Ada's statement, then **Family view (3)** shows; pressing it shows "Family statement: Ngozi Okeke", three child tiles and Family total.
11. Given Ada has unpaid charges, then the footer lists them oldest first with what is still unpaid on each.
12. Given a member with `payment:read` only, then Who owes opens; with neither permission the API answers 403.
13. Given 25 students owe, then the table shows 10 per page sorted by balance, highest first.
14. Given a charge sent when Ada already owed ₦40,000, when the charge page asks for brought forward, then it is ₦40,000.
15. Given Ada owes ₦60,000, Chidi owes ₦20,000 and Tobi holds ₦5,000 credit, when Chika opens the family view, then Family total is ₦80,000 and its sub-line reads "Owed across all children · ₦5,000 extra paid kept separately".
16. Given a statement with 25 entries, when it opens, then it shows page 3 (the newest entries).
17. Given a payment taken in the first term and cancelled in the second, when the first term is chosen, then its Paid row shows and no cancellation does; when the second term is chosen, then a "Payment cancelled" row shows and Brought forward includes the payment's credit; the whole-history statement still lists both rows, and the brought forward plus the signed rows equals the balance.
18. Given the second term's first charge was sent before its start date, when payments are taken on the day the window opened and on the day before it, then the first is in the second term and the second is in the first term, and each term's brought forward plus its rows equals its closing.
19. Given a student whose first entry falls inside the chosen term, when the term is chosen, then Brought forward shows ₦0 and the rows add up to the balance.
20. Given a term is chosen, then the money tiles, the unpaid list and the totals are the same as without it, and an earlier term's closing equals the next term's Brought forward.
21. Given the id of another school's term, when a bursar or a guardian opens a statement with it, then the API answers 404; an out-of-scope student with a valid term also answers 404.
22. Given Ada's statement, when the bursar picks "First term, 2026/2027" in the Term select, then page 1 starts with "Brought forward" and the footer reads "Owing at end of term"; choosing "Whole history" returns to the full history on its last page. The family view has no Term select.

## Tests

- Unit: Total/Reduced/Paid identity over a mixed history (charge, discount line, payment, cancellation, reduction, refund, opening credit); row labels per entry kind; oldest-first unpaid matching; brought-forward calculation; lifecycle filter mapping. Web: tile copy, filter options, credit callout and button gating, family toggle.
- Unit (term filter): the date-keyed brought forward and `termSlice` (₦0 with nothing before, an entry on the first day is in, one on the day after the end is out, the latest term has no end, brought forward plus the rows equals closing, one window's closing equals the next one's brought forward over a mixed history), the term windows with no gaps or overlaps, and `termOptions`. Web: the Term select, the Brought forward row on page 1, the footer label and the reset to whole history.
- Integration (`api:test-integration`):
  - Term filter, all read with `pageSize=50`: a payment cancelled after the term, a charge sent before the term starts with payments either side of the window opening, and a student with nothing before the term. Each checks that the latest term's brought forward plus the signed rows equals the balance, an earlier term's closing equals the next term's brought forward, and `totals` and `unpaid` are unchanged; another school's term id answers 404; ledger row counts do not change.
  - Isolation: another school's student or guardian answers 404 on every route; a Lekki bursar gets 404 for an Ikeja student and for a guardian whose children are all in Ikeja; a family view lists only in-scope children.
  - Balances computed from real journal rows match the ledger; a leaver keeps their debt in "owing_gone".
  - Received this term counts only in-scope allocations of a split payment.
  - 403 without either read permission; 200 with either one (any-of guard).
- E2E (required, `eduvault-e2e`): bursar filters Who owes, opens a statement, records a payment from it and sees the balance drop without leaving the page; opens the family view.

## Open decisions

| #       | Question                                                                       | Options                                                                                                             | Recommendation                                                                                                      | Confidence                                               | Decided                                                                                                              |
| ------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| OD-54-1 | Gate for Who owes and statements                                               | (a) `invoice:read` or `payment:read` (prototype); (b) a single permission                                           | (a), which needs an any-of form of `@OrganizationAuth`                                                              | High: the bursar and administrator roles both rely on it | [D-012](../technical-reference.md#decision-log): any-of guard                                                        |
| OD-54-2 | Term or session filter on the statement, starting with a "Brought forward" row | (a) Whole history, paginated (prototype); (b) filter by term with a computed brought-forward row                    | (a) for M3.4, open on the last page; (b) when a statement passes a few pages                                        | Medium                                                   | [D-341](../technical-reference.md#decision-log): (b) built for staff and the portal, whole history stays the default |
| OD-54-3 | Family total when one child is in credit and another owes                      | (a) Signed sum (prototype; credit offsets debt in the total); (b) sum of what is owed only, credit shown separately | (b): each child keeps their own account, and credit isn't moved between siblings without a refund and a new payment | Medium                                                   | [D-038](../technical-reference.md#decision-log): owed added up, credit shown separately                              |
| OD-54-4 | Balance performance                                                            | (a) Aggregate journal lines per request with an index; (b) a materialised view refreshed on post                    | (a) until a school passes about 2,000 students                                                                      | Medium                                                   | Adopted                                                                                                              |
| OD-54-5 | Which guardian's family when several pay                                       | (a) The first paying guardian (prototype); (b) a picker when there are several                                      | (a) for M3.4, (b) later                                                                                             | Medium                                                   | Adopted                                                                                                              |
| OD-54-6 | Export Who owes (CSV or print)                                                 | (a) None; (b) CSV of the current filter                                                                             | (b): bursars send debtor lists to the owner                                                                         | Low: not in the prototype                                | Deferred (not v1)                                                                                                    |

## Prototype gaps noticed

- "Total" counts cancellation reversals and refunds as charges, and "Paid" still includes cancelled payments; the build uses rule 4.
- Cancelled-payment and refund rows are labelled "Charged".
- The cancellation description reads "Void: Void of RCT-…".
- "Received this term" counts the full amount of a payment split with an out-of-scope child.
- The family view is UI state only and carries over when opening another student.
- The statement opens on its oldest page, so recent activity is on the last page.
- The guardian column shows the first guardian when nobody is marked as paying fees, which may not be who pays.
- There is no brought-forward line on the whole-history statement; it appears under a term filter ([D-341](../technical-reference.md#decision-log)), and the charge page keeps its own.
- No export (deferred, OD-54-6).

## Dependencies

- M3.1 ledger core ([56](56-money-accounts-and-categories.md)).
- M3.3 charges (the main source of entries) and M3.4 payments ([53](53-payments.md)).
- M2.4 and M2.5 students, guardians and lifecycle (Left, Graduated, Inactive).
- M1.1 guard: an any-of permission form for `invoice:read` or `payment:read` ([D-012](../technical-reference.md#decision-log)).

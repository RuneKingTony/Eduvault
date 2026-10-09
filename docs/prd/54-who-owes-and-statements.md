# PRD: Who owes and statements

- Status: draft (pre-spec)
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
- Out of scope answers 404 [tenancy-001]; with neither `invoice:read` nor `payment:read` answers 403.
- The family view lists only the paying guardian's children who are in the viewer's scope.

## Screens

Who owes is the Finance nav item **Fees** (section Finance, nav order 1, phase F1). The Fees sub-tab strip shows "Who owes", "Charge students", "Charges", "School fees", "Other fees", each only if the viewer can open it.

Command menu (⌘K) quick action: "See who owes fees" (hint "Fees"), shown with `invoice:read`.

### Who owes

- Route `/finance/accounts`, web-admin, nav title "Fees", nav order 1, phase F1, gate `invoice:read` or `payment:read`.
- Header: title "Who owes"; description "Students with school fees still to pay."; info tip "What a family owes is worked out from every charge and payment, so nobody types it in by hand." No header actions.
- **Stat tiles**, three:

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
- The statement itself has no brought-forward row: it shows the whole history, paginated. A term filter that starts with a brought-forward row comes later, once statements run past a few pages.

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
8. **Received this term** = the sum of in-scope allocations of fee payments (store-sale payments excluded, as on the dashboard, [D-026](../technical-reference.md#decision-log)) that are Recorded or Cancellation waiting, dated on or after the earlier of the current term's start and the first charge sent for that term. For a campus-scoped viewer only allocations to in-scope students count. Store sale payments count here, as they do on Payments ([53](53-payments.md#business-rules) rule 22); only the dashboard's money tiles leave them out ([D-026](../technical-reference.md#decision-log)).
9. **Credit is used automatically.** Because the balance is a sum, credit held reduces what the next charge leaves owing. Nothing has to be applied by hand.
10. **Pay the extra back** shows only when the balance is negative and the viewer has `adjustment:create`. It opens the refund request prefilled with kind Refund, this student, and amount = the credit held; the refund rules are in [55](55-discounts-and-refunds.md).
11. **Family.** The family is the student's first guardian marked as paying fees (by link order). The family view lists that guardian's in-scope children, each with their own account. The family total adds up what each child owes; a child's credit shows on their own tile and is never netted against a sibling's debt ([D-038](../technical-reference.md#decision-log)). A student with no paying guardian has no family view.
12. **Search** matches name or admission number; the filter applies before search; both apply before pagination.
13. **Statement scope.** The statement lists every entry touching the student's receivable account, whatever campus each line carries, once the student is in scope.
14. **Read-only.** Neither screen changes anything; actions open the payment or adjustment flows, which check their own permissions.

## Data

No new tables. Reads `journal_entry`, `journal_line`, `payment`, `payment_allocation`, `payment_void`, `adjustment`, `invoice`, `student`, `enrollment_placement`, `guardian`, `guardian_student` ([finance](../brainstorming/data-model-finance.md#model), [overview](../brainstorming/data-model-overview.md#foundation-model)).

Index needed for balances at school scale: `journal_line (organization_id, ledger_account_id, student_id)` including `debit_minor`, `credit_minor`. Balances are aggregated per request with this index; no materialised view until a school passes about 2,000 students.

## API

Module `student-account` (read-only). Contract: `contract.studentAccounts`.

| Method | Path                                                   | Permission                       | Request                                                                             | Response                                                                                                                                                                                                                                                                                                                               | Errors                                                          |
| ------ | ------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| GET    | `/finance/balances`                                    | `invoice:read` or `payment:read` | query `filter` (`owing`, `owing_current`, `owing_gone`, `paid`, `all`), `q`, `page` | `{ items: [{ studentId, name, admissionNumber, lifecycle, className, guardian: { name, phone } \| null, balanceMinor, paidMinor, totalMinor }], total, summary: { totalOwedMinor, studentsOwing, studentsInScope, receivedThisTermMinor, paymentsThisTerm, scopeNote } }`                                                              | 400 bad filter; 403                                             |
| GET    | `/finance/students/:studentId/statement`               | `invoice:read` or `payment:read` | query `page`                                                                        | `{ student: { id, name, admissionNumber, className, campusName, archived }, totals: { balanceMinor, totalMinor, paidMinor, reducedMinor }, rows: [{ entryId, effectiveOn, reference, description, status, amountMinor, link }], unpaid: [{ reference, outstandingMinor }], family: { guardianId, guardianName, childCount } \| null }` | 403; 404 other school or out of scope                           |
| GET    | `/finance/guardians/:guardianId/statement`             | `invoice:read` or `payment:read` | —                                                                                   | `{ guardian: { id, name }, familyTotalMinor, children: [<student statement>] }`                                                                                                                                                                                                                                                        | 403; 404 other school, or no child in scope                     |
| GET    | `/finance/students/:studentId/balance-before/:entryId` | `invoice:read`                   | —                                                                                   | `{ broughtForwardMinor }`                                                                                                                                                                                                                                                                                                              | 403; 404. May instead be folded into the charge detail response |

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

## Tests

- Unit: Total/Reduced/Paid identity over a mixed history (charge, discount line, payment, cancellation, reduction, refund, opening credit); row labels per entry kind; oldest-first unpaid matching; brought-forward calculation; lifecycle filter mapping. Web: tile copy, filter options, credit callout and button gating, family toggle.
- Integration (`api:test-integration`):
  - Isolation: another school's student or guardian answers 404 on every route; a Lekki bursar gets 404 for an Ikeja student and for a guardian whose children are all in Ikeja; a family view lists only in-scope children.
  - Balances computed from real journal rows match the ledger; a leaver keeps their debt in "owing_gone".
  - Received this term counts only in-scope allocations of a split payment.
  - 403 without either read permission; 200 with either one (any-of guard).
- E2E (opt-in): bursar filters Who owes, opens a statement, records a payment from it and sees the balance drop without leaving the page; opens the family view.

## Open decisions

| #       | Question                                                                       | Options                                                                                                             | Recommendation                                                                                                      | Confidence                                               | Decided                                                                                 |
| ------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| OD-54-1 | Gate for Who owes and statements                                               | (a) `invoice:read` or `payment:read` (prototype); (b) a single permission                                           | (a), which needs an any-of form of `@OrganizationAuth`                                                              | High: the bursar and administrator roles both rely on it | [D-012](../technical-reference.md#decision-log): any-of guard                           |
| OD-54-2 | Term or session filter on the statement, starting with a "Brought forward" row | (a) Whole history, paginated (prototype); (b) filter by term with a computed brought-forward row                    | (a) for M3.4, open on the last page; (b) when a statement passes a few pages                                        | Medium                                                   | Adopted                                                                                 |
| OD-54-3 | Family total when one child is in credit and another owes                      | (a) Signed sum (prototype; credit offsets debt in the total); (b) sum of what is owed only, credit shown separately | (b): each child keeps their own account, and credit isn't moved between siblings without a refund and a new payment | Medium                                                   | [D-038](../technical-reference.md#decision-log): owed added up, credit shown separately |
| OD-54-4 | Balance performance                                                            | (a) Aggregate journal lines per request with an index; (b) a materialised view refreshed on post                    | (a) until a school passes about 2,000 students                                                                      | Medium                                                   | Adopted                                                                                 |
| OD-54-5 | Which guardian's family when several pay                                       | (a) The first paying guardian (prototype); (b) a picker when there are several                                      | (a) for M3.4, (b) later                                                                                             | Medium                                                   | Adopted                                                                                 |
| OD-54-6 | Export Who owes (CSV or print)                                                 | (a) None; (b) CSV of the current filter                                                                             | (b): bursars send debtor lists to the owner                                                                         | Low: not in the prototype                                | Deferred (not v1)                                                                       |

## Prototype gaps noticed

- "Total" counts cancellation reversals and refunds as charges, and "Paid" still includes cancelled payments; the build uses rule 4.
- Cancelled-payment and refund rows are labelled "Charged".
- The cancellation description reads "Void: Void of RCT-…".
- "Received this term" counts the full amount of a payment split with an out-of-scope child.
- The family view is UI state only and carries over when opening another student.
- The statement opens on its oldest page, so recent activity is on the last page.
- The guardian column shows the first guardian when nobody is marked as paying fees, which may not be who pays.
- There is no brought-forward line on the statement itself, only on the charge.
- No export (deferred, OD-54-6).

## Dependencies

- M3.1 ledger core ([56](56-money-accounts-and-categories.md)).
- M3.3 charges (the main source of entries) and M3.4 payments ([53](53-payments.md)).
- M2.4 and M2.5 students, guardians and lifecycle (Left, Graduated, Inactive).
- M1.1 guard: an any-of permission form for `invoice:read` or `payment:read` ([D-012](../technical-reference.md#decision-log)).

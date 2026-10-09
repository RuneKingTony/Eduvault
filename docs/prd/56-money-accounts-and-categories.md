# PRD: Money accounts and money categories

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M3.1` (ledger core, money accounts, money categories, opening balances) (see [roadmap](README.md))
- Related: [data-model-finance.md](../brainstorming/data-model-finance.md) (Accounts, Journal, Posting rules, Invariants, Reports), [data-model-overview.md](../brainstorming/data-model-overview.md) (Rules every table follows, Foundation model: opening balances, Permission list), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-005](../technical-reference.md#decision-log), [D-012](../technical-reference.md#decision-log), [D-042](../technical-reference.md#decision-log), [D-045](../technical-reference.md#decision-log)

## Summary

The ledger core every other money slice posts into: the seeded chart of accounts ("Money categories"), the named places money sits ("Money accounts", each with its own cash book), and the opening entries that carry a school's history in. A bursar or owner sees what is in each bank account and POS terminal without a spreadsheet; an accountant sees the school's money grouped by category with balances. Nothing here stores a balance; every figure is a sum of journal lines.

## Who uses it

| Persona                           | Permission(s)                                               | What they can do here                                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner (Funmi)                     | all                                                         | See every money account and category, add accounts and categories                                                                                                         |
| Bursar, one campus (Chika, Lekki) | `moneyAccount:read`, `ledger:read`, `feeLine:create`        | See their campus's money accounts and cash books; see categories with balances for their campus only. Can add a fee type (through `feeLine:create`), not other categories |
| Principal (custom role)           | `moneyAccount:read`, `campus:readAll`                       | See every money account and cash book. No Money categories (no `ledger:read`)                                                                                             |
| Administrator                     | none of these                                               | No access; the Accounts nav item is hidden                                                                                                                                |
| Accountant (a custom role)        | `ledger:read`, `ledger:manageAccounts`, `moneyAccount:read` | Read the categories, add categories                                                                                                                                       |
| Super admin acting read-only      | read permissions only                                       | Sees both pages; write buttons are hidden; writes answer 403 until a reason is given                                                                                      |

Scopes applied:

- **Campus scope.** A money account with a `campus_id` is visible to members of that campus and to anyone with `campus:readAll`. A school-wide money account (`campus_id` null) is visible only with `campus:readAll`; a campus bursar can still record payments into it (see [53-payments.md](53-payments.md)). This settles the finance doc's last "still open" item as the prototype shows it ([D-045](../technical-reference.md#decision-log)).
- **Category balances** are summed over journal lines whose `campus_id` is in the viewer's campus scope. A member without `campus:readAll` never sees lines with a null `campus_id` (school-wide money).
- Out-of-scope rows answer 404; in scope without the permission answers 403 [tenancy-001]. Finance is campus-scoped, never class-scoped.

## Screens

Both screens sit under the Finance nav item **Accounts** (section Finance, nav order 4, phase F1). The item opens Money accounts. A sub-tab strip shows "Money accounts" and "Money categories", each only if the viewer can open it (`moneyAccount:read`, `ledger:read`). The nav item shows when the viewer can open either and opens the first one they can (the prototype hides it for a member with only `ledger:read`, because its root route is gated by `moneyAccount:read`).

### Money accounts

- Route `/finance/money-accounts`, web-admin, nav section Finance, nav title "Accounts", nav order 4, phase F1, gate `moneyAccount:read`. Breadcrumb: Finance › Money accounts.
- Header: title "Money accounts"; description "Where the money physically sits."; info tip "Each balance is worked out from every payment in and out, so nobody types it in by hand."; action **Add money account** (primary, plus icon), shown only with `moneyAccount:create`.
- Layout, in order:
  1. **Account tiles**, a 4-column grid, one per visible money account. Each tile: label = account name; icon by kind (bank: landmark, cash: banknote, POS: credit card); value = the account's ledger balance; sub-line = campus name or "School-wide", then " · ending 4417" when `account_last4` is set. Tiles are buttons; the selected tile has a primary ring and `aria-pressed="true"`. The first visible account is selected by default.
  2. **Hidden accounts callout** (info), shown when one or more school-wide accounts are hidden: "{n} school-wide account(s), such as the main bank account, is/are hidden. Seeing it/them needs campus:readAll. You can still record payments into it/them." (Singular and plural forms as written: "1 school-wide account, such as the main bank account, is hidden. Seeing it needs …. You can still record payments into it.") The prototype renders the permission as a chip; the product shows the plain sentence (see Prototype gaps).
  3. **Cash book card**, title "Cash book · {account name, campus, ••last4}" (history icon), description "Newest first. Choose an account above to switch." Table, newest first, 10 rows per page:

     | Column      | Content                                                                                                                                                      |
     | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
     | Date        | The entry's `effective_on`, `7 Oct 2026` format                                                                                                              |
     | Reference   | Monospace. A charge's number links to the charge; a payment shows its receipt number linking to the receipt; anything else shows the entry reference as text |
     | Description | The entry memo (e.g. "Receipt RCT-2026-00088 · Ngozi Okeke"), else the entry kind label                                                                      |
     | In          | Debit to this account, in success colour; blank if none                                                                                                      |
     | Out         | Credit to this account; blank if none                                                                                                                        |
     | Balance     | Running balance after this entry, bold                                                                                                                       |

     Empty: "No movements yet" (history icon).
- No accounts in scope: the tile grid is empty and the page shows the empty state "No money accounts in your scope" (landmark icon) in place of the cash book.
- **Add money account** sheet (`moneyAccount:create`):
  - Title "New money account"; description "A bank account, POS machine or cash box the school receives money into."
  - Fields:

    | Field         | Control                                                                                  | Required | Default      | Validation                                       |
    | ------------- | ---------------------------------------------------------------------------------------- | -------- | ------------ | ------------------------------------------------ |
    | Name          | text, placeholder "e.g. Access Bank savings"                                             | yes      | empty        | Not blank after trimming                         |
    | Kind          | select: "Bank" (`bank`), "POS terminal" (`pos`), "Cash box" (`cash`)                     | yes      | Bank         | One of the listed kinds                          |
    | Bank          | text, shown only for Bank, placeholder "e.g. GTBank"                                     | no       | empty        | Stored as `bank_name`                            |
    | Last 4 digits | text, `maxlength=4`, numeric keypad                                                      | no       | empty        | Exactly 4 digits when given (new rule, see gaps) |
    | Campus        | select: each campus in the creator's scope, plus "School-wide" only for `campus:readAll` | yes      | first option | Must be in the creator's scope                   |

  - Buttons: **Cancel** (ghost), **Add account** (primary, plus).
  - On submit: creates the money account and its asset ledger account under 1200 (code = next multiple of 10 above the highest child of 1200, so 1210, 1220 → 1230). The new account becomes the selected tile. Toast (success): "{name} added with ledger account {code}."
  - Without the permission: "You need moneyAccount:create." (prototype toast; the API answers 403).
- **Edit** and **Retire** (ghost, on the cash book card header, `moneyAccount:update`) for the selected account:
  - Edit sheet: title "Edit {name}"; fields Name, Bank (bank accounts only) and Last 4 digits, validated as above; **Save changes**. Toast "{name} saved."
  - Retire dialog: title "Retire {name}?"; body "It stops appearing when recording payments, refunds and deliveries. Its cash book is kept."; **Retire account** (destructive). Toast "{name} retired. Its cash book is kept." A retired tile shows a "Retired" badge and sorts after the active ones; there is no un-retire.
- States: loading shows skeleton tiles and table; error renders through `ErrorMessage`; denied: the nav item and route are hidden (the route redirects to the default screen); acting read-only: page renders, **Add money account**, **Edit** and **Retire** hidden.

### Money categories

- Route `/finance/ledger`, web-admin, not a nav item (sub-tab of Accounts), phase F1, gate `ledger:read`. Breadcrumb: Finance › Accounts › Money categories.
- Header: title "Money categories"; description "How the school’s money is grouped. This page is for your accountant."; info tip "Every payment and charge is filed under one of these categories."; action **Add category** (primary, plus), shown only with `ledger:manageAccounts`.
- Scope callout (info), shown when the viewer lacks `campus:readAll`: "Showing {Lekki campus} only." (campus names joined with ", " then " campus").
- Tabs: **Accounts** and **Journal** (`?tab=journal`). The prototype wires "Accounts", "Journal" and "Trial balance" but switches them off; M3.1 ships Journal, and Trial balance waits until after the first pilot term.
- **Chart table** (one card, no title), 10 rows per page:

  | Column  | Content                                                                                                                                                                                                                |
  | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Code    | Monospace code                                                                                                                                                                                                         |
  | Name    | Top-level rows bold; child rows indented with "└". Rows with a `system_key` carry a lock icon with the tip "Built in. The app uses this category, so it can’t be removed."                                             |
  | Type    | Plain words: asset "Money held or owed to us", liability "Money we owe", equity "Opening balance", income "Income", expense "Discounts and write-offs"                                                                 |
  | Balance | Header "Balance", or "Balance (your campuses)" when scoped. A parent's balance includes its children. Shown in natural sign: assets and expenses debit minus credit; liabilities, equity and income credit minus debit |

  Row order: each top-level account by code, followed by its children by code. Hidden from this list though kept in the books: 2100 "Refunds owed to families" and 4060 "Other charges" (the finance doc's rule).

- **Journal** tab (one card, "Journal", book icon, description "Every entry, newest first."): toolbar with **From** and **To** dates and a **Kind** select ("All kinds", then each journal kind in plain words). Table, newest first by `effective_on` then `journal_entry.sequence`, 10 per page: Date, Reference (linked as on the cash book), What (the memo, else the kind label), Amount (the entry's total debits). A row expands to its lines: Account (code and name), Student, Campus ("School-wide" when null), Debit, Credit. Only lines in the viewer's campus scope are listed; an entry with none is left out. Empty: "No entries yet".
- **Add a fee category** dialog (from **Add category**):
  - Title "Add a fee category"; description "A new kind of fee the school collects, filed under Fee income. Set its amounts afterwards on School fees or Other fees."
  - Fields: **Under** (select; the only option is "4000 Fee income"); **Name** (text, required, placeholder "e.g. Lesson fee").
  - Buttons: **Cancel** (ghost), **Add category** (primary).
  - On submit: adds a child of 4000 with code = highest child code + 10 (or parent code + 10 if none), type income. Toast (success): "**{name}** added as a fee type." (For a parent other than 4000, which the prototype never offers: "{code} {name} added under {parent}.")
  - Allowed with `ledger:manageAccounts`, or with `feeLine:create` when the parent is fee income. Otherwise: "You need permission to add categories."
- States: as Money accounts. Acting read-only: **Add category** hidden.

### Opening balances (no screen in the prototype)

The prototype seeds opening entries only (`OPEN-st-bola`, `OPEN-st-david`, and three more on 1 Sep 2026, memo e.g. "Opening balance from previous records", "Credit held from overpayment", "Third term 2025/2026 fees unpaid"). They appear:

- on the student statement as a row "Opening balance: {memo}", status "Charged" for a debt or "Reduced" for a credit (see [54-who-owes-and-statements.md](54-who-owes-and-statements.md));
- in the 3000 "Opening balance" balance on Money categories;
- in Who owes, as part of the balance.

A school's opening debts and credits, and the money already in each money account at go-live (rule 20), are posted through the bulk `POST /finance/opening-balances` endpoint during onboarding, run by the super admin acting in the school with a reason. A CSV upload screen comes when a second school onboards. Store opening stock (`OPEN-STORE-<campus>`) belongs to [61-store.md](61-store.md).

## Business rules

1. **Seeded chart.** Creating a school seeds the system ledger accounts in [Accounts](../brainstorming/data-model-finance.md#accounts) (1100, 1200, 1300, 2100, 3000, 4000, 4500, 5000, 5100, 5200, 5300) and the starter fee types under 4000 (4010 Tuition … 4080 Graduation fee, including 4060 Other charges). Seeding runs once per school and is idempotent.
2. **System accounts are fixed.** A row with `system_key` can't be retired, renamed to another type, or re-parented. Its type never changes.
3. **Codes are unique per school** (`UNIQUE (organization_id, code)`); a `system_key` is unique per school.
4. **New fee category code** = the parent's highest child code + 10, or the parent's code + 10 if it has none. Two concurrent creates must not get the same code: the unique constraint answers 409 for the loser and the client retries.
5. **Who can add a category.** `ledger:manageAccounts` may add a child under any non-system-locked parent the UI offers (today only 4000). `feeLine:create` alone may add only under `fee_income` (4000).
6. **Category names** are not blank and are unique among siblings (case-insensitive). New rule; the prototype doesn't check (see gaps).
7. **Money account creates its ledger account** in the same transaction: an asset child of 1200, code = next multiple of 10 above the highest child of 1200 (1210 → 1220 → 1230). Its name is the money account's name.
8. **Money account kinds** creatable from the screen: `bank`, `pos`, `cash` (a cash box). `gateway` waits for the gateway phase. A bank account may carry a `bank_name`.
9. **Money account campus** must be in the creator's campus scope; only `campus:readAll` can create a school-wide account (null `campus_id`).
10. **Visibility of school-wide accounts.** Without `campus:readAll`, school-wide accounts are left out of the list, the tiles and the cash book; the response carries a `hiddenSchoolWideCount` so the screen can show the callout. They still appear in the "Into" list when recording a payment and the "Refund paid from" list.
11. **Balances are derived.** A money account's balance is the sum of `debit_minor - credit_minor` on its ledger account. A category's balance is the sum over itself and its descendants, restricted to lines in the viewer's campus scope, shown in natural sign. No balance column exists anywhere.
12. **Cash book.** Lists every journal entry with a line on the account's ledger account, newest first by `effective_on` then `posted_at`, with the running balance computed oldest-first. Running balance is over the whole account, not the page.
13. **Hidden categories.** 2100 and 4060 are kept in the books and in every balance roll-up but not listed on Money categories until a screen uses them.
14. **Opening debt or credit** for a student is one journal entry with reference `OPEN-<student_id>`: Dr Fees receivable (student) / Cr Opening balance for a debt, or the reverse for a credit. Because the reference is unique per school, a student can have at most one opening entry, and re-running an import posts nothing twice.
15. **Opening lines carry the student's campus** (their placement campus for the current term, else home campus) on both lines.
16. **Entries never change.** Journal entries and lines are never updated or deleted. A wrong opening balance is corrected with an adjustment (see [55-discounts-and-refunds.md](55-discounts-and-refunds.md)), not by editing the entry.
17. **Every entry balances.** A deferred constraint trigger refuses a commit where an entry's debits differ from its credits.
18. **Every line has exactly one of debit or credit positive** (`CHECK`).
19. **Acting read-only.** A super admin acting without a reason gets 403 on every write here.
20. **Money account opening balance.** The money in an account at go-live is one entry with reference `OPEN-MA-<money_account_id>`: Dr the money account / Cr Opening balance, campus = the account's campus (null if school-wide), kind `opening`. At most one per account; a repeat posts nothing.
21. **Retired money accounts** (`retired_at` set) keep their cash book and balance, and still show on Money accounts with a "Retired" badge. They are left out of `for-recording`, so they can't receive payments, refunds or pay for deliveries (400 if sent). Name, bank and last 4 can be edited; kind and campus can't.
22. **Journal tab.** Lists entries and lines read-only, scoped by line campus as in rule 11. Nothing on it can be changed.

## Data

Tables (all from [data-model-finance.md](../brainstorming/data-model-finance.md#model) unless flagged):

- `ledger_account`, `money_account`: [Accounts](../brainstorming/data-model-finance.md#accounts).
- `journal_entry`, `journal_line`: [Journal](../brainstorming/data-model-finance.md#journal), with the deferred balance trigger and the per-line `CHECK`.
- `document_sequence`: [overview](../brainstorming/data-model-overview.md#rules-every-table-follows). Seeded here because every later slice needs it.
- `journal_entry.sequence` (identity), ordering entries posted together; posting goes through the ledger service in `common` ([D-042](../technical-reference.md#decision-log)).

The shared machinery (`document_sequence`, the journal tables and their triggers, references and idempotency, `ON DELETE RESTRICT`, system-account seeding) is specified in [03-foundation-ledger-and-documents.md](03-foundation-ledger-and-documents.md); where this section and 03 differ, 03 wins. Migrations for M3.1:

1. `ledger_account`, `money_account`, `journal_entry`, `journal_line`, `document_sequence`, with composite `(campus_id, organization_id)` FKs to `campus`, `ON DELETE RESTRICT` on everything that references money rows, and the balance trigger.
2. A seeding function (SQL or service) that inserts the system accounts and starter fee types for a school; called from school creation and backfilled for existing schools.

New or changed, not in the data-model docs (flagged):

- **Unique sibling name** on `ledger_account`: `UNIQUE (organization_id, parent_id, lower(name))` (rule 6).
- **`money_account.retired_at`** (rule 21). The model gives `ledger_account.retired_at` but none on `money_account`.
- **`OPEN-MA-<money_account_id>`** posting (Dr money account / Cr Opening balance, rule 20). A new posting rule; the finance doc covers only student debts and store stock.
- Money-account opening entries use the existing `opening` journal kind (no enum change).

## API

New module `ledger` (accounts and journal) and `money-account`. Contract types in `@eduvault/api-contract` under `contract.ledgerAccounts`, `contract.moneyAccounts`, `contract.openingBalances`.

| Method | Path                                    | Permission                                                               | Request                                                                                                                                                   | Response                                                                                                                                                                                                                       | Errors                                                                                                                   |
| ------ | --------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/finance/money-accounts`               | `moneyAccount:read`                                                      | —                                                                                                                                                         | `{ items: [{ id, name, kind, campusId, campusName, last4, ledgerAccountId, ledgerCode, balanceMinor }], hiddenSchoolWideCount }`                                                                                               | 403                                                                                                                      |
| GET    | `/finance/money-accounts/:id/cash-book` | `moneyAccount:read`                                                      | query `page`, `pageSize`                                                                                                                                  | `{ account, items: [{ entryId, effectiveOn, reference, kind, memo, link: { type: 'invoice'\|'payment'\|null, id }, inMinor, outMinor, runningBalanceMinor }], total }`                                                         | 403; 404 if the account is another school's, another campus's, or school-wide without `campus:readAll`                   |
| POST   | `/finance/money-accounts`               | `moneyAccount:create`                                                    | `{ name, kind: 'bank'\|'pos'\|'cash', bankName?, last4?, campusId: string\|null }`                                                                        | 201 money account                                                                                                                                                                                                              | 400 blank name, bad kind, last4 not 4 digits; 403; 404 campus out of scope; 403 `campusId` null without `campus:readAll` |
| PATCH  | `/finance/money-accounts/:id`           | `moneyAccount:update`                                                    | `{ name?, last4?, bankName?, retired? }`                                                                                                                  | 200 money account                                                                                                                                                                                                              | 400; 403; 404 out of scope                                                                                               |
| GET    | `/finance/money-accounts/for-recording` | `payment:record` or `adjustment:create`                                  | —                                                                                                                                                         | `{ items: [{ id, label }] }`: non-gateway accounts that are school-wide or in scope                                                                                                                                            | 403                                                                                                                      |
| GET    | `/finance/journal`                      | `ledger:read`                                                            | query `from`, `to`, `kind`, `page`                                                                                                                        | `{ items: [{ entryId, effectiveOn, reference, kind, memo, totalMinor, link, lines: [{ accountCode, accountName, studentName?, campusName?, debitMinor, creditMinor }] }], total }`, lines limited to the viewer's campus scope | 400 bad filter; 403                                                                                                      |
| GET    | `/finance/ledger-accounts`              | `ledger:read`                                                            | —                                                                                                                                                         | `{ scoped: boolean, items: [{ id, code, name, type, parentId, systemKey, balanceMinor }] }`, hidden codes left out, ordered as rule in Screens                                                                                 | 403                                                                                                                      |
| POST   | `/finance/ledger-accounts`              | `ledger:manageAccounts`, or `feeLine:create` when parent is `fee_income` | `{ parentId, name }`                                                                                                                                      | 201 ledger account                                                                                                                                                                                                             | 400 blank name; 403; 404 parent not in school; 409 duplicate sibling name or code race                                   |
| POST   | `/finance/opening-balances`             | `ledger:manageAccounts`                                                  | `{ items: [{ studentId, amountMinor, direction: 'debt'\|'credit', memo, effectiveOn }], moneyAccounts?: [{ moneyAccountId, amountMinor, effectiveOn }] }` | `{ posted: n, skipped: [{ studentId?, moneyAccountId?, reason: 'already_posted' }] }`                                                                                                                                          | 400 non-positive amount; 403; 404 a student out of scope                                                                 |

`for-recording` exists because the "Into" and "Refund paid from" lists must include school-wide accounts that the main list hides. Any-of permissions need the guard extension noted in [54-who-owes-and-statements.md](54-who-owes-and-statements.md#dependencies).

## Acceptance criteria

1. Given a new school, when it is created, then the eleven system accounts and eight starter fee types exist with the codes in the finance doc, and creating it again seeds nothing twice.
2. Given Chika (Lekki bursar, no `campus:readAll`) and a school-wide GTBank account plus a Lekki POS account, when she opens Money accounts, then she sees one tile (Moniepoint POS, Lekki) and the callout "1 school-wide account, such as the main bank account, is hidden. … You can still record payments into it."
3. Given Funmi (owner), when she opens Money accounts, then she sees both tiles, no callout, and the GTBank cash book selected.
4. Given Chika, when she requests the GTBank cash book by id, then the API answers 404.
5. Given a payment of ₦300,000 into GTBank, when the owner opens the GTBank cash book, then the newest row shows "In ₦300,000" and the running balance includes it.
6. Given an owner, when she adds "Access Bank savings", kind Bank, last 4 "1234", school-wide, then the tile appears selected with ₦0 and the toast says "Access Bank savings added with ledger account 1230."
7. Given a campus bursar with `moneyAccount:create`, when she submits a school-wide account, then the API answers 403.
8. Given last 4 "12a", when the form is submitted, then the API answers 400.
9. Given Chika, when she opens Money categories, then the "Showing Lekki campus only." callout shows, the balance header reads "Balance (your campuses)", and no school-wide line counts toward any balance.
10. Given the chart, when Money categories renders, then 2100 and 4060 are not listed, 4000's balance includes all its children, and income shows as a positive number.
11. Given a member with `feeLine:create` only, when they add "Lesson fee" under 4000, then 4090 is created and the toast says "Lesson fee added as a fee type."
12. Given "Tuition" already exists under 4000, when someone adds "tuition", then the API answers 409.
13. Given a member without `ledger:manageAccounts` or `feeLine:create`, when they post a category, then the API answers 403.
14. Given an opening balance import for Bola (₦12,000 debt), when it is posted twice, then one `OPEN-st-bola` entry exists and the second call reports it as skipped.
15. Given any attempt to insert an unbalanced entry, when the transaction commits, then it fails and nothing is written.
16. Given a super admin acting read-only, when they POST a money account, then the API answers 403.
17. Given an owner, when she adds "Lekki cash box", kind Cash box, campus Lekki, then it appears with a banknote icon and is offered in "Into" when recording a Lekki payment.
18. Given the owner retires "Access Bank savings", then its tile shows "Retired" with its cash book kept, it is gone from `for-recording`, and a payment into it answers 400.
19. Given GTBank held ₦2,400,000 at go-live, when the opening import posts it, then `OPEN-MA-<GTBank id>` posts Dr GTBank / Cr 3000 ₦2,400,000 and the GTBank cash book starts at that balance; a second import skips it.
20. Given an accountant with `ledger:read` but not `moneyAccount:read`, then the Accounts nav item shows and opens Money categories.
21. Given Chika opens the Journal tab, then she sees entries with lines on Lekki only, and no school-wide line.

## Tests

- Unit (`nx run api:test`): next-code calculation for categories and money accounts; natural-sign balance; parent roll-up; hidden-codes filter; cash-book running balance (oldest-first sum, newest-first display). `nx run web-admin:test`: tiles and callout copy (singular and plural), add-account form validation, Add category gating.
- Integration (`api:test-integration`):
  - Isolation for `ledger_account`, `money_account`, `journal_entry`, `journal_line`, `document_sequence`: school B can't read or post against school A's rows (404).
  - Campus isolation: an Ikeja account's cash book is 404 for a Lekki-only member; a school-wide account is 404 without `campus:readAll` and listed in `for-recording`.
  - The balance trigger rejects an unbalanced entry; the per-line `CHECK` rejects a line with both or neither side.
  - `UNIQUE (organization_id, reference)` makes a second `OPEN-<student_id>` a no-op.
  - Category code race: two concurrent creates under 4000 produce one 201 and one 409.
  - 403 for each endpoint without its permission; 403 for acting read-only writes.
- E2E (opt-in, `eduvault-e2e`): owner adds a money account and sees it selected; Lekki bursar sees the hidden-accounts callout and cannot reach the GTBank cash book by URL.

## Open decisions

| #       | Question                                                                      | Options                                                                                                                             | Recommendation                                                                                                                                      | Confidence                                                                              | Decided |
| ------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| OD-56-1 | Ship the Journal and Trial balance tabs on Money categories?                  | (a) Ship both in M3.1; (b) ship Journal only (entry list with lines, filter by date and kind); (c) neither until an accountant asks | (b) in M3.1: the journal is a plain read of rows that already exist and is what an auditor asks for first; trial balance after the first pilot term | Medium: the prototype built and then hid them, so demand is unproven                    | Adopted |
| OD-56-2 | How does a school enter opening student debts and credits?                    | (a) A screen per student; (b) CSV upload screen; (c) bulk API endpoint run by the super admin during onboarding                     | (c) for M3.1 with the endpoint above; add a CSV upload screen when a second school onboards                                                         | Medium: onboarding is done by the developer today, but a screen will be needed at scale | Adopted |
| OD-56-3 | Can staff create a cash money account (cash box)?                             | (a) Add "Cash box" to Kind; (b) keep Bank and POS only                                                                              | (a): the sheet's own description promises a cash box, and cash payments need somewhere to land other than the bank                                  | High: the seed records cash into the GTBank account, which misstates the bank balance   | Adopted |
| OD-56-4 | Editing and retiring money accounts (`moneyAccount:update` exists, no UI)     | (a) Rename and edit last 4 only; (b) also retire (hidden from "Into", kept in history); (c) nothing in v1                           | (b): a closed bank account must stop appearing in "Into" without losing its history                                                                 | Medium                                                                                  | Adopted |
| OD-56-5 | Opening balance for money accounts (cash in the bank at go-live)              | (a) `OPEN-MA-<id>` entry Dr money account / Cr Opening balance; (b) none, accounts start at zero                                    | (a): otherwise the cash book never matches the bank statement                                                                                       | Medium: not in the finance doc's posting rules, so it adds a rule                       | Adopted |
| OD-56-6 | Accounts nav item for a member with `ledger:read` but not `moneyAccount:read` | (a) The nav item opens the first sub-tab the member can open; (b) keep it hidden                                                    | (a): an accountant role would otherwise have no way in                                                                                              | High                                                                                    | Adopted |
| OD-56-7 | Should `bank_name` be captured?                                               | (a) Add a "Bank" text field when Kind is Bank; (b) drop the column                                                                  | (a): receipts and cash books name the bank; the seed already has "GTBank"                                                                           | Medium                                                                                  | Adopted |

## Prototype gaps noticed

- The Kind select offers only Bank and POS terminal, though the description says "or cash box" and the model has `cash`.
- No `bank_name` field, though the model and seed have it.
- Last 4 digits accepts any 4 characters; no validation.
- No edit or retire for money accounts, though `moneyAccount:update` exists.
- The campus select defaults to an empty value that doesn't exist for a campus-scoped member; the build defaults to the first option.
- The hidden-accounts callout embeds a permission chip (`campus:readAll`), which is demo tooling; the product sentence should name the capability in words ("Seeing them needs access to every campus.").
- Money categories rows follow seed order, so 1300 appears after 5100. The build orders by code.
- Category names are not checked for duplicates or blanks.
- The Journal and Trial balance tabs are wired (`samples` list them) but switched off.
- No opening-balance screen; opening entries exist only in the seed.
- Money account balances start at zero with no way to bring in the bank's real balance.
- The seed's next money-account code is computed as "max + 10 − (max mod 10)", which works only when codes are multiples of 10.

## Dependencies

- M1.1 permission list in `libs/policy` with `ledger` and `moneyAccount` resources, and the guard; an any-of guard for `for-recording` ([D-012](../technical-reference.md#decision-log)).
- M2.2 campuses (composite FKs to `campus`).
- M2.4 students (for opening balances and `journal_line.student_id`).
- `document_sequence` lands here and is used by M3.3 and later.

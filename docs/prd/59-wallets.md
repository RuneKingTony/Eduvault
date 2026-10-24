# PRD: Wallets

- Status: draft (EDU-304, first phase of the family wallets epic EDU-303: the ledger core, staff top-ups and the guardian API; Monnify, the guardian screens, refunds and migration of old credits follow in their own issues)
- Source: not in the brand prototype. The Wallets screens follow [Payments](53-payments.md) and its Record payment sheet.
- Milestone and slice: `M3.9` (see [roadmap](README.md))
- Related: [53-payments.md](53-payments.md) (reference replay, proof, the sheet this one is modelled on), [56-money-accounts-and-categories.md](56-money-accounts-and-categories.md) (2200 and the Monnify account), [54-who-owes-and-statements.md](54-who-owes-and-statements.md), [72-portal.md](72-portal.md), [technical reference](../technical-reference.md) decisions D-385 to D-391, [ADR 0008](../adr/0008-append-only-balanced-journal.md)

## Summary

A family can pay money in ahead and spend it on its children's charges. Staff record the money a guardian hands over (**Record top-up**, with the receipt) and see every wallet; the guardian, through the API in this phase, pays charges from it and can set some aside for one child. A wallet is a view over journal lines on `2200 Student wallets`; no balance is stored. Paying online through Monnify, the guardian's Fees screen, refunds and auto-pay are later phases.

## Who uses it

| Persona                               | Permission(s)                    | What they can do here                                                                          |
| ------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Owner                                 | all                              | See every wallet, record a top-up                                                              |
| Bursar (Lekki or Ikeja)               | `wallet:read`, `wallet:topUp`    | See and top up the wallets of families with a child on their campuses                          |
| Administrator, Principal              | `wallet:read`                    | See wallets; no **Record top-up** button, the `POST` answers 403                               |
| Guardian                              | `wallet:readOwn`, `wallet:spend` | See their own wallet; pay their children's charges from it; set money aside (API only for now) |
| Student, teacher, member with no role | none                             | Not shown; the route redirects, the API answers 403                                            |
| Acting super admin, no reason         | read permissions                 | Button hidden; `POST` answers 403 `ActingReadOnly`, audited                                    |

Scope: a staff member sees a wallet when the school matches and either they see every campus or any child linked to the wallet's guardian is on a campus they see. Anything else answers 404; a caller who can see it but lacks the permission answers 403 [tenancy-001]. A guardian reaches only their own wallet, found from the signed-in user, never from an id in the URL.

## Screens

### Wallets

- Route `/finance/wallets`, web-admin, Finance, after Payments, gate `wallet:read`, icon `wallet`. Search `q`, `page`.
- Header: title **Wallets** with an info tooltip, description "One wallet for each paying guardian. Open one to record a top-up."
- A summary line: "{n} wallets · ₦X held · ₦Y set aside · ₦Z free to use", over everything the caller can see, not only the page.
- One card with a search box (placeholder "Search guardian name or phone"), a count, the table and the numbered pager (10 a page).
- Table columns: **Family** (avatar, guardian name, phone), **Children** (count), **Balance**, **Set aside**, **Free to use**. Money always shows kobo, so an empty wallet reads **₦0.00**. Each row opens the wallet.
- States: loading (skeleton), error (`ErrorMessage`), empty "No wallets yet" ("A wallet appears when a guardian is set to pay a child's fees."), no match "No wallets match" ("Try another name or phone number.").

### Wallet

- Route `/finance/wallets/$walletId` (file `wallets_.$walletId.tsx`), gate `wallet:read`, search `page` (movements) and `topup=1` (the sheet is open). Breadcrumb Wallets › {guardian}.
- Header: guardian name, phone, and **Record top-up** (primary, `wallet:topUp` only).
- Three cards: **Balance**, **Set aside**, **Free to use**.
- **Children** card: child (linked to their statement when on the caller's campuses), **Owes**, **Set aside**, **Can use** (the most that child's charges can take now).
- **Movements** card: date, movement ("Top-up from Uncle Bode · Cash", "Paid Ada Okeke's charges"), reference with a **Receipt** link for a top-up, who made it, and the signed amount; newest first, paged.
- States: loading, error, not found ("No wallet here", back to Wallets).

### Record top-up (sheet)

- Opened from **Record top-up**. Title "Record a top-up", description "Money {guardian} has paid into the family wallet."
- Fields: **Amount received (₦)** (required, above zero), **Received on** (default today, not in the future), **Into** (accounts that take the chosen way of paying; never the Monnify account), **How they paid** (the ways Payment rules switch on), **Receipt or proof of payment** (required file: photo, screenshot, PDF; uploaded as `wallet_proof`), **Paid in by** (optional), **Our reference** (generated, editable; the same top-up entered twice is recorded once).
- **Record top-up** opens a confirmation (family, amount, account), then posts. Toast "₦X added to {guardian}'s wallet." A replay warns "Reference … was already recorded. Nothing was added twice." The wallets, money accounts, ledger and home figures refresh.
- Validation: "Enter an amount above zero.", "Add the receipt (a photo, screenshot or PDF) before recording.", "The proof must be a photo, a screenshot or a PDF.", "Enter a reference. …".

## Business rules

1. **A wallet is journal lines.** Balance = credits minus debits on `2200` tagged with the family (`journal_line.family_id`, the guardian's id). Set aside = the sum of the family's `wallet_earmark` rows. Free to use = balance − set aside. Nothing is stored.
2. **One wallet per paying guardian**, created by a trigger the first time a `guardian_student` row has `pays_fees` ([D-387](../technical-reference.md#decision-log)). A family with no paying guardian has none; a top-up for a guardian who no longer pays for any child answers 400.
3. **Top-up.** Dr the chosen cash, bank or POS ledger account, Cr 2200 with the family, one balanced `wallet_topup` entry. The money account must be usable by the caller and not a gateway (400); a retired one answers 400, a missing one 404. The way of paying must be on in Payment rules and the date not in the future. The receipt must be the caller's own unused `wallet_proof` upload (404 if not found, 409 if already attached).
4. **Replay.** A top-up is applied once per school and reference. The same request again answers 200 `replayed: true`; the same reference with another body, from another family or against a journal reference another entry holds answers 409 ([D-390](../technical-reference.md#decision-log)).
5. **Spend.** One request with an amount per child. Each line is capped at the child's receivable balance and at that child's earmark plus the family's free money, lines taken in order. A line over its cap answers 422 with the most that child can use. Earmark money is used first ([D-388](../technical-reference.md#decision-log)).
6. **Spend postings.** One balanced `wallet_spend` entry: per child Dr 2200 (family, student) and Cr 1100 (student, current campus). The spend shows on each child's statement as "Paid from wallet" and counts as paid.
7. **Earmarks.** A set may not exceed free money, a release may not exceed that child's earmark (422 with the limit); each is idempotent by reference (200 `replayed: true`, 409 for another body). Earmarks post no journal entry ([D-389](../technical-reference.md#decision-log)).
8. **Concurrency.** The wallet row is locked for a spend, set or release, so simultaneous requests never use the same free money.
9. **Guardian routes** resolve the guardian from `guardian.user_id`; no wallet answers 404; a child who is not linked to that guardian answers 404 ([D-391](../technical-reference.md#decision-log)).
10. **Append-only.** `wallet`, `wallet_topup`, `wallet_spend` and `wallet_earmark` refuse UPDATE and DELETE. Undoing a top-up is a later phase.
11. **Movements add up.** The movements of a wallet always sum to its journal balance.
12. **Activity.** A top-up writes `wallet.topped_up` on each campus the family has a child on; a spend writes `wallet.spent` per campus of the children it paid for.

## Data

Migration `20261023090000_wallet_ledger_core`: `ledger_account.requires_family`, `journal_line.family_id` (composite FK to `guardian`, trigger, index), the `wallet_topup` and `wallet_spend` journal kinds, `seed_ledger_accounts` (2200 `student_wallets`, `monnify_collections` and its gateway money account; backfilled), `wallet` and its trigger and backfill, `wallet_topup`, `wallet_spend`, `wallet_earmark` (unique `(organization_id, reference)`, sign checks, composite FKs, `ON DELETE RESTRICT`), the append-only triggers, and `wallet_proof` in `file_object_kind_check`. See [data-model-finance.md](../brainstorming/data-model-finance.md).

## API

| Method | Path                                   | Permission       | Request                                                      | Response                              | Errors                  |
| ------ | -------------------------------------- | ---------------- | ------------------------------------------------------------ | ------------------------------------- | ----------------------- |
| GET    | `/finance/wallets`                     | `wallet:read`    | `q`, `page`, `pageSize`                                      | `WalletList`                          | 401, 403                |
| GET    | `/finance/wallets/top-up-options`      | `wallet:topUp`   | –                                                            | `TopUpOptions`                        | 401, 403                |
| GET    | `/finance/wallets/:walletId`           | `wallet:read`    | –                                                            | `Wallet`                              | 401, 403, 404           |
| GET    | `/finance/wallets/:walletId/movements` | `wallet:read`    | `page`, `pageSize`                                           | `WalletMovementList`                  | 401, 403, 404           |
| POST   | `/finance/wallets/:walletId/top-ups`   | `wallet:topUp`   | reference, account, method, amount, date, depositor, receipt | `ToppedUpWallet`, 201 or 200 replayed | 400, 401, 403, 404, 409 |
| GET    | `/portal/wallet`                       | `wallet:readOwn` | –                                                            | `Wallet`                              | 401, 403, 404           |
| POST   | `/portal/wallet/spend`                 | `wallet:spend`   | reference, one line per child                                | `SpentWallet`, 201 or 200 replayed    | 401, 403, 404, 409, 422 |
| POST   | `/portal/wallet/earmarks`              | `wallet:spend`   | reference, child, amount                                     | `EarmarkedWallet`                     | 401, 403, 404, 409, 422 |
| POST   | `/portal/wallet/earmarks/release`      | `wallet:spend`   | reference, child, amount                                     | `EarmarkedWallet`                     | 401, 403, 404, 409, 422 |

Contract types live in `@eduvault/api-contract` (`wallets.ts`).

## Acceptance criteria

1. Given a bursar and a paying guardian, when she records a ₦50,000 cash top-up with a receipt, then one balanced entry debits the cash account and credits 2200 with the family, the wallet shows ₦50,000.00 balance and free to use, and the movement lists the receipt.
2. Given the same request sent again, when it posts, then the API answers 200 `replayed: true` and nothing more is posted; with another amount it answers 409.
3. Given a Lekki bursar and a family whose children are all at Ikeja, when she asks for the wallet, its movements or a top-up, then the API answers 404; for a family with a child at Lekki she sees the whole wallet.
4. Given a principal, when she opens a wallet, then there is no **Record top-up** button and the `POST` answers 403.
5. Given a guardian with ₦12,000 free and a child owing ₦20,000, when she spends ₦12,001, then the API answers 422 naming ₦12,000; for ₦12,000 it posts one balanced entry and the child owes ₦8,000.
6. Given the same guardian and a child of another family, when she spends for that child, then the API answers 404.
7. Given ₦25,000 free and two simultaneous spends of ₦20,000, when both run, then exactly one succeeds and the wallet is never negative.
8. Given ₦8,000 set aside for Ada, when the guardian pays ₦10,000 of Ada's charges, then the ₦8,000 is used first and the set-aside figure falls to ₦0.
9. Given a school with no wallet money, when an owner opens Wallets, then every figure reads ₦0.00.
10. Given a school, when the Money categories chart loads, then 2200 Student wallets is listed and Monnify collections rolls into Money accounts.

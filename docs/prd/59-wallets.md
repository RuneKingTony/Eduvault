# PRD: Wallets

- Status: draft (EDU-304, first phase of the family wallets epic EDU-303: the ledger core, staff top-ups and the guardian API; EDU-305, second phase: the Monnify connection and online top-ups; EDU-306, third phase: the guardian Fees page, movements and auto-pay; refunds and migration of old credits follow in their own issues)
- Source: not in the brand prototype. The Wallets screens follow [Payments](53-payments.md) and its Record payment sheet.
- Milestone and slice: `M3.9` (see [roadmap](README.md))
- Related: [53-payments.md](53-payments.md) (reference replay, proof, the sheet this one is modelled on), [56-money-accounts-and-categories.md](56-money-accounts-and-categories.md) (2200 and the Monnify account), [54-who-owes-and-statements.md](54-who-owes-and-statements.md), [72-portal.md](72-portal.md), [technical reference](../technical-reference.md) decisions D-385 to D-404, [ADR 0008](../adr/0008-append-only-balanced-journal.md)

## Summary

A family can pay money in ahead and spend it on its children's charges. Staff record the money a guardian hands over (**Record top-up**, with the receipt) and see every wallet; the guardian, through the API in this phase, pays charges from it and can set some aside for one child. A wallet is a view over journal lines on `2200 Student wallets`; no balance is stored. Online payments (EDU-305): each paying family has a Monnify bank account; what is transferred to it reaches the wallet by itself, confirmed with Monnify first. Guardians (EDU-306) see the wallet on their Fees page in the portal: the family's Monnify account, the balance, paying their children's charges from it, setting money aside, an opt-in auto-pay switch and the history with Trace. Refunds are a later phase.

## Who uses it

| Persona                               | Permission(s)                    | What they can do here                                                                                                                                     |
| ------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner                                 | all                              | See every wallet, record a top-up, connect Monnify in Settings > Online payments                                                                          |
| Bursar (Lekki or Ikeja)               | `wallet:read`, `wallet:topUp`    | See and top up the wallets of families with a child on their campuses; create a family's Monnify account                                                  |
| Administrator, Principal              | `wallet:read`                    | See wallets; no **Record top-up** button, the `POST` answers 403                                                                                          |
| Guardian                              | `wallet:readOwn`, `wallet:spend` | See their own wallet and history on the portal Fees page; pay their children's charges from it; set money aside and release it; switch auto-pay on or off |
| Student, teacher, member with no role | none                             | Not shown; the route redirects, the API answers 403                                                                                                       |
| Acting super admin, no reason         | read permissions                 | Button hidden; `POST` answers 403 `ActingReadOnly`, audited                                                                                               |

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
- **Monnify account** card (after the three balance cards): bank, account number and account name of the family's reserved account. With none: when the school has not connected Monnify, "Online payments aren't connected. An owner can connect Monnify in Settings > Online payments."; when it has, "This family has no account yet…" and, for `wallet:topUp`, **Create account** (outline). Toast "Monnify account created."; a refusal toasts the API's message.
- **Children** card: child (linked to their statement when on the caller's campuses), **Owes**, **Set aside**, **Can use** (the most that child's charges can take now).
- **Movements** card: date, movement ("Top-up from Uncle Bode · Cash", "Online top-up · Monnify", "Paid Ada Okeke's charges"), reference with a **Receipt** link for a staff top-up and a **Trace** link for an online one, who made it (blank for online), and the signed amount; newest first, paged.
- **Trace** (dialog on an online movement): Monnify reference, payment reference, signature check ("Valid"), confirmation ("Checked with Monnify on …"), paid on, paid by the family (gross), Monnify fee, credited to the wallet (net) and the journal entry reference.
- States: loading, error, not found ("No wallet here", back to Wallets).

### Guardian Fees (web-portal)

There is no separate Wallet page. A guardian holding `wallet:readOwn` sees, on `/fees` ([72-portal.md](72-portal.md#fees-m37)), top to bottom:

- **Wallet:** the three figures (**Balance**, **Free to use**, **Set aside**; an empty wallet reads **₦0.00**), a **Top up** dropdown and, for `wallet:spend`, **Pay from wallet**. **Top up** shows the family's Monnify bank, account number (with a **Copy** button) and account name; when the school has not connected Monnify it says online payments aren't switched on and to ask the office to record a top-up; when it has but the family has no account yet it says the account isn't ready. The **Auto-pay** switch (off by default) reads "When money reaches the wallet, pay your children's oldest charges first."; it toasts "Auto-pay is on." or "Auto-pay is off.".
- **Owing** tile: what the family owes across the children who owe (a child in credit is not set against another's debt), **₦0.00** and "Nothing owed" at zero.
- The selected child's **Charges** card (unpaid charges, **Set aside** and **Release** for `wallet:spend`), then the **Statement** with its Term select, as today.
- **History:** every movement, newest first, ten a page, signed amounts; an online top-up has **Trace** (the same facts as the staff dialog).
- A note: "Sent money to the wrong account? Email {school email} with the reference and we will look into a refund." Without a school email: "Contact the school with the reference …".

**Pay from wallet** (dialog): a table of the children, the one who has owed longest first, with **Owes**, **Can use** and an amount field. A child's **Can use** is the lesser of what they owe and their set-aside money plus the free money; lines are taken in order, so two never count the same free money. Zero shows **₦0.00**; an amount over the cap shows the API's limit message and holds **Review payment**. **Pay all I can** fills the oldest first. Set-aside money is used for that child first. **Review payment** opens a confirmation (each child and the total); **Pay now** posts with a reference made when the dialog opened, so a retry replays. A 422 toasts the API's limit.

**Set aside** and **Release** (dialogs): a child and an amount, held to the free money and to what is set aside for that child. Toast "₦X set aside for {child}." or "₦X released for {child}.".

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
13. **Whole-wallet visibility.** A wallet that is visible to a campus-scoped staff member (any linked child on their campuses) is shown whole: its Children card and movements include siblings on other campuses, flagged out of scope with no statement link ([D-392](../technical-reference.md#decision-log)).
14. **Online top-up.** The Monnify webhook posts one balanced `wallet_topup` entry: Dr `monnify_collections` (by system key) and Cr 2200 with the family, for Monnify's net settlement amount, with the Monnify transaction reference as the journal reference and `posted_by` null, plus a `gateway_topup` row holding gross, fee and net ([D-394](../technical-reference.md#decision-log), [D-395](../technical-reference.md#decision-log), [D-396](../technical-reference.md#decision-log)). A transaction is applied once per school; a repeat answers 200 and changes nothing.
15. **Trust.** The webhook is public. The school's own signature over the raw body is checked before anything else, the transaction is re-fetched from Monnify with that school's keys and only the re-fetched amounts are used, and the transaction's account must be one of the same school's reserved accounts. A notification signed by school A can never credit school B, and school A's secret on school B's URL fails the signature ([D-394](../technical-reference.md#decision-log)).
16. **Fee.** The family pays Monnify's fee, so the wallet gets the net amount; the fee is kept on the top-up row and no expense is posted. Confirm Monnify's fee mechanics on reserved accounts before relying on `settlementAmount` in production.
17. **Reserved account.** One per wallet, made on demand by `POST /finance/wallets/:walletId/reserved-account` (idempotent; 409 until the school has connected, 400 when no guardian pays, 503 when Monnify cannot be reached, 502 when it refuses) and, best effort after the commit, when a guardian is admitted or made a payer. The account reference is `EDV-W-<wallet id>`, so a retry reuses the account ([D-397](../technical-reference.md#decision-log)).
18. **Staff cannot type a Monnify reference.** A reference starting `MNFY-` or `MNFY|` answers 400 like the other system prefixes ([D-398](../technical-reference.md#decision-log)).
19. **Activity.** An online top-up writes `wallet.topped_up` on each campus the family has a child on, by the system actor `system:monnify`, with no secret-like data key.
20. **Auto-pay.** Off by default. A guardian turns it on or off with `PUT /portal/wallet/auto-pay`; each change is a row of an append-only log and the latest row counts. When money lands in the wallet, by a staff top-up or an online one, and auto-pay is on, the family's free money pays the children's charges in the same transaction, the child with the oldest unpaid charge first, set-aside money first, never more than a child owes. It is an ordinary `wallet_spend` posted as the guardian who switched it on, with reference `AUTOPAY-<credit reference>` and activity `wallet.spent`. A replayed credit pays nothing twice. If paying fails the credit still stands ([D-400](../technical-reference.md#decision-log)).
21. **Guardian history.** `GET /portal/wallet/movements` lists the guardian's own movements without who recorded them, the receipt file or internal ids; no wallet answers 404 ([D-401](../technical-reference.md#decision-log)).
22. **Zero.** Every figure in a wallet or a pay table shows kobo, so zero reads ₦0.00 ([D-404](../technical-reference.md#decision-log)).
23. **Refund note.** The Fees page tells a family who sent money to the wrong account to email the school profile address with the reference ([D-402](../technical-reference.md#decision-log)); refund requests themselves are a later phase.

## Data

Migration `20261023090000_wallet_ledger_core`: `ledger_account.requires_family`, `journal_line.family_id` (composite FK to `guardian`, trigger, index), the `wallet_topup` and `wallet_spend` journal kinds, `seed_ledger_accounts` (2200 `student_wallets`, `monnify_collections` and its gateway money account; backfilled), `wallet` and its trigger and backfill, `wallet_topup`, `wallet_spend`, `wallet_earmark` (unique `(organization_id, reference)`, sign checks, composite FKs, `ON DELETE RESTRICT`), the append-only triggers, and `wallet_proof` in `file_object_kind_check`. See [data-model-finance.md](../brainstorming/data-model-finance.md).

Migration `20261024120000_monnify_gateway` (EDU-305): `gateway_connection` (one per school, encrypted keys and their masked tails, mode, contract code, last test result; `ON DELETE CASCADE` from `organization`), `wallet_reserved_account` (one per wallet, unique account reference, append-only) and `gateway_topup` (unique `(organization_id, reference)`, `gross = net + fee`, `net > 0`, `signature_verified` must be true, composite FKs to the wallet, reserved account and journal entry, append-only). `GATEWAY_ENCRYPTION_KEY` (32 bytes, base64) is the only new environment variable; the webhook URL given to Monnify is `{BETTER_AUTH_URL}/webhooks/monnify/{school id}`.

Migration `20261025090000_wallet_auto_pay` (EDU-306): `wallet_auto_pay_setting`, an append-only log (organization, guardian, `enabled`, a `reference` unique per school, `created_by`, `created_at`, an identity `sequence` that orders it), with a composite foreign key to `wallet` (`ON DELETE RESTRICT`) and the `wallet_append_only` trigger. The current value is the latest row; nothing is stored on `wallet`.

## API

| Method | Path                                          | Permission             | Request                                                                 | Response                                       | Errors                            |
| ------ | --------------------------------------------- | ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| GET    | `/finance/wallets`                            | `wallet:read`          | `q`, `page`, `pageSize`                                                 | `WalletList`                                   | 401, 403                          |
| GET    | `/finance/wallets/top-up-options`             | `wallet:topUp`         | –                                                                       | `TopUpOptions`                                 | 401, 403                          |
| GET    | `/finance/wallets/:walletId`                  | `wallet:read`          | –                                                                       | `Wallet`                                       | 401, 403, 404                     |
| GET    | `/finance/wallets/:walletId/movements`        | `wallet:read`          | `page`, `pageSize`                                                      | `WalletMovementList`                           | 401, 403, 404                     |
| POST   | `/finance/wallets/:walletId/top-ups`          | `wallet:topUp`         | reference, account, method, amount, date, depositor, receipt            | `ToppedUpWallet`, 201 or 200 replayed          | 400, 401, 403, 404, 409           |
| POST   | `/finance/wallets/:walletId/reserved-account` | `wallet:topUp`         | –                                                                       | `Wallet`, 200 (idempotent)                     | 400, 401, 403, 404, 409, 502, 503 |
| GET    | `/finance/gateway/monnify`                    | `wallet:manageGateway` | –                                                                       | `GatewayConnection` (masked)                   | 401, 403                          |
| PUT    | `/finance/gateway/monnify`                    | `wallet:manageGateway` | mode, contract code, API key, secret key (keys optional once connected) | `GatewayConnection`                            | 400, 401, 403, 503                |
| POST   | `/finance/gateway/monnify/test`               | `wallet:manageGateway` | –                                                                       | `GatewayTestResult`                            | 401, 403, 409                     |
| POST   | `/webhooks/monnify/:organizationId`           | none (signature)       | Monnify's notification, `monnify-signature` header                      | `{ status: posted, replayed or ignored }`, 200 | 400, 401, 404, 409, 503           |
| GET    | `/portal/wallet`                              | `wallet:readOwn`       | –                                                                       | `Wallet`                                       | 401, 403, 404                     |
| POST   | `/portal/wallet/spend`                        | `wallet:spend`         | reference, one line per child                                           | `SpentWallet`, 201 or 200 replayed             | 401, 403, 404, 409, 422           |
| POST   | `/portal/wallet/earmarks`                     | `wallet:spend`         | reference, child, amount                                                | `EarmarkedWallet`                              | 401, 403, 404, 409, 422           |
| POST   | `/portal/wallet/earmarks/release`             | `wallet:spend`         | reference, child, amount                                                | `EarmarkedWallet`                              | 401, 403, 404, 409, 422           |
| GET    | `/portal/wallet/movements`                    | `wallet:readOwn`       | `page`, `pageSize`                                                      | `PortalWalletMovementList`                     | 401, 403, 404                     |
| PUT    | `/portal/wallet/auto-pay`                     | `wallet:spend`         | enabled, reference                                                      | `Wallet`, 200 (idempotent)                     | 401, 403, 404, 409                |

Contract types live in `@eduvault/api-contract` (`wallets.ts`). `Wallet` carries `autoPay` and each child `oldestUnpaidOn`; `GET /portal/me` carries the school email ([72-portal.md](72-portal.md#api)).

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
11. Given an owner with sandbox keys saved, when a ₦50,000 transfer to a family's Monnify account is signed by the school's secret and Monnify confirms ₦49,500 settled, then one balanced `wallet_topup` entry credits the family ₦49,500.00, the top-up row keeps ₦500.00 as the fee, and the movement shows a Trace.
12. Given the same notification delivered again, when it arrives, then the API answers 200 `replayed` and the wallet is unchanged.
13. Given a notification with a wrong or missing signature, or an amount that differs from what Monnify confirms, when it arrives, then the API answers 4xx and nothing is written.
14. Given a notification signed by school A that names school B's account, or school A's secret on school B's URL, when it arrives, then B's wallet is not credited.
15. Given a bursar and a connected school, when she presses **Create account** twice on a family, then Monnify is asked for one account and both answers show it.
16. Given a bursar, when she opens `/finance/gateway/monnify`, then the API answers 403; given an owner, no response ever contains a key.
17. Given a guardian with ₦50,000 free and two children owing, when she opens Fees, then she sees the wallet, the Owing tile with the family total, each child's charges and statement, her History and the refund note, and there is no Wallet page.
18. Given the same guardian, when she pays ₦15,000 for one child and ₦5,000 for the other from the dialog and confirms, then one balanced entry is posted, each child's statement shows "Paid from wallet", and the History lists it; sending the same request again posts nothing more.
19. Given ₦20,000 free and the oldest child owing ₦15,000, when she enters ₦20,000 for the second child as well, then the dialog shows that child's limit and holds the payment back.
20. Given auto-pay is off, when a bursar records a top-up, then no charge is paid; given she switches it on and a top-up or a Monnify payment arrives, then the oldest child's charges are paid in the same transaction by a `wallet_spend` named `AUTOPAY-…`, and the same top-up sent again pays nothing twice.
21. Given guardian A and guardian B in the same school, or in two schools, when A asks for her movements, then she sees none of B's.
22. Given a guardian without `wallet:spend`, when she asks to switch auto-pay on, then the API answers 403.
23. Given a school with an email on its profile, when a guardian reads the refund note, then it names that address; with none, it asks her to contact the school.
24. Given a wallet with no money, when the guardian opens Fees, then every figure and the Owing tile at zero read ₦0.00.

# PRD: Foundation, ledger and document machinery

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53` (script lines 1203–1416: `seedFinance`, `nextNo`, `post`, `recordPayment`, `requestVoid`, approvals; 3080: `finGenRef`; 3500–3520: duplicate reference handling; 3940–3982: store postings; 2754: `approvalNeeded`; uploads at 2159, 2928, 3493–3514, 4124–4143)
- Milestone and slice: `M3.1` (ledger core, sequences, idempotency, approval columns, `ON DELETE RESTRICT`); the `FileStore` and `/files` ship in `M2.2` for the school logo and are used next by `M2.4` (guardian photo) ([D-028](../technical-reference.md#decision-log)) (see [roadmap](README.md))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md#rules-every-table-follows) (Rules every table follows), [data-model-finance.md](../brainstorming/data-model-finance.md) (Journal, Payments, Posting rules, Invariants), [data-model-inventory.md](../brainstorming/data-model-inventory.md) (stock movements, sales, counts), [technical reference](../technical-reference.md) decisions `D-003`, `D-004`, `D-007`, `D-008`, `D-013`, `D-023`, `D-025`, `D-027`, `D-028`, `D-033`, `D-042`

## Summary

Charges, payments, corrections, store sales, deliveries and stock counts all share the same machinery: a per-school document number, a per-school unique reference that makes a retried request apply once, the same approval columns with the database refusing self-approval, one balanced append-only journal, foreign keys that refuse to delete money, and somewhere to keep the proof a bursar attaches. This spec defines each piece once so every money and stock slice uses it the same way, including file storage: a `FileStore` interface backed by Postgres, with uploads through `/files` ([D-028](../technical-reference.md#decision-log)).

## Who uses it

| Persona                                  | Permission(s)                                                                                                        | What they can do here                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Bursar Chika (Lekki), Yemi (Ikeja)       | `payment:record`, `invoice:bill`, `adjustment:create`, `payment:void`, `store:issue`, `store:receive`, `store:count` | Create the records that take numbers, carry references, post to the journal and attach proof |
| Principal Grace, owner Funmi             | `adjustment:approve`                                                                                                 | Approve or decline other people's corrections; never their own                               |
| Administrator Tunde                      | `schoolAccount:update`                                                                                               | Uploads the school logo; adds guardian photos at admission (`guardian:create`)               |
| Accountant (reads "For your accountant") | `ledger:read`                                                                                                        | Reads journal entries behind each charge and receipt                                         |
| Super admin acting with a reason         | every permission                                                                                                     | Same rules; self-approval checked against their own user id                                  |

Scopes applied: journal lines and money accounts are campus-scoped with null meaning school-wide ([02](02-foundation-permissions-and-scopes.md) rule 19); a file is visible exactly when its owning record is. Out-of-scope rows answer 404; in scope without the permission answers 403 [tenancy-001].

## Screens

No screen of its own. Where the machinery shows up, with copy as written in the prototype:

### Reference field on money forms

- Record a payment (`payments`), card "Reference": field "Our reference" (mono input, required, prefilled), hint "Filled in for you. If the same payment is entered twice, it is only recorded once."
- Record student purchase (`store`): the reference is generated when the sheet opens and is not shown.
- On a repeat: warning toast "Reference `<ref>` was already recorded as <receipt>. Nothing was posted twice." and the app opens that receipt.

### Document numbers

- Shown as mono text and links: charge numbers (`CHG-2026-00042`) on Charges, the student statement and the portal; receipt numbers (`RCT-2026-00088`) on Payments, the store sale badge ("Paid · RCT-2026-00095") and the portal; round numbers (`BR-2026-0001`) on Charge students; adjustment numbers (`ADJ-2026-0003`) on Discounts and refunds and Approvals; `ISS-`, `DEL-`, `CNT-` on the Store tabs.
- A charge has no number while "Prepared"; it gets one when sent.

### Approval states

- Status badges: `submitted` "Waiting", `approved`, `rejected`, `void_pending` "Cancellation waiting", `voided` "Cancelled", `matched` (stock count with no difference).
- An approver who created the item sees it without approve controls and the reason "You created this. Someone else must approve it." (prototype wording: "You created this. The database refuses approved_by = created_by, so someone else must approve it.").

### Uploads

- Proof of transfer, store payment receipt, school logo and guardian photo: controls and copy are in [01](01-foundation-design-system.md) (`ProofInput`, `ImagePicker`, Business rules 14–16). After saving, a payment shows "Proof of transfer" with the file name and a view action (new; see gap G-05 in 01).

## Business rules

### Document numbers (`document_sequence`)

1. Numbers come from `document_sequence (organization_id, kind, year, next_value)`, primary key `(organization_id, kind, year)`, one counter per school, kind and year. Gaps are allowed (overview, Rules every table follows).
2. Kinds and formats:

| Kind                         | Prefix | Digits | Example          | Assigned when                            | Slice |
| ---------------------------- | ------ | ------ | ---------------- | ---------------------------------------- | ----- |
| Charge (`invoice`)           | `CHG`  | 5      | `CHG-2026-00042` | The charge is sent (null while Prepared) | M3.3  |
| Receipt (`payment`)          | `RCT`  | 5      | `RCT-2026-00088` | The payment is recorded                  | M3.4  |
| Charge round (`billing_run`) | `BR`   | 4      | `BR-2026-0001`   | The round is created                     | M3.3  |
| Adjustment                   | `ADJ`  | 4      | `ADJ-2026-0001`  | The request is created (before approval) | M3.5  |
| Store sale                   | `ISS`  | 4      | `ISS-2026-0001`  | The sale is recorded                     | M4.4  |
| Store delivery               | `DEL`  | 4      | `DEL-2026-0001`  | The delivery is recorded                 | M4.3  |
| Stock count                  | `CNT`  | 4      | `CNT-2026-0001`  | The count is recorded                    | M4.5  |

Later kinds already seen in the prototype's counters (`EXP`, `REQ`) follow the same shape when their phases land.

3. A number is allocated inside the same database transaction as the record that carries it, with one statement: `INSERT INTO document_sequence … VALUES (…, 1) ON CONFLICT (organization_id, kind, year) DO UPDATE SET next_value = document_sequence.next_value + 1 RETURNING next_value`. The row lock serialises concurrent allocations for one school, kind and year; a rolled-back transaction rolls back its increment.
4. The year is the calendar year of the allocation date in Africa/Lagos, through the one time helper ([D-023](../technical-reference.md#decision-log), [D-033](../technical-reference.md#decision-log)). When the counter passes the digit width, the number widens (`CHG-2026-100000`); it is never truncated.
5. Each numbered table has `UNIQUE (organization_id, number)`.
6. Admission numbers (`GF-0123`) are a separate per-school counter owned by the admission slice ([41-admission](41-admission.md)), not a `document_sequence` kind.

### References and idempotency

7. Every movement of money or stock carries a `reference` unique per school, and applies at most once [risk-001]:

| Record           | Unique on                                                                            | Reference source                               |
| ---------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `journal_entry`  | `(organization_id, reference)`                                                       | The source's number or reference (table below) |
| `payment`        | `(organization_id, reference)`; `(organization_id, provider_reference)` when present | Client-generated, editable ("Our reference")   |
| `store_sale`     | `(organization_id, reference)`                                                       | Client-generated (D-008)                       |
| `stock_movement` | `(organization_id, reference, store_id, item_id)`                                    | The source document's number                   |

8. Journal entry references (finance doc, Posting rules): charge sent `CHG-…`; store cost `CHG-…-COST`; payment = the payment's reference; payment cancellation `VOID-<payment reference>`; adjustment `ADJ-…`; opening balance `OPEN-<student_id>`; opening store stock `OPEN-STORE-<campus_id>`; delivery `DEL-…`; stock count `CNT-…`.
9. Client-generated payment references have the form `<METHOD>-<YYYYMMDD>-<suffix>` with method `CSH` (cash), `TRF` (transfer), `POS`, later `GTW` (gateway); the date is today's in Africa/Lagos ([D-023](../technical-reference.md#decision-log)); the suffix is 6 random base32 characters ([D-033](../technical-reference.md#decision-log)), for example `TRF-20261002-K7Q2MX`. The form generates one when it opens and keeps it across retries of the same submission; a new form gets a new one. Staff may overwrite it (for example with a bank's reference).
10. The idempotency contract for every endpoint that creates a referenced record:
    - First request: 201 with the new record.
    - Same reference, same request (every business field equal: kind, amount, payer, money account, method, allocations or lines, dates): 200 with the original record and `replayed: true`. Nothing posts. The UI shows the warning toast above.
    - Same reference, different request: 409 "Reference `<ref>` is already used by <number>." Nothing posts ([D-033](../technical-reference.md#decision-log)).
    - The check is the unique constraint, not a prior `SELECT`: the insert runs in the transaction, a `23505` on the reference constraint rolls it back, and the service then reads the existing record to decide between 200 and 409. Two concurrent requests with one reference therefore post once.
11. A posting helper refuses a reference already used in the journal the same way (the prototype's `post()` returns the earlier entry); system references (`OPEN-…`, `VOID-…`) make re-running an import or approving twice harmless.

### Approval columns and self-approval

12. Every record that may need a second person carries one column shape ([D-025](../technical-reference.md#decision-log)): `status`, `created_by`, `created_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`. Tables: `student_discount`, `adjustment`, `payment_void`, `stock_count`, `staff_leave`, later `expense`, `requisition`. `staff_leave` uses `created_by` for the requester and `approved_by` / `rejected_by` for the decision, not `decided_by`; `stock_count` uses `created_by` for the person who counted.
13. Database checks on each of them:
    - `CHECK (approved_by IS NULL OR approved_by <> created_by)`
    - `CHECK (rejected_by IS NULL OR rejected_by <> created_by)` (nobody declines their own request either; finance doc, Invariants)
    - `CHECK (status <> 'rejected' OR (rejected_by IS NOT NULL AND length(trim(rejection_reason)) > 0))` (declining needs a reason)
    - `CHECK (status <> 'approved' OR approved_at IS NOT NULL)`
14. The API pre-checks self-approval and answers 409 `SelfApproval` "You created this. Someone else must approve it." ([D-013](../technical-reference.md#decision-log)); `ErrorFilter` maps Postgres `23514` (check violation) to 409 as the backstop ([02](02-foundation-permissions-and-scopes.md) rule 24).
15. An approval or decline is a conditional update (`… WHERE id = $1 AND organization_id = $2 AND status = 'submitted'`); zero rows updated answers 409 "This has already been decided." so two approvers clicking at once post once.
16. **Switched-off approval (D-007).** `school_setting` has one switch per kind (`refund`, `write_off`, `credit_note`, `discount`, `payment_void`; store write-offs follow `write_off`), all on by default. When the kind's switch is off at creation, the record is created `approved` with `approved_by` null and `approved_at` = creation time, and posts in the same transaction. It is never approved by its creator. The switch is read once, at creation: switching a kind off leaves requests already waiting as they are, and they still need an approver ([D-027](../technical-reference.md#decision-log)).
17. Who may approve: a holder of `adjustment:approve` (or `leave:approve` for leave) whose campus scope includes the item's campus; an item with no campus is visible to every approver ([02](02-foundation-permissions-and-scopes.md) rule 19).

### Journal (`journal_entry`, `journal_line`)

18. Shapes are in [data-model-finance.md, Journal](../brainstorming/data-model-finance.md#journal). Both tables carry `organization_id`; lines reference their entry, ledger account, student and campus with composite `(…, organization_id)` foreign keys, so a line can never point into another school.
19. `journal_line` has `CHECK ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0))`. Amounts are `BIGINT` minor units.
20. A deferred constraint trigger enforces balance at commit: `CREATE CONSTRAINT TRIGGER journal_entry_balanced AFTER INSERT ON journal_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced()`, which raises unless the entry of `NEW.entry_id` has at least two lines and `SUM(debit_minor) = SUM(credit_minor)`. A second deferred trigger on `journal_entry` insert refuses an entry with no lines.
21. Journal rows are append-only: a `BEFORE UPDATE OR DELETE` row trigger on both tables raises. Corrections are new entries; a reversal sets `reverses_entry_id`, and a partial unique index on `reverses_entry_id` allows one reversal per entry. (`TRUNCATE` fires no row triggers, so test resets keep working.)
22. Every line on `fees_receivable` carries `student_id`: `ledger_account.requires_student` flags the accounts that need one (`fees_receivable` now, library later), and a trigger refuses a line on such an account without a student; every line carries the `campus_id` the posting rules give it (student placement campus for the term; money account's campus, null if school-wide).
23. A student's balance is `SUM(debit_minor − credit_minor)` over their `fees_receivable` lines; a money account's balance is the sum over its ledger account and children. Nothing stores a balance. Index `(organization_id, ledger_account_id, student_id)`.
24. Posting is one call to the ledger service in `apps/api/src/app/common/ledger` inside the caller's transaction ([D-042](../technical-reference.md#decision-log)); the sequence, approval and file helpers sit beside it in `common/{documents,files}`. The call allocates any number, inserts the entry and its lines, and returns the entry; the source record (payment, charge, adjustment) stores `journal_entry_id`. The source record, the number and the entry commit or roll back together.

### Never delete (`ON DELETE RESTRICT`)

25. Money, results and students are never deleted [risk-001]. No delete endpoint exists for them; every foreign key to or from them uses `ON DELETE RESTRICT`, including their `organization_id` foreign key (today's migration uses `CASCADE` from `organization`). A school, campus, student or ledger account with money records can't be deleted; the attempt answers 409 (Postgres `23503`, already mapped by `ErrorFilter`).
26. `DELETE /students/:id` and `student:delete` are removed in M1.1 ([D-014](../technical-reference.md#decision-log)). Today's `student` table cascades from `organization`; that foreign key becomes `ON DELETE RESTRICT` when the student table is rebuilt (M2.4). `fee_schedule` goes with M3.2.
27. Reference data is retired, not deleted: `ledger_account.retired_at`, `fee_line.retired_at`, `class_arm.retired_at`, store items.

### File storage for uploads

28. Four uploads exist in the prototype; each belongs to one record and inherits its visibility:

| Upload                                               | Owning record and column                                | Required                                 | Types                                               | Size                       | Who may view                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Proof of transfer                                    | `payment.proof_file_id`                                 | When method is transfer                  | JPEG, PNG, WebP, HEIC, PDF                          | 10 MB (prototype has none) | Anyone who may read the payment (`payment:read` in campus scope); later the paying guardian (`payment:readOwn`) |
| Store payment receipt (POS slip or transfer receipt) | `payment.proof_file_id` of the payment the sale creates | When the sale is paid by POS or transfer | Same as above (prototype accepts `image/*` and PDF) | 10 MB                      | As above                                                                                                        |
| School logo                                          | `school_account.logo_file_id`                           | No                                       | PNG, JPEG, WebP                                     | 1 MB                       | Every signed-in member, student and guardian of the school; printed on receipts and charges                     |
| Guardian photo                                       | `guardian.photo_file_id`                                | No                                       | PNG, JPEG, WebP                                     | 1 MB                       | Staff with `guardian:read` in the student's campus scope; the guardian themself                                 |

29. The server checks type by content (magic bytes), not by extension or the browser's `Content-Type`, and size before storing.
30. Proofs are money evidence: never deleted, never replaced after the payment posts (a cancelled payment keeps its proof). A guardian photo or logo may be removed or replaced; the old file is deleted (photos are personal data).
31. A file is served only through the API, after the same school, permission and scope checks as its owning record; another school's or an out-of-scope file answers 404. Responses carry `Content-Disposition` (inline for images and PDF), `X-Content-Type-Options: nosniff` and `Cache-Control: private`.
32. Files go through a `FileStore` interface (`put`, `get`, `delete`) in `common/files` ([D-028](../technical-reference.md#decision-log)). The first driver is Postgres: bytes in `file_blob (file_id, organization_id, bytes BYTEA)`. An S3-compatible driver comes later, with an ADR, when hosting is chosen. A `file_object` row records `id`, `organization_id`, `kind` (`payment_proof`, `school_logo`, `guardian_photo`), `storage_key`, `content_type`, `byte_size`, `sha256`, `original_name`, `uploaded_by`, `uploaded_at`. The `*_key` columns in the data-model docs become `*_file_id` foreign keys to it.
33. Uploads are two steps: `POST /files` stores the file and returns its id, then the record's own create or update request carries the `*_file_id`. A file with no owning record after 24 hours is an orphan, deleted by a daily job. The file is attached in the same transaction as the record.
34. HEIC proofs are stored as uploaded and offered as a download, since most browsers can't display them. Uploads are not malware-scanned: files are only served back to staff and guardians with `nosniff` and are never executed.

## Data

| Table                                                                                           | Source                              | Slice                              | Notes                                                                                          |
| ----------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `document_sequence`                                                                             | overview, Rules every table follows | M3.1                               | Composite PK; `kind` as text with a `CHECK` list; `next_value` `INTEGER`                       |
| `ledger_account`, `money_account`                                                               | finance, Accounts                   | M3.1                               | System accounts seeded per school on creation and by migration for existing schools            |
| `journal_entry`, `journal_line`                                                                 | finance, Journal                    | M3.1                               | Plus the three triggers (rules 20–21) and the partial unique index on `reverses_entry_id`      |
| Approval columns                                                                                | overview, finance                   | With each table (M3.5, M4.5, M3.6) | **New vs docs:** `rejected_at`, and the four `CHECK`s of rule 13                               |
| `file_object`, `file_blob`                                                                      | **New** (not in any data-model doc) | M2.2 (with the logo)               | Rules 32–33; the `FileStore` Postgres driver ([D-028](../technical-reference.md#decision-log)) |
| `payment.proof_file_id`, `school_account.logo_file_id`, `guardian.photo_file_id` (were `*_key`) | overview, finance                   | M3.4, M2.2, M2.4                   | **Change vs docs:** become `proof_file_id`, `logo_file_id`, `photo_file_id`                    |
| `payment.reference`                                                                             | finance, Payments                   | M3.4                               | Rule 9 format (6-character suffix)                                                             |

Migrations in M3.1: `document_sequence`; `ledger_account`; `money_account`; `journal_entry`; `journal_line`; trigger functions `journal_entry_balanced()`, `journal_entry_not_empty()`, `journal_append_only()`, `journal_line_requires_student()`; seeding of system ledger accounts for existing schools; every FK `ON DELETE RESTRICT`. Each new table gets an isolation test.

## API

The machinery is internal; these are the external behaviours other slices inherit.

| Method | Path                                                              | Permission                                                                                                               | Request                  | Response                                                                 | Errors                                                                    |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| POST   | `/finance/payments` (M3.4; same contract for `/store/sales` M4.4) | `payment:record`, or `store:issue` for a store sale's proof                                                              | includes `reference`     | 201 new record; 200 `{ …record, replayed: true }` on an identical repeat | 409 reference used by a different request; 400 proof missing for transfer |
| POST   | `/finance/<approvable>/:id/approve` (M3.5)                        | `adjustment:approve`                                                                                                     | none                     | 200                                                                      | 404 out of scope; 409 own request; 409 already decided                    |
| POST   | `/finance/<approvable>/:id/reject` (M3.5)                         | `adjustment:approve`                                                                                                     | `{ reason }`             | 200                                                                      | 400 empty reason; 404; 409 own request; 409 already decided               |
| POST   | `/files` (M2.2)                                                   | the owning record's create permission (`payment:record`, `schoolAccount:update`, `guardian:create` or `guardian:update`) | multipart `file`, `kind` | 201 `{ id, contentType, byteSize, originalName }`                        | 400 wrong type or too large; 403                                          |
| GET    | `/files/:id`                                                      | the owning record's read permission                                                                                      | none                     | the bytes                                                                | 404 other school, out of scope, or not yet attached                       |
| DELETE | `/files/:id`                                                      | `schoolAccount:update` (logo) or `guardian:update` (photo)                                                               | none                     | 204                                                                      | 404; 409 for a payment proof                                              |

Contract types (`Replayed<T>`, `FileRef`, approval status unions) live in `@eduvault/api-contract`.

## Acceptance criteria

1. Given 20 concurrent requests that each allocate a `CHG` number for one school, then 20 distinct consecutive numbers are issued; given two schools, each starts at `CHG-2026-00001`.
2. Given a transaction that allocates `RCT-2026-00088` and then fails, then the next allocation is `RCT-2026-00088` again or later, and no payment carries the failed number.
3. Given a payment posted with reference `TRF-20261002-0001`, when the same request is sent again, then 200 with the original receipt and `replayed: true`, and the journal has one entry for that reference; when a different amount is sent with that reference, then 409 and nothing posts.
4. Given two identical payment requests sent at the same moment, then exactly one journal entry and one receipt exist.
5. Given a direct insert of a journal entry whose lines sum Dr 1,000 / Cr 900, when the transaction commits, then it fails and nothing is stored.
6. Given a posted journal line, when an `UPDATE` or `DELETE` is attempted, then the database raises; given `TRUNCATE … CASCADE` in a test reset, then it succeeds.
7. Given a line with both `debit_minor` and `credit_minor` positive, or both zero, then the insert fails.
8. Given Chika created a payment cancellation, when Chika approves it, then 409 "You created this. Someone else must approve it."; when a raw `UPDATE` sets `approved_by` to her id, then the database refuses it.
9. Given the school switched off `write_off` approval, when Chika creates a write-off, then it is `approved` with `approved_by` null and its entry posts in the same request.
10. Given Grace and Funmi approve the same item at once, then one succeeds and the other gets 409 "This has already been decided."
11. Given a school with one journal line, when the school or a referenced student is deleted, then 409 and nothing is removed.
12. Given a transfer payment with a 4 MB PDF proof, then it posts and `GET /files/<id>` returns the PDF to Chika; to Yemi (Ikeja, payment for a Lekki-only student into the Lekki POS) it answers 404; to another school's owner it answers 404.
13. Given a file named `proof.pdf` whose bytes are an executable, then 400 "The proof must be a photo, a screenshot or a PDF."
14. Given a payment that has posted, when someone tries to delete or replace its proof, then 409.

## Tests

- Unit (`nx run api:test`): reference format generator (method prefixes, Lagos date); request-equality function used by the idempotency check (allocation order ignored, amounts compared in minor units); number formatting (`CHG` 5 digits, others 4, widening); approval guard (own request, already decided, switched-off path sets `approved_by` null); magic-byte type detection for each allowed type and a rejected one.
- Integration (`api:test-integration`), against real Postgres:
  - `document_sequence`: concurrency (AC 1), per-school independence, rollback (AC 2).
  - Journal triggers: unbalanced, single-line and empty entries refused at commit; append-only; one reversal per entry; `fees_receivable` line without a student refused.
  - Idempotency for each referenced endpoint as it lands (AC 3–4).
  - Approval checks at the database level by raw SQL and through the API (AC 8–10), for each approvable table as it lands.
  - `ON DELETE RESTRICT`: organization, campus and student deletes refused once money exists (AC 11).
  - Isolation for each new table (`document_sequence`, `ledger_account`, `money_account`, `journal_entry`, `journal_line`, `file_object`): school B's ids answer 404 on every route, lists exclude them, and a journal line can't reference another school's account, student or campus (composite FK).
  - Files: type, size, scope and cross-school checks (AC 12–14).
- E2E (required, `eduvault-e2e`): record a transfer with a proof as Chika, double-submit the form, see one receipt and the "already recorded" toast; open the proof from the receipt; as Grace approve Chika's cancellation, as Chika see no approve button on her own.

## Open decisions

| #     | Question                                                                                                                                                                                                                                                                                                                                                                                                                                  | Recommendation                                                                                                                 | Confidence | Decided                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------- |
| LD-01 | Which year goes in a document number. Options: (a) calendar year of the allocation date (Lagos); (b) the business date's year (`paid_on`, issue date); (c) the school year's start year (2026 for 2026/2027)                                                                                                                                                                                                                              | (a): simplest, never changes after the fact, matches the prototype's examples                                                  | Medium     | [D-033](../technical-reference.md#decision-log): year of allocation                                        |
| LD-02 | Same reference with a different payload. Options: (a) 409 (rule 10); (b) return the earlier record regardless (the prototype and the finance doc's wording)                                                                                                                                                                                                                                                                               | (a): (b) can silently swallow a real payment whose reference collided                                                          | High       | [D-033](../technical-reference.md#decision-log): 409                                                       |
| LD-03 | Payment reference suffix. The prototype uses 4 random digits (`finGenRef`), a 1-in-9,000 daily collision per method. Options: (a) 6 random base32 characters (about 1 in 10⁹); (b) ask the server for the next number from a `payment_ref` sequence when the form opens; (c) a client UUID hidden as the idempotency key, with the visible reference free text                                                                            | (a): no round trip, readable, and LD-02 turns any collision into a visible 409                                                 | Medium     | [D-033](../technical-reference.md#decision-log): 6 random base32 characters                                |
| LD-04 | How "every `fees_receivable` line has a student" is enforced. Options: (a) a trigger that looks up the account's `system_key`; (b) a stored `requires_student` flag on `ledger_account` plus a trigger; (c) service code only                                                                                                                                                                                                             | (b): cheap check, also covers future student-bound accounts (library)                                                          | Medium     | Adopted                                                                                                    |
| LD-05 | Where the posting, sequence, approval and file helpers live, given "a module imports `common`, never another module's internals". Options: (a) `apps/api/src/app/common/{ledger,documents,files}`; (b) a `ledger` Nest module exporting `LedgerService` that finance and store modules import                                                                                                                                             | (a): they are infrastructure every money and stock module needs, with no routes of their own                                   | Medium     | [D-042](../technical-reference.md#decision-log): ledger service in `common`                                |
| LD-06 | File storage backend. Options: (a) Postgres (`file_blob` `BYTEA`): no new infrastructure, one backup, transactional with the record, fine for a few GB; (b) a local disk volume: simple, breaks with more than one API instance and needs separate backups; (c) S3-compatible object storage (S3, Cloudflare R2, MinIO locally) with private buckets: scales, needs credentials and a deployment decision ADR 0004 says doesn't exist yet | (a) behind the `FileStorage` interface now, (c) as a second driver when hosting is chosen; record it as an ADR                 | Medium     | [D-028](../technical-reference.md#decision-log): Postgres `FileStore` now, S3-compatible later with an ADR |
| LD-07 | Upload flow. Options: (a) multipart on the record's own create request (one round trip, the file and record commit together); (b) two steps: `POST /files` then the record with `fileId` (works for drafts and the admission sheet, needs cleanup of orphans); (c) presigned direct upload (only with S3)                                                                                                                                 | (b) with orphan files (no owning record after 24 h) deleted by a daily job; (a) is awkward with the multi-step admission sheet | Medium     | [D-028](../technical-reference.md#decision-log): two-step via `/files`; orphans swept daily                |
| LD-08 | HEIC proofs from iPhones can't be displayed by most browsers. Options: (a) store as is and offer download; (b) convert to JPEG on upload; (c) refuse HEIC                                                                                                                                                                                                                                                                                 | (a) for M3.4; revisit if bursars complain                                                                                      | Low        | Adopted                                                                                                    |
| LD-09 | Should a pending approval follow the switch when the school turns an approval kind off? Options: (a) no, items already waiting still wait (rule 16 reads the switch at creation); (b) auto-approve everything waiting                                                                                                                                                                                                                     | (a): an approver may have been about to decline                                                                                | High       | [D-027](../technical-reference.md#decision-log): waiting requests keep waiting                             |
| LD-10 | Malware scanning of uploads. Options: none; ClamAV sidecar; provider scanning with S3                                                                                                                                                                                                                                                                                                                                                     | None for now: files are only served back to staff and guardians with `nosniff` and never executed; revisit with LD-06 (c)      | Low        | Adopted                                                                                                    |

## Prototype gaps noticed

- `finGenRef` builds payment references from 4 random digits, and any later payment with the same reference is treated as a duplicate, so a collision would silently drop a real payment (LD-02, LD-03).
- Switched-off approvals call the approve helper with `auto`, which then sets `approvedBy` to the current user, the creator (`approveAdjustment`, `approveVoid`, `approveStoreCount`), contradicting D-007.
- `nextNo` hard-codes the year 2026 and starts from fixed counters (`INV: 41`, `RCT: 87`); the counter list also holds unused `SAL` and `REC` keys, and `INV` prints as `CHG`.
- A store sale's duplicate check looks only at its payment's reference before the sale runs; the sale (number, charge, stock movements) has no reference of its own. The build keys it on `store_sale.reference` (D-008), which the client may set equal to the payment reference.
- Proofs keep only the file name (`payment.proof = proof.name`); nothing stores or shows the file. Payment proof accepts HEIC; the store receipt accepts any `image/*`. No size limit on proofs.
- Logo and guardian photo are kept as data URLs in memory; size limit 1 MB, types PNG, JPEG, WebP.
- `requestVoid` with approval switched off approves inside the same call but returns `auto: true` while still writing `approvedBy` (see above).
- A stock count with no difference is `matched` and posts nothing; that status sits outside the approval CHECKs (allowed).

## Dependencies

- [02](02-foundation-permissions-and-scopes.md) for the permission and scope checks, including the `23514` mapping.
- `school_setting` approval switches (M2.2 settings, M3.5 approval rules).
- M3.2–M3.5 and M4.3–M4.5 build on every rule here; M2.2 ships the `FileStore` and `/files` with the logo, and M2.4 (guardian photo) and M3.4 (proof of transfer) reuse them.

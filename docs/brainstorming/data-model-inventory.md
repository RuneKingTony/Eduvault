# Data model: store and inventory

- Status: brainstorm (not yet an ADR)
- Date: 2026-10-09
- Part of: [data model overview](data-model-overview.md), aligned to the brand prototype, the [decision log](../technical-reference.md#decision-log) and [61-store](../prd/61-store.md)

## Goal

First (F2, milestone M4), run each campus's store: uniforms and textbooks sold to students, deliveries in, stock counts, with stock value, cost of sales and losses on the finance ledger. Later (F4, milestone M7), extend the same catalogue to consumables issued to staff, fixed assets and library books, so the school can see where everything is, who has it and what it cost.

## Decisions taken

| Question                 | Answer                                                                                                                                                                                       | Rejected, and why                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| What ships first         | The campus store (uniforms and textbooks) at F2, under Finance; consumables, assets and library at F4 on the same catalogue                                                                  | All four kinds at once (the prototype ships the store only); dropping the rest (designed, just not yet needed)                                  |
| Where stock is held      | One store per campus, created with the campus; named extra stores and transfers come at F4                                                                                                   | One store per school (can't tell which campus has the uniforms); several stores per campus now (the prototype has one)                          |
| How stock is counted     | Stock on hand is derived from append-only `stock_movement` rows                                                                                                                              | A quantity stored per item and campus (no history; drifts the way stored balances did)                                                          |
| Link to the money ledger | Perpetual: stock is an asset at cost; each sale posts its cost; count differences post to Store stock losses                                                                                 | Quantities only (no stock value or profit); expense on purchase (profit per sale invisible)                                                     |
| Cost basis               | Moving weighted average per store and item; the item's cost price is only the default for new deliveries (D-031)                                                                             | The item's cost price for every sale (Store stock drifts from the stock value); a delivery overwriting the cost price (earlier stock misvalued) |
| How a sale is paid       | Paid at the store in the same action: charge, payment and stock out together, so the student's balance doesn't move. The sale's payment can't be cancelled on its own (D-020)                | Charge now, pay later (the prototype takes payment at the store)                                                                                |
| Paying for deliveries    | A delivery is paid from a money account and posts at once; approved expenses arrive with F1b                                                                                                 | Every delivery through an approved expense (no expense flow exists yet)                                                                         |
| Stock counts             | A count records every item. Any difference, missing or extra, waits for `adjustment:approve` as a "Store write-off"; nothing waits if the count matches. One waiting count per store (D-044) | A value threshold for approval (the prototype has none); no approval (shrinkage written off unseen)                                             |
| Consumables (F4)         | Requisition, then approval (possibly for less), then issue                                                                                                                                   | Direct issue (no record of demand or approval)                                                                                                  |
| Library (F4)             | Loans to students and staff with due dates; optional overdue fines; a lost or damaged book is charged to the student                                                                         | Loans with no charges (costs recovered offline); a catalogue with no lending                                                                    |

## Store model (F2)

Every table also has `id`, `organization_id`, `created_at` and `updated_at` unless noted. Stores belong to a campus, so every store row follows campus scope [tenancy-002].

### Items and stores

| Table               | Key columns                                                                                                                                                                                                             | Constraints and notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `item`              | `kind` (uniform, book; later consumable, asset, library_book), `name`, `variant` (size, null = one size), `class_level_id` (books), `cost_price_minor`, `sell_price_minor`, `low_stock_level` (default 5), `retired_at` | Each size is its own item ("School shirt, Size 10"). `CHECK (sell_price_minor >= cost_price_minor AND cost_price_minor >= 0)` (a zero cost is donated stock); `CHECK ((kind = 'book') = (class_level_id IS NOT NULL))`; `CHECK (kind <> 'book' OR variant IS NULL)`; partial unique `(organization_id, kind, name, variant, class_level_id) NULLS NOT DISTINCT WHERE retired_at IS NULL`, so a duplicate active item answers 409. A `book` is a textbook sold to students, not a library copy |
| `item_price_change` | `item_id`, `old_cost_minor`, `new_cost_minor`, `old_price_minor`, `new_price_minor`, `changed_by`                                                                                                                       | Audit of price changes, written when an item is edited; sales copy prices at the time                                                                                                                                                                                                                                                                                                                                                                                                         |
| `store`             | `campus_id`, `name` ('Lekki campus store'), `retired_at`                                                                                                                                                                | `UNIQUE (campus_id, name)`. F2 creates exactly one per campus, with the campus, and backfills one for each existing campus                                                                                                                                                                                                                                                                                                                                                                    |

An item is in stock, low (at or below `low_stock_level` on any campus the viewer can see) or out of stock (zero everywhere they can see). Items are retired, never deleted; a retired item isn't offered for delivery, sale or count.

### Stock movements

| Table            | Key columns                                                                                                                                                                                                       | Constraints and notes                                                                                                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_movement` | `store_id`, `item_id`, `quantity` (signed), `kind` (opening, receive, sell, count; later issue, sale_return, transfer_out, transfer_in), `value_minor` (signed), `reference`, `source_id`, `moved_by`, `moved_at` | `UNIQUE (organization_id, reference, store_id, item_id)`. Never updated or deleted. Stock on hand is `SUM(quantity)` and stock value `SUM(value_minor)` per store and item. `value_minor` is the value the movement adds or takes away (see [Cost](#cost)) |

A sale is refused (409) if it would take any line below zero; the check locks the store-item pairs, in a fixed order, while it runs.

### Deliveries

| Table                 | Key columns                                                                                                                                                                         | Constraints and notes                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_delivery`      | `number` (`DEL-2026-0001`), `store_id`, `supplier_name`, `money_account_id` (null for opening stock), `is_opening`, `received_on`, `received_by`, `total_minor`, `journal_entry_id` | Posts at once: Dr Store stock / Cr the money account, or Cr Opening balance for stock held at go-live. For opening stock, `number` holds `OPEN-STORE-<campus>` and no `DEL` number is used; partial unique `(store_id) WHERE is_opening` (a second answers 409); `CHECK (is_opening = (money_account_id IS NULL))`. `received_on` can't be in the future. `supplier_id` replaces `supplier_name` once suppliers exist (F1b) |
| `stock_delivery_line` | `stock_delivery_id`, `item_id`, `quantity`, `unit_cost_minor`                                                                                                                       | At least one line, each with quantity above zero. `unit_cost_minor` defaults to the item's cost price and may differ. Posts `receive` (or `opening`) movements at that cost                                                                                                                                                                                                                                                 |

### Sales to students

| Table             | Key columns                                                                                                                            | Constraints and notes                                                                                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store_sale`      | `number` (`ISS-2026-0001`), `reference`, `store_id`, `student_id`, `invoice_id` (`kind = 'store'`), `payment_id`, `sold_by`, `sold_on` | `UNIQUE (organization_id, reference)`; the payment uses the same reference. One transaction: the charge is sent, its cost posted, the payment recorded and `sell` movements written. The store is the one on the student's current placement campus. A sale shows as paid from `payment_id`, not from oldest-first matching |
| `store_sale_line` | `store_sale_id`, `item_id`, `quantity`, `unit_price_minor`, `cost_minor`                                                               | Price and the line's cost at the moving average frozen at sale                                                                                                                                                                                                                                                              |

- Only active students can buy (409 otherwise). The sell sheet offers books for the student's level and every uniform, and shows the student's class, campus and balance.
- Payment is cash, POS or transfer (whichever the school has on); POS and transfer need proof (a slip or receipt), held as the payment's `proof_file_id`. The payment's money account follows the method.
- The sale's `reference` is generated by the client, so a retried request posts once [risk-001] (D-008). The same reference with a different student or lines answers 409 (D-033).
- Cancelling the payment of a store sale on its own is refused (409): it would leave the student owing with the stock not restored. Returns are a later flow (D-020).
- On the student's statement a store sale shows as a charge and an equal payment; the portal's Purchases screen lists them.

### Stock counts

| Table              | Key columns                                                                                                                                                                         | Constraints and notes                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_count`      | `number` (`CNT-2026-0001`), `store_id`, `status` (matched, submitted, approved, rejected), `note`, the approval columns (`created_by` is shown as "Counted by"), `journal_entry_id` | Uses the one approval shape (D-025): `created_by`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`, with the self-approval checks. Partial unique `(store_id) WHERE status = 'submitted'`: a second count while one waits answers 409 (D-044). A count with no differences is `matched` and posts nothing. Otherwise it waits in Approvals as a "Store write-off", or posts at once if the school has switched off write-off approval |
| `stock_count_line` | `stock_count_id`, `item_id`, `expected_quantity`, `counted_quantity`                                                                                                                | One row for every item counted, matching ones included (D-044). `expected` is stock on hand when submitted. Approval posts `count` movements of `counted - expected`, valued at the moving average: Dr Store stock losses / Cr Store stock for a net shortage, the reverse for a net surplus                                                                                                                                                                         |

Nobody approves or declines their own count; a rejection needs a reason and leaves stock unchanged. Only a waiting count can be decided. An approval that would take any item's stock below zero (because sales happened after the count) answers 409 "Stock has moved since this count. Count again." and posts nothing (D-044).

### Cost

Store cost is a moving weighted average per store and item (D-031). Each movement carries the value it adds or takes away, so stock value is derived from movements and nothing else is stored (D-003). The rules, with worked figures, are in [61-store](../prd/61-store.md) rules 28 to 32:

- **Incoming** (`opening`, `receive`, a `count` surplus): `value_minor` is quantity × the delivery line's unit cost, or the current average for a surplus.
- **Outgoing** (`sell`, a `count` shortage): taking `q` of `Q` units valued `V` costs `round(V × q / Q)`, and taking the last units costs exactly `V`, so value reaches zero with stock. That amount is the movement's negative `value_minor` and what the sale or count posts.
- **Stock value** for a store and item is `SUM(value_minor)`, so Store stock (1300) equals the stock value on screen. The average is that value ÷ stock on hand.
- With nothing on hand, the item's `cost_price_minor` is used. It is also the default unit cost offered on a new delivery, and the floor for the selling price.

## Later model (F4)

The prototype is silent on these; they keep the earlier design and reuse `item`, `store` and `stock_movement`.

### Named stores and transfers

| Table            | Key columns                                                                         | Constraints and notes                                                          |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `store`          | More than one per campus ('Main store', 'Bookshop')                                 | Lifts F2's one-per-campus rule                                                 |
| `stock_transfer` | `from_store_id`, `to_store_id`, `status` (sent, received), `sent_by`, `received_by` | Posts `transfer_out` on send and `transfer_in` on receipt, sharing a reference |

### Consumables

| Table              | Key columns                                                                                                                                                    | Constraints and notes                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `requisition`      | `store_id`, `number`, `department`, `status` (draft, submitted, approved, rejected, issued), the approval columns (`created_by` is the requester), `issued_by` | One approval shape (D-025): `approved_by <> created_by`                           |
| `requisition_line` | `requisition_id`, `item_id`, `quantity_requested`, `quantity_approved`                                                                                         | Issuing posts `issue` movements for `quantity_approved`, reference `REQ-<number>` |

### Unit-tracked items: assets and library books

| Table             | Key columns                                                                                                                                                                                             | Constraints and notes                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `item_unit`       | `item_id`, `tag` ('EV-LAP-0042'), `store_id` (home location), `status` (in_store, assigned, on_loan, in_repair, lost, disposed), `custodian_user_id`, `purchase_cost_minor`, `acquired_on`, `condition` | `UNIQUE (organization_id, tag)`. Disposed units are kept                                   |
| `item_unit_event` | `item_unit_id`, `kind` (acquire, assign, return, move, repair, lose, dispose), `from_user_id`, `to_user_id`, `from_store_id`, `to_store_id`, `note`, `by_user_id`                                       | Append-only history of each unit                                                           |
| `library_loan`    | `item_unit_id`, `borrower_student_id`, `borrower_user_id`, `issued_by`, `issued_at`, `due_at`, `returned_at`, `condition_on_return`, `invoice_id`                                                       | Exactly one borrower column set. Partial unique `(item_unit_id) WHERE returned_at IS NULL` |
| `library_setting` | `fine_per_day_minor` (null = no fines), `max_loans_student`, `max_loans_staff`, `loan_days`                                                                                                             | One row per school                                                                         |

A lost or damaged library book, or an overdue fine, creates a charge (`kind = 'library'`) for the student: Dr Fees receivable / Cr Library income. Staff losses are recorded on the unit's history but not billed.

## Permissions

| Phase | Resource      | Actions                          | Notes                                                                                 |
| ----- | ------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| F2    | `store`       | read, receive, issue, count      | `receive` also adds items; `issue` sells; count differences need `adjustment:approve` |
| F4    | `stock`       | transfer                         |                                                                                       |
| F4    | `requisition` | create, read, **approve**, issue |                                                                                       |
| F4    | `asset`       | assign, read, dispose            |                                                                                       |
| F4    | `library`     | lend, return, read, readOwn      |                                                                                       |

## Invariants

- Stock on hand and stock value are always derived from movements; a movement is never edited.
- A reference moves stock at most once per store and item [risk-001].
- Every sale goes through a charge and a payment on the finance ledger; the store never writes a balance.
- Store stock (1300) equals the sum of movement values, because every posting uses the movement's own unit cost.
- Items, assets and books are retired or disposed, never deleted.

## Reports (all derived)

- Store: stock value at average cost, sold this term, profit this term (sales minus frozen cost), items sold, students served, items low or out of stock (also a dashboard task for `store:receive` holders). A "Show costs" switch hides cost, profit and stock value on screen; it is a per-viewer screen switch, not a permission. The Store card is separate from the dashboard's fee figures (D-026).
- Portal Purchases: a student's purchase history and the store price list (books for their level, uniforms by size).
- Later: stock per store, consumption by department, asset register by location and custodian, overdue loans.

## Still open

- Returning a store sale: a "Return items" flow with `sale_return` movements, a credit and a refund. Until then cancelling a sale's payment is refused (D-020).
- Whether parents can buy from the store in the portal (needs the gateway).
- Barcode or QR labels for tags (F4).

Settled since the first draft: cost is a moving weighted average (D-031); "Show costs" stays a screen switch in F2 ([61-store](../prd/61-store.md), STO-12).

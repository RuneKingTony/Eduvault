# PRD: Campus store (books and uniforms)

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53` (script 3983–4208; approvals 1469–1475, 1693–1744; dashboard 1555–1558, 1675–1685; money settings 2754, 2891)
- Milestone and slice: `M4.3` items, deliveries and opening stock; `M4.4` student purchases (with portal Purchases); `M4.5` stock counts and store write-offs (see [roadmap](README.md))
- Related: [data-model-inventory.md, Store model (F2)](../brainstorming/data-model-inventory.md#store-model-f2), [data-model-finance.md](../brainstorming/data-model-finance.md) (accounts 1300, 4500, 5200, 5300; posting table; approval rules), [data-model-overview.md](../brainstorming/data-model-overview.md) (rules every table follows, cross-pillar touchpoints, onboarding), [technical reference](../technical-reference.md) decisions [D-002](../technical-reference.md#decision-log), [D-003](../technical-reference.md#decision-log), [D-004](../technical-reference.md#decision-log), [D-007](../technical-reference.md#decision-log), [D-008](../technical-reference.md#decision-log), [D-013](../technical-reference.md#decision-log), [D-020](../technical-reference.md#decision-log), [D-025](../technical-reference.md#decision-log), [D-026](../technical-reference.md#decision-log), [D-027](../technical-reference.md#decision-log), [D-028](../technical-reference.md#decision-log), [D-030](../technical-reference.md#decision-log), [D-031](../technical-reference.md#decision-log), [D-036](../technical-reference.md#decision-log), [D-044](../technical-reference.md#decision-log)

## Summary

Each campus runs one store that sells uniforms and textbooks to students. Staff add items, record deliveries paid from a money account, sell to a student with payment taken at the counter, and count the shelves. Stock value, cost of sales and losses land on the finance ledger, valued at a moving weighted average cost per item and store. A sale never changes what a family owes for school fees: it is charged and paid in one action. A count that finds a difference waits for a second person as a "Store write-off".

**Stock on hand is derived (D-003).** The prototype keeps a quantity per item and campus (`it.stock[campus]`). The build never stores one. Wherever this PRD says "stock", "in stock", "N left" or "Expected", it means `SUM(stock_movement.quantity)` for that store and item [inventory: Stock movements]. Every change to stock is a new movement row; none is edited or deleted.

**Cost is a moving weighted average per item and store ([D-031](../technical-reference.md#decision-log)).** Each movement carries the value it adds or takes away, so a store's stock value for an item is `SUM(stock_movement.value_minor)` and its average cost is that value divided by stock on hand. Deliveries and opening stock add at their unit cost; sales and count shortages take out at the average (rules 28 to 32). The item's cost price is only the default unit cost for new deliveries. Wherever this PRD says "at cost", it means at this average.

## Who uses it

| Persona                                          | Permission(s)                                               | What they can do here                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Owner                                            | All                                                         | Everything, on every campus; approves write-offs                                                   |
| Bursar, campus-bound (Chika, Lekki; Yemi, Ikeja) | `store:read`, `store:receive`, `store:issue`, `store:count` | See their campus store; add items; record deliveries; sell; count. Cannot approve their own counts |
| Administrator (starter role)                     | `store:read`                                                | See the store on every campus (holds `campus:readAll`)                                             |
| Principal (custom role in seed)                  | `store:read`, `adjustment:approve`                          | See the store; approve or decline store write-offs                                                 |
| Teacher, Member                                  | none                                                        | No nav link; routes answer 403                                                                     |
| Super admin acting read-only                     | read permissions only                                       | Sees the store; every write control is hidden                                                      |

Scopes:

- Items are school-wide configuration (no campus) and visible to every holder of `store:read` [overview: Rules every table follows].
- Stores, stock, deliveries, sales and counts belong to a campus and follow campus scope. Finance screens are campus-scoped, never class-scoped [overview: Class scope].
- Out-of-scope rows answer 404; in scope without the permission answers 403 [tenancy-001].

## Screens

### Store

- Route: `/finance/store`, app `web-admin`.
- Nav: section **Finance**, label "Store", icon `store`, order 3 (after Fees and Payments, before Accounts).
- Phase: F2. Gate: `store:read`.
- Nav badge: for a viewer who can approve, the number of waiting store write-offs in their campus scope (see Approvals below).

#### Header

- Title "Store".
- Description:
  - "Books and uniforms · `{Campus}` campus" when a campus is chosen in the filter.
  - Otherwise "Books and uniforms · `{scope note}`": "All campuses" for a viewer who sees every campus, else their campuses ("Lekki campus", or "Lekki, Ikeja campus").
- Info popover: "Everything handed out is sold and paid for at the store (cash, POS or transfer). It is never added to school fees. Stock is kept per campus."
- Actions, in order:
  1. Switch "Show costs" (off by default). A per-viewer screen setting, remembered in local storage and not saved to the server (STO-12). When off, every cost figure is replaced by "₦ ••••" (screen-reader label "Hidden").
  2. Select "Campus", shown only when the viewer's scope has more than one campus. Options "All campuses" (default) and each campus in scope.
  3. Primary button "Record student purchase", icon `package-check`, gate `store:issue`.
- Overflow menu:
  - "Record a delivery" (icon `truck`, gate `store:receive`).
  - "Start a stock count" (icon `clipboard-check`, gate `store:count`).
  - "Add an item" (icon `plus`, gate `store:receive`).

#### Stats (four tiles)

All figures respect the campus filter, or the viewer's campus scope when "All campuses".

| Tile             | Value                                                             | Subtitle                                             | Click                                  |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Stock value      | Σ stock value at average cost (rule 28); masked unless Show costs | "At cost · `{n}` items low or out"                   | Items tab with the low-stock filter on |
| Sold this term   | Σ sale totals with `sold_on` in the current term                  | "`{n}` students served" (distinct students, STO-14)  | Items sold tab                         |
| Profit this term | Sales this term minus their frozen cost; masked unless Show costs | "Sales minus cost", or "Hidden · turn on Show costs" | none                                   |
| Items sold       | Σ quantities sold this term                                       | "This term · paid at the store"                      | Items sold tab                         |

#### Tabs (key `store`, each with a count)

"Items" (all items), "Items sold", "Deliveries", "Stock counts" (each in the campus filter).

##### Tab: Items

- Toolbar:
  - Search "Search items": matches the display name, case-insensitive.
  - Select labelled "Type": "Books and uniforms" (default), "Uniforms", "Books".
  - Switch "Low or out of stock (`{n}`)": shows only items not in stock.
  - Switch "Show retired" (off by default): adds retired items, marked "Retired".
- Table, 10 per page ("Showing 1 to 10 of N"):

  | Column | Content                                                                                                                                                                                                                                                                                 |
  | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Item   | Icon (`book` for a book, `tag` for a uniform); name in bold; below it the class-level name for a book, or the size ("One size" when none) for a uniform                                                                                                                                 |
  | Type   | Badge "Book" (secondary) or "Uniform" (outline)                                                                                                                                                                                                                                         |
  | Stock  | With "All campuses" and more than one campus in scope: one column per campus, titled with the campus name. The number is bold at or below the item's low level, and in the destructive colour at 0. Otherwise one column "In stock" for the chosen campus or the single campus in scope |
  | Cost   | Average cost of the stock on hand for the chosen campus or the single campus in scope; with "All campuses" and more than one campus, the item's cost price with tip "Default unit cost for new deliveries". Shown only when Show costs is on                                            |
  | Price  | Selling price                                                                                                                                                                                                                                                                           |
  | Status | "In stock", "Low stock" or "Out of stock" (rule 3), tooltip "Low when `{low}` or fewer are left on a campus"                                                                                                                                                                            |

- Empty: "No items match" (icon `search`).
- Row actions (gate `store:receive`; the prototype has none, STO-6):
  - **Edit** (pencil) opens "Edit `{display name}`" with Name, Size (uniforms), Cost price, Selling price and Low at, validated as in Add an item. Type and class level are fixed. Saving a new cost or selling price writes `item_price_change`; a new cost price only changes the default for later deliveries and never revalues stock on hand. Toast "`{display name}` saved."
  - **Retire** (archive) asks "Retire `{display name}`?", body "It is no longer offered for deliveries, sales or counts. Past records keep it.", button **Retire item** (destructive). Toast "`{display name}` retired." Retired items leave the list unless "Show retired" is on.

##### Tab: Items sold

- Table, newest first, 10 per page:

  | Column  | Content                                                                                                         |
  | ------- | --------------------------------------------------------------------------------------------------------------- |
  | Ref     | Sale number in monospace (`ISS-2026-0001`)                                                                      |
  | Date    | Sale date                                                                                                       |
  | Student | Avatar, name, and below it the class ("JSS 2 Gold"), or the level when unplaced                                 |
  | Campus  | Only with "All campuses" and more than one campus in scope                                                      |
  | Items   | "`{item name}` × `{qty}`", comma-separated                                                                      |
  | Total   | Bold amount                                                                                                     |
  | Payment | Success badge "Paid · `{RCT-…}`"; with proof, a `file-check` icon and tooltip "Receipt uploaded: `{file name}`" |

- Row click opens the **Sale** sheet (read-only, every `store:read` holder; STO-15): title the `ISS-…` number; key-values Date, Student (and class), Campus, Sold by; a lines table (Item, Qty, Unit price, Line total) with the Total; Receipt `RCT-…`, linking to the receipt when the viewer has `payment:read`; the proof file, opened through `GET /files/:id`. Action **Statement** (to the student's statement) only when the viewer passes the Who owes gate (`invoice:read` or `payment:read`).
- Empty: "Nothing sold yet" (icon `package`).

##### Tab: Deliveries

- Table, newest first, 10 per page:

  | Column    | Content                                                                                       |
  | --------- | --------------------------------------------------------------------------------------------- |
  | Ref       | Delivery number (`DEL-2026-0001`), or `OPEN-STORE-<campus>` for opening stock                 |
  | Date      | Received date                                                                                 |
  | Supplier  | Supplier name                                                                                 |
  | Campus    | Only with "All campuses" and more than one campus in scope                                    |
  | Items     | Σ quantities                                                                                  |
  | Cost      | Bold total; masked unless Show costs                                                          |
  | Paid from | Money account name ("GTBank current ••4417"); muted "Stock held at go-live" for opening stock |

- Empty: "No deliveries yet" (icon `truck`).

##### Tab: Stock counts

- Table, newest first, 10 per page. A row click or the chevron expands the row.

  | Column      | Content                                                                                                                                               |
  | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
  | (expand)    | Chevron button, label "Show counted items", tooltip "Counted items"                                                                                   |
  | Ref         | `CNT-2026-0001`                                                                                                                                       |
  | Date        | Count date                                                                                                                                            |
  | Campus      | Only with "All campuses" and more than one campus in scope                                                                                            |
  | Differences | "`{item}`: `{n}` missing; `{item}`: `{n}` extra", or "matches"                                                                                        |
  | Value       | Net shortage at average cost (rules 29 and 30): the posted value once approved, otherwise at today's average; masked unless Show costs; "—" when zero |
  | Counted by  | Member name                                                                                                                                           |
  | Status      | "Matched", "Waiting" (submitted; followed by a link button "Approvals" to `/approvals`), "Approved" or "Declined"                                     |

- Expanded row:
  - Header: "`{n}` items counted" ("item" when 1), and the note in small muted text when there is one.
  - Inner table:

    | Column        | Content                                                                                      |
    | ------------- | -------------------------------------------------------------------------------------------- |
    | Item          | Item name                                                                                    |
    | Expected      | Expected quantity                                                                            |
    | Counted       | Counted quantity                                                                             |
    | Difference    | "+n" in the success colour, "−n" in the destructive colour, or muted "matches"               |
    | Value at cost | The difference valued at average cost, as for Value; masked unless Show costs; "—" when zero |

- Empty: title "No stock counts yet", description "Count the shelves each half term. Shortages wait for approval before stock changes." (icon `clipboard-check`).

#### Sheet: Record student purchase (M4.4)

- Large sheet, icon `package-check`. Title "Record student purchase". Description "Pick the items the student is buying and how they paid. Stock goes down and a receipt is issued."
- Opening the sheet generates the sale reference on the client [D-008]: `STORE-YYYYMMDD-` followed by the first 8 characters of a client UUID (STO-9; the prototype uses 4 random digits). The reference is a hidden field. It is kept across validation errors and retries, and cleared only after a successful post.
- Field "Student":
  - Select with "Choose a student", then active students in the viewer's campus scope as "`{name}` · `{GF-0123}`", sorted by name.
  - Hint "Only active students can receive items."
- Before a student is chosen: "Choose a student to see their class’s book list and the uniforms in stock on their campus."
- After a student is chosen:
  - Key-values:
    - "Class": arm, or level when unplaced.
    - "Campus": the campus of the student's current placement. This is the store that sells.
    - "Owes now": the balance pill: "₦X" owing, "₦X extra paid", or "Paid up".
  - Item table. Columns: Item (name; level or size below), Stock ("`{n}` left", bold at or below low level), Price, Qty.
    - Section "Books for `{Level name}`": books for the student's level in the current session.
    - Section "Uniforms": every uniform.
    - A section with no items is omitted.
    - Qty: number input, minimum 0, maximum the stock on hand, placeholder "0". Disabled when stock is 0.
  - Field "Payment":
    - Select of the methods the school has switched on (Cash, POS, Bank transfer, in that order); default the first.
    - Hint "Store items are paid for here, not added to school fees."
  - Field "Payment receipt (required for POS and transfer)":
    - File input accepting an image or a PDF, uploaded through `POST /files` with kind `payment_proof` before the sale is posted ([D-028](../technical-reference.md#decision-log)).
    - Hint "Upload the POS slip or the bank transfer receipt (photo or PDF)."
  - Field "Into" (not in the prototype; STO-1): money accounts of the kind that matches the method (POS → `pos`; Bank transfer → `bank`; Cash → `cash`, then `bank`), not retired, school-wide or on the student's campus. Chosen automatically and hidden when only one fits; otherwise a select defaulting to the first. None fits: "No money account takes `{method}` payments on `{Campus}` campus." and Record purchase stays disabled.
- Buttons:
  - "Cancel" (ghost).
  - "Record purchase" (primary, icon `check`, gate `store:issue`). Disabled with tooltip "Choose a student first" until a student is chosen.
- Validation (toast, danger; the sheet stays open):
  - No student or no quantity: "Choose a student and at least one item."
  - POS without proof: "Upload the POS slip before recording."
  - Transfer without proof: "Upload the transfer receipt before recording."
  - No method: "Choose how the student paid."
  - Stock short at submit (server 409): "Only `{n}` of `{item name}` left at `{Campus}`."
- Same reference already posted (a retry or double submit):
  - The server returns the earlier sale and posts nothing.
  - Toast (warning): "Reference `{ref}` was already recorded as `{RCT-…}`. Nothing was posted twice."
  - The sheet closes.
- On success:
  - The sheet closes and the Items sold tab becomes active.
  - Toast (success): "`{ISS-…}`: `{₦total}` paid, receipt `{RCT-…}`." with action "Statement", which opens Who owes for the student.

#### Sheet: Record a delivery (M4.3)

- Large sheet, icon `truck`. Title "Record a delivery". Description "Stock goes up and the cost is paid from a money account."
- Fields (two-column grid):

  | Field         | Type                  | Required                    | Default                | Notes                                                                                                                                                                                        |
  | ------------- | --------------------- | --------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Supplier      | text with suggestions | yes                         | empty                  | Placeholder "e.g. Adebayo Uniforms Ltd". Suggestions: supplier names already used on this school's deliveries (the prototype hardcodes "Adebayo Uniforms Ltd" and "Lagos Book Distributors") |
  | Campus        | select                | yes                         | first campus in scope  | Campuses in scope                                                                                                                                                                            |
  | Paid from     | select                | yes (not for opening stock) | first eligible account | Non-gateway money accounts that are school-wide or on the chosen campus (rule 14)                                                                                                            |
  | Opening stock | switch                | no                          | off                    | Build addition (STO-2). When on, hides "Paid from"; the supplier defaults to "Opening stock count"                                                                                           |
  | Received on   | date                  | yes                         | today                  | Build addition (STO-10); not in the future                                                                                                                                                   |

- Item table: every active item. Columns: Item (name; level or size below), an empty column, "Unit cost (₦)" (prefilled with the item's cost price, the default for new deliveries, [D-031](../technical-reference.md#decision-log); editable), "Qty" (number, minimum 0, placeholder "0").
- Buttons: "Cancel" (ghost); "Record delivery" (primary, icon `check`, gate `store:receive`).
- Validation: supplier blank or no line with a quantity: "Enter the supplier and at least one quantity." A line with a quantity needs a unit cost above zero (build addition): "Enter a unit cost for every item you received."
- On success:
  - The sheet closes and the Deliveries tab becomes active.
  - Toast (success): "`{DEL-…}` recorded: `{₦total}` paid from `{account name}`."
  - Opening stock (build addition): "Opening stock recorded for `{Campus}`: `{₦total}` at cost."

#### Dialog: Add an item (M4.3)

- Icon `plus`. Title "Add an item". Description "Each size of a uniform is its own item, so each size has its own stock."
- Fields:

  | Field             | Type                  | Required | Default           | Notes                                                                                  |
  | ----------------- | --------------------- | -------- | ----------------- | -------------------------------------------------------------------------------------- |
  | Type              | select Uniform / Book | yes      | Uniform           | Switches the next field                                                                |
  | Name              | text                  | yes      | empty             | Placeholder "e.g. School cardigan" (uniform) or "e.g. Civic Education textbook" (book) |
  | Class level       | select (books only)   | yes      | first class level | Hint "Offered first when a student of this level is served."                           |
  | Size              | text (uniforms only)  | no       | empty             | Placeholder "e.g. Size 10, or leave blank for one size"                                |
  | Cost price (₦)    | decimal               | yes      | empty             | Placeholder "3,500"                                                                    |
  | Selling price (₦) | decimal               | yes      | empty             | Placeholder "5,500"                                                                    |
  | Low at            | integer ≥ 0           | no       | 5                 |                                                                                        |

- Buttons: "Cancel" (ghost); "Add item" (primary, icon `check`, gate `store:receive`).
- Validation:
  - Name, cost price or selling price missing: "Enter a name, a cost price and a selling price."
  - Selling price below cost price: "The selling price is below the cost price."
  - Duplicate (STO-7): "`{display name}` is already in the store."
- On success:
  - The dialog closes and the Items tab becomes active.
  - Toast (success): "`{display name}` added. Record a delivery to put it in stock." with action "Record delivery", which opens the delivery sheet.
- Display name: "`{name}`, `{size}`" when a size is set ("School shirt, Size 10"), otherwise the name.

#### Sheet: Stock count (M4.5)

- Large sheet, icon `clipboard-check`. Title "Stock count". Description "Enter what is on the shelf. Differences wait for a second person to approve."
- Field "Campus": select of campuses in scope, default the first.
- Field "Note": optional textarea (build addition, STO-11).
- Item table: every active item. Columns: Item (name; level or size below), Expected (stock on hand now), Counted (number, minimum 0, prefilled with Expected).
- Buttons: "Cancel" (ghost); "Submit count" (primary, icon `check`, gate `store:count`).
- On submit, after the Stock counts tab becomes active:
  - No differences: status Matched. Toast (success) "Every item matches. Nothing to approve."
  - Differences, and the school has switched write-off approval off: approved at once with `approved_by` null [D-007]. Toast (success) "Count recorded and stock adjusted."
  - Differences, approval on: status Waiting (submitted). Toast (success) "Count submitted. `{₦net value}` of differences wait for approval." with action "Approvals".
  - A count already waiting for this store (STO-4, [D-044](../technical-reference.md#decision-log)): toast (danger) "`{CNT-…}` for this campus is still waiting for approval. Approve or decline it first."

#### Approvals (store write-off rows; the queue itself is in the M3.5 PRD)

- Each waiting count is one row:
  - Request "Store write-off".
  - Details "`{Campus}` stock count: `{differences summary}`".
  - Amount: net value at cost.
  - Asked by: the counter.
- Visible to approvers whose campus scope includes the count's campus.
- Row actions for a holder of `adjustment:approve`:
  - Approve. Opens "Approve this request?", description "Store write-off · asked by `{name}`", key-values Details and Amount, and info callout "Brings store stock in line with the count and records the missing items as a loss at their average cost."
    - Buttons "Cancel", "Approve".
    - Toast "Approved. Stock now matches the count." with action "Store".
  - Decline. Opens "Decline this request?", description "The request stays on record with your reason. Nothing is changed."
    - Field "Reason": required textarea, placeholder "The person who asked will see this".
    - Button "Decline".
    - Toast (warning) "Declined. The request is kept with your reason."
- On the counter's own request: badge "Your own", tooltip "You created this. Someone else must approve it." The API refuses both approve and decline (409, [D-013](../technical-reference.md#decision-log)).
- Without `adjustment:approve`: badge "Someone else", tooltip "Needs someone who can approve money changes".

#### Dashboard surfaces (screen owned by M2.6; content from this module)

- Task, for holders of `store:receive`:
  - Title "`{n}` store item(s) running low" ("item" when 1).
  - Subtitle: the first three display names, then "and `{n}` more".
  - Button "Store".
  - Shown when any item is low or out across the viewer's campuses.
- Card "Store", for holders of `store:read`:
  - Tiles: "Sold this term" (`{n}` students served), "Profit this term" (Sales minus cost), "Items sold" (This term), "Stock value" (At cost).
  - The dashboard's Charged, Received and Still owed tiles leave store sales out; this card carries the store's figures ([D-026](../technical-reference.md#decision-log)).
  - Ghost button "Store".
  - Profit and stock value follow the Show costs rule (STO-12); the prototype shows them unmasked.

#### Other consumers

- Who owes / statement (M3.4): a sale shows as a "Store purchase" charge and an equal payment.
- Charges list kind filter "Store purchase" (M3.3).
- Portal Purchases (M4.4): a student's sales and the price list, seen by every linked guardian ([D-030](../technical-reference.md#decision-log)).

#### States (all store screens)

- Loading: skeleton stats and table rows.
- Error: the standard query error card with retry.
- Denied (403): no-access state; the nav link is hidden without `store:read`.
- Not found (404): any delivery, sale, count or store outside the viewer's campus scope or school.
- Read-only (super admin acting without a reason): "Record student purchase" and the menu items are hidden; "Show costs" and the filters work.

## Business rules

Stock and items:

1. Stock on hand per store and item is the sum of its `stock_movement` quantities. No stored quantity exists; movements are never updated or deleted [D-003; inventory: Stock movements].
2. Each campus has exactly one store, created with the campus ("`{Campus}` campus store"). Existing campuses get one in the M4.3 migration [inventory: Items and stores].
3. An item is "Out of stock" when on-hand is 0 at every campus in view. It is "Low stock" when on-hand is at or below `low_stock_level` at any campus in view, otherwise "In stock". "In view" means the chosen campus, or every campus in the viewer's scope [inventory: Items and stores].
4. Each uniform size is its own item. A book has a class level and no size; a uniform has no class level.
5. Selling price ≥ cost price ≥ 0, in minor units. A zero cost price is allowed (donated stock).
6. Items are retired, never deleted [risk-001]. A retired item is not offered for delivery, sale or count, and stays on past records. Name, size, prices and low level can be edited (`store:receive`); price changes write `item_price_change`.

Deliveries:

7. A delivery has at least one line with quantity > 0. Each line records its own unit cost on the line and on its `receive` movement, whose value is quantity × unit cost (rule 28) [inventory: Cost].
8. A delivery posts at once: Dr Store stock (1300) / Cr the money account's ledger account, for Σ quantity × unit cost, campus = the store's campus, reference `DEL-…` [D-004; finance: posting table].
9. Opening stock is a delivery with `is_opening`, no money account and `opening` movements. It posts Dr Store stock / Cr Opening balance with reference `OPEN-STORE-<campus>`. At most one per store; a second is refused (409) [overview: Onboarding a school mid-life].

Sales:

10. A sale is one transaction. If any step fails, nothing posts:
    - a `store` charge for the current term (lines "`{item}` × `{qty}`" to Store sales 4500), posted Dr Fees receivable (student) / Cr Store sales, reference `CHG-…`;
    - its cost, Dr Cost of store items sold (5200) / Cr Store stock (1300), reference `CHG-…-COST`, for the sum of the lines' costs at the store's average (rule 29);
    - a payment of the same total, Dr money account / Cr Fees receivable, with the sale reference and a receipt number;
    - `sell` movements, with the sale reference.

    [inventory: Sales to students; finance: posting table]

11. The selling store is the one on the student's current placement campus. The viewer must have that campus in scope, or the student answers 404.
12. Only active students can buy. A student who is Inactive, Left or Graduated is refused (409).
13. A sale is refused (409) if any line would take stock below zero. The check locks the store-item pairs while it runs, in a fixed order, and the average cost is read under the same lock [inventory: Stock movements].
14. Payment method is one the school has switched on (else 422). POS and transfer need proof, uploaded through `POST /files` and stored as the payment's `proof_file_id` ([D-028](../technical-reference.md#decision-log); else 422). The money account is one of the kind matching the method, not retired, school-wide or on the student's campus (else 422). A delivery's "Paid from" lists non-gateway, non-retired accounts that are school-wide or on the delivery's campus.
15. The sale reference is generated by the client [D-008], as `STORE-YYYYMMDD-` plus 8 characters of a UUID. A repeat with the same reference returns the earlier sale and posts nothing [risk-001]. A repeat with the same reference and a different student or lines is refused (409).
16. Unit price and cost are frozen on each sale line at the time of sale: the line's cost is taken at the store's average (rule 29) and stored as `cost_minor`, with `unit_cost_minor` = that cost ÷ quantity, rounded, for display [inventory: Sales to students].
17. The payer on the payment is the student's first guardian marked as paying, otherwise "Family of `{student name}`".
18. A sale is shown as paid from `store_sale.payment_id`, not from oldest-first matching of payments to charges. Matching would show a store sale as unpaid for a student with older fee debt [finance: line 107].
19. A sale leaves the student's balance unchanged: the charge and payment net to zero.

Stock counts:

20. Expected quantity is stock on hand when the count is submitted. A count with no differences is `matched` and posts nothing [inventory: Stock counts].
21. A count with any difference waits as a "Store write-off" for `adjustment:approve`. If the school has switched off the `write_off` approval kind, it posts at once with `approved_by` null [finance: Approval rules, shared with "Cancelling a balance"; D-007]. Switching it off leaves counts already waiting as they are ([D-027](../technical-reference.md#decision-log)). One count may wait per store; a second answers 409 ([D-044](../technical-reference.md#decision-log)).
22. Nobody approves or declines their own count: `approved_by <> created_by`, and `rejected_by <> created_by` (409) [overview: Rules every table follows].
23. Approval posts one `count` movement per differing line of `counted − expected`, with reference `CNT-…`, valued at approval time: a shortage at the store's average (rule 29), a surplus per rule 30. It posts one journal entry for the net value: net shortage Dr Store stock losses (5300) / Cr Store stock, net surplus the reverse [finance: posting table]. Approval is refused (409 "Stock has moved since this count. Count again.") if any line would take stock below zero ([D-044](../technical-reference.md#decision-log)).
24. Declining needs a reason, sets status `rejected` and leaves stock unchanged.
25. Only waiting counts can be approved or declined (409 otherwise).

Viewing:

26. "Show costs" only changes the screen. The API returns cost fields to every holder of `store:read`; there is no cost permission.
27. "This term" figures use sales whose `sold_on` falls within the current term's dates and the campus filter or scope. "Students served" counts distinct students.

Cost ([D-031](../technical-reference.md#decision-log)):

28. A store's stock value for an item is `SUM(stock_movement.value_minor)` over its movements. `receive` and `opening` movements add quantity × unit cost. When on hand is 0, the value is 0.
29. Taking `q` units out of a store that holds `Q` units valued `V` (a sale line, or a count shortage) costs `round(V × q / Q)`, half up in minor units; taking the last units costs exactly `V`. That amount is the movement's negative `value_minor` and the amount posted. The average cost shown anywhere is `V / Q`, rounded.
30. A count surplus adds units at the current average; when the store holds none of the item, at the item's cost price.
31. The item's cost price is the default unit cost for a new delivery and the fallback in rule 30. Changing it never revalues stock on hand.
32. Store stock (1300) for a campus always equals the sum of that store's stock values: every posting to 1300 is the value of a movement.

Returns:

33. A store sale's payment can't be cancelled on its own: a void request on it answers 409 ([53](53-payments.md#business-rules) rule 22, [D-020](../technical-reference.md#decision-log)). Returning goods (stock back, charge reduced, refund) is a later flow.

## Data

All tables are in [data-model-inventory.md, Store model (F2)](../brainstorming/data-model-inventory.md#store-model-f2). Postings and ledger accounts are in [data-model-finance.md](../brainstorming/data-model-finance.md). Each table has `id`, `organization_id`, `created_at`, `updated_at`; campus FKs are composite `(campus_id, organization_id)`; FKs to money, items and movements are `ON DELETE RESTRICT` [risk-001].

| Slice | Migration                           | Tables                                                                                                                                                                                                                |
| ----- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4.3  | `create_store_items_and_deliveries` | `item`, `item_price_change`, `store` (plus a backfill of one store per existing campus), `stock_movement`, `stock_delivery`, `stock_delivery_line`. Ledger accounts 1300, 4500, 5200, 5300 are already seeded by M3.1 |
| M4.4  | `create_store_sales`                | `store_sale`, `store_sale_line`; `invoice.kind` already allows `store` (M3.3)                                                                                                                                         |
| M4.5  | `create_stock_counts`               | `stock_count`, `stock_count_line`                                                                                                                                                                                     |

Document sequences `ISS`, `DEL` and `CNT` per school [overview: Rules every table follows].

New or changed, flagged (not in the data-model docs):

- `item`:
  - `CHECK (sell_price_minor >= cost_price_minor AND cost_price_minor >= 0)`;
  - `CHECK ((kind = 'book') = (class_level_id IS NOT NULL))`;
  - `CHECK (kind <> 'book' OR variant IS NULL)`;
  - partial unique `(organization_id, kind, name, variant, class_level_id) NULLS NOT DISTINCT WHERE retired_at IS NULL` (STO-7).
- `stock_count`:
  - the counter is `created_by` (the doc's `counted_by`), shown as "Counted by", with the one approval column shape ([D-025](../technical-reference.md#decision-log)): add `approved_at`, `rejected_at`, `rejection_reason`;
  - `CHECK (approved_by <> created_by)` and `CHECK (rejected_by <> created_by)`;
  - partial unique `(store_id) WHERE status = 'submitted'` (STO-4).
- `stock_count_line`: one row per item counted, including matching ones (STO-3).
- `stock_delivery`:
  - `number` holds `OPEN-STORE-<campus>` for opening stock (no `DEL` number consumed);
  - partial unique `(store_id) WHERE is_opening`;
  - `CHECK (is_opening = (money_account_id IS NULL))`.
- `store_sale`: `UNIQUE (organization_id, reference)`; the payment uses the same reference.
- `stock_movement.value_minor` (signed): the value the movement adds or takes away (rules 28 to 30, [D-031](../technical-reference.md#decision-log)).
- `store_sale_line.cost_minor`: the line's frozen cost at the average (rule 16).
- The data model's "Cost" section (item cost price for sales and counts) is replaced by rules 28 to 32.

Seed (M0.2, from `seedStore`):

- Uniform sizes (shirt, trousers, pinafore, sportswear set, tie) and JSS 1–SS 1 textbooks, with cost, price and low levels.
- Opening stock for Lekki and Ikeja on 2026-09-01.
- One Adebayo Uniforms delivery to Lekki paid from GTBank.
- Seven paid sales.
- One waiting Lekki count by Chika (shirt size 14: 2 missing; tie: 1 missing) with note "Shelf count after mid-term stock check".

## API

Contract types in `@eduvault/api-contract` under `contract.store`. Every handler carries `@OrganizationAuth(resource, action)`. List routes take `?campusId=` (campus filter) and return only rows in campus scope.

| Method | Path                        | Permission           | Request                                                                                                              | Response                                                                                                     | Errors                                                                                                                                                                                       |
| ------ | --------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/store/summary`            | `store:read`         | `?campusId=`                                                                                                         | `{ stockValueMinor, lowCount, termSalesMinor, termCostMinor, termSalesCount, termItemsSold }`                | 403; 404 campus out of scope                                                                                                                                                                 |
| GET    | `/store/items`              | `store:read`         | `?campusId=&kind=&q=&lowOnly=&includeRetired=`                                                                       | `Item[]` with `stock: { campusId, onHand, valueMinor, averageCostMinor }[]` for campuses in view and `state` | 403                                                                                                                                                                                          |
| POST   | `/store/items`              | `store:receive`      | `{ kind, name, variant?, classLevelId?, costPriceMinor, sellPriceMinor, lowStockLevel? }`                            | `Item`                                                                                                       | 403; 409 duplicate; 422 price below cost, book without level, uniform with level                                                                                                             |
| PATCH  | `/store/items/:id`          | `store:receive`      | `{ name?, variant?, costPriceMinor?, sellPriceMinor?, lowStockLevel?, retired? }`                                    | `Item`; price changes write `item_price_change`                                                              | 403; 404; 422                                                                                                                                                                                |
| GET    | `/store/deliveries`         | `store:read`         | `?campusId=`                                                                                                         | `Delivery[]`                                                                                                 | 403                                                                                                                                                                                          |
| GET    | `/store/deliveries/:id`     | `store:read`         | none                                                                                                                 | `Delivery` with lines                                                                                        | 403; 404 out of scope                                                                                                                                                                        |
| POST   | `/store/deliveries`         | `store:receive`      | `{ campusId, supplierName, moneyAccountId?, isOpening?, receivedOn?, lines: [{ itemId, quantity, unitCostMinor }] }` | `Delivery`                                                                                                   | 403; 404 campus or money account out of scope; 409 opening stock already recorded; 422 no lines, quantity ≤ 0, retired item, gateway account, or account on another campus                   |
| GET    | `/store/sales`              | `store:read`         | `?campusId=&studentId=`                                                                                              | `Sale[]` with `receiptNumber`, `proof` flag                                                                  | 403                                                                                                                                                                                          |
| GET    | `/store/sales/:id`          | `store:read`         | none                                                                                                                 | `Sale` with lines                                                                                            | 403; 404                                                                                                                                                                                     |
| POST   | `/store/sales`              | `store:issue`        | `{ reference, studentId, method, moneyAccountId?, proofFileId?, lines: [{ itemId, quantity }] }`                     | 201 `Sale` (with `chargeNumber`, `receiptNumber`); 200 with `replayed: true` for a known reference           | 403; 404 student out of scope; 409 student not active, stock short (`{ itemId, onHand }`), or reference reused with different content; 422 method off, proof missing, no lines, retired item |
| GET    | `/store/counts`             | `store:read`         | `?campusId=`                                                                                                         | `Count[]` with lines and net value                                                                           | 403                                                                                                                                                                                          |
| GET    | `/store/counts/:id`         | `store:read`         | none                                                                                                                 | `Count`                                                                                                      | 403; 404                                                                                                                                                                                     |
| POST   | `/store/counts`             | `store:count`        | `{ campusId, note?, lines: [{ itemId, countedQuantity }] }`                                                          | `Count` (`matched`, `submitted` or `approved`)                                                               | 403; 404 campus out of scope; 409 a count already waiting for this store; 422 negative count                                                                                                 |
| POST   | `/store/counts/:id/approve` | `adjustment:approve` | none                                                                                                                 | `Count`                                                                                                      | 403; 404 out of scope; 409 own count, not waiting, or would take stock below zero ([D-044](../technical-reference.md#decision-log))                                                          |
| POST   | `/store/counts/:id/reject`  | `adjustment:approve` | `{ reason }`                                                                                                         | `Count`                                                                                                      | 403; 404; 409 own count or not waiting; 422 reason blank                                                                                                                                     |

- Proof files are uploaded through `POST /files` with kind `payment_proof` (M2.2, [D-028](../technical-reference.md#decision-log)); `proofFileId` is its result. That route must accept `store:issue` for this kind as well as `payment:record`.
- `moneyAccountId` is required when more than one account fits (rule 14).
- Waiting counts also feed `/approvals` as kind `store_write_off` through the store module's provider ([D-036](../technical-reference.md#decision-log)), from M4.5.

## Acceptance criteria

1. Given Chika (bursar, Lekki only), when she opens Store, then the description reads "Books and uniforms · Lekki campus", there is no Campus select, and the Items table has one "In stock" column.
2. Given the owner (all campuses), when they open Store with "All campuses", then the Items table has a Lekki and an Ikeja column, and Size 14 shirt shows 0 at Ikeja in the destructive colour.
3. Given Show costs is off, when the store loads, then Stock value, Profit, delivery Cost and count Value read "₦ ••••", and the Profit subtitle reads "Hidden · turn on Show costs".
4. Given a stock level equal to an item's low level on one campus, when the Items tab loads, then the item shows "Low stock". The "Low or out of stock" switch includes it.
5. Given Chika, when she adds a Book with no class level, or a selling price below cost, then the API answers 422 and the dialog shows "The selling price is below the cost price." for the price case.
6. Given Chika, when she records a delivery of 10 Size 12 shirts at ₦3,500 paid from GTBank, then:
   - stock rises by 10 through one `receive` movement;
   - one journal entry Dr 1300 / Cr GTBank for ₦35,000 posts with reference `DEL-…`, and the movement's value is ₦35,000;
   - the toast reads "`DEL-…` recorded: ₦35,000 paid from GTBank current ••4417."
7. Given a campus with opening stock already recorded, when opening stock is recorded again, then the API answers 409.
8. Given Ada (active, JSS 2 Gold, Lekki), when Chika sells her three JSS 2 books by POS with a slip:
   - the store charge, cost entry (Dr 5200 / Cr 1300 for the books' cost at the Lekki average), payment and three `sell` movements post in one transaction;
   - Ada's balance is unchanged;
   - Items sold shows "Paid · RCT-…" with the receipt icon.
9. Given the same sale request is sent twice with one reference, when the second arrives, then nothing new posts, the API returns the first sale with `replayed: true`, and the UI shows "Reference … was already recorded as RCT-…. Nothing was posted twice."
10. Given two tills sell the last Size 14 shirt at once, when both submit, then exactly one succeeds and the other gets 409 "Only 0 of School shirt, Size 14 left at Lekki."
11. Given a transfer sale without proof, when submitted, then the API answers 422 and the toast reads "Upload the transfer receipt before recording."
12. Given the school has switched POS off, when the purchase sheet opens, then POS is not offered, and a POS request answers 422.
13. Given Chika, when she sells to an Ikeja student by id, then the API answers 404. When she sells to an Inactive Lekki student, it answers 409.
14. Given a student who owes old term fees, when they buy at the store, then the sale still shows "Paid".
15. Given a count where every counted figure equals expected, when submitted, then status is Matched, nothing posts, and the toast reads "Every item matches. Nothing to approve."
16. Given approval of write-offs is on, when Chika submits a count with one tie missing, then status is Waiting and the Approvals queue shows a "Store write-off" row. The Store nav link shows a count for the principal, not for Chika.
17. Given Chika's waiting count, when Chika approves or declines it, then the API answers 409. When Grace (principal) approves it, a `count` movement of −1 posts and the journal posts Dr 5300 / Cr 1300 at the tie's average cost at Lekki.
18. Given a waiting count, when an approver declines without a reason, then the API answers 422. With a reason, status is Declined and stock is unchanged.
19. Given write-off approval is switched off, when a count with differences is submitted, then it is Approved with `approved_by` null, and the toast reads "Count recorded and stock adjusted."
20. Given a count waiting for Lekki, when another Lekki count is submitted, then the API answers 409.
21. Given a user of another school, when they call any store route with this school's ids, then the API answers 404. A Teacher gets 403.
22. Given a super admin acting without a reason, when they open Store, then no write control is shown and every write answers 403.
23. Given Lekki holds 10 School shirt, Size 12 valued ₦30,000 (average ₦3,000), when 10 more are delivered at ₦3,500, then the stock value is ₦65,000 and the average ₦3,250; when Chika then sells 2 to Ada, the cost entry posts Dr 5200 / Cr 1300 ₦6,500, the sale line keeps a cost of ₦6,500, and the stock value falls to ₦58,500.
24. Given Lekki holds 3 ties valued ₦10,000, when 1 is sold, then its cost is ₦3,333; when the last 2 are sold, their cost is ₦6,667 and the stock value is ₦0.
25. Given a count finds 1 extra Size 12 shirt where the average is ₦3,250, when it is approved, then a `count` movement of +1 valued ₦3,250 posts and the journal posts Dr 1300 / Cr 5300 ₦3,250.
26. Given the item cost price of Size 12 shirts changes from ₦3,500 to ₦3,800, then the stock value on hand is unchanged and the next delivery sheet prefills ₦3,800.
27. Given the receipt of a store sale's payment, when a bursar requests a void through the API, then 409 and nothing changes.
28. Given a waiting count with one tie missing and the last tie sold since, when Grace approves it, then 409 "Stock has moved since this count. Count again." and nothing posts.
29. Given a member with `store:read` only, when they click an Items sold row, then the Sale sheet opens with lines, receipt number and proof, and no Statement action.
30. Given POS is the method and Lekki has one POS account, when Chika records a purchase, then Into is hidden and the payment goes into that account.

## Tests

- Unit (`nx run web-admin:test`):
  - stock state (in, low, out) across campuses in view;
  - display names;
  - differences summary and net value;
  - masking under Show costs;
  - the purchase sheet keeps its reference across a failed submit and clears it after success;
  - the method list honours the school's switches.
- Unit (`nx run api:test`): posting builders for delivery, opening stock, sale (three entries balance), and count shortage, surplus and mixed; the average-cost calculator (rounding, last unit takes the remainder, surplus with none on hand).
- Integration (`api:test-integration`, real Postgres) [testing-002]:
  - Isolation per new table and route [tenancy-002]: `item`, `item_price_change`, `store`, `stock_movement`, `stock_delivery(_line)`, `store_sale(_line)`, `stock_count(_line)`.
    - Another school gets 404 on every id route.
    - A Lekki-only bursar gets 404 on Ikeja deliveries, sales, counts and students.
  - Permissions: each write gated as in the API table (403); approve and reject need `adjustment:approve`.
  - Derived stock: on-hand equals Σ movements after delivery, sale and count approval. No movement row is ever updated (trigger or test asserts).
  - Concurrency: two parallel sales for the last unit; exactly one succeeds.
  - Idempotency: a replayed sale reference posts once; the same reference with a different body gets 409; the payment and movement uniqueness hold.
  - Ledger: each flow's journal entry balances. After a sale the student's balance is unchanged and Store stock falls by the frozen cost. After any mix of deliveries, sales and approved counts, 1300 per campus equals Σ `value_minor` for that store, and selling the last unit leaves a value of 0.
  - Approvals: self-approval and self-decline are refused by API and DB check. A switched-off write-off posts with `approved_by` null. One waiting count per store.
  - Opening stock: once per store.
- E2E (required, `eduvault-e2e`):
  - Bursar records a delivery, then sells to a student by cash, and the statement shows a charge and an equal payment.
  - Bursar submits a count with a shortage; the principal approves it in Approvals; stock and Store stock losses update.
  - Foreign-school user and teacher are refused.

## Open decisions

| #      | Question                                                                                                                                         | Options                                                                                                                                                                                                                                                                                   | Recommendation                                                                                                       | Confidence                                                                                    | Decided                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| STO-1  | Which money account receives a store payment? The doc says it "follows the method"; the prototype hardcodes POS → Moniepoint POS, else → GTBank. | (a) An "Into" select filtered to accounts of the matching kind (POS → `pos`; cash and transfer → `bank`), school-wide or on the student's campus, auto-chosen and hidden when only one; (b) a default account per method per campus in settings; (c) always ask, like the Payments screen | (a)                                                                                                                  | Medium: no new settings, matches the Payments screen's account picker, keeps the counter fast | Adopted                                                                                                                                            |
| STO-2  | How does a school record opening stock? The prototype has no UI (seed only).                                                                     | (a) An "Opening stock" switch on Record a delivery, once per store; (b) a CSV import; (c) a separate "Opening stock" sheet                                                                                                                                                                | (a)                                                                                                                  | Medium: reuses the delivery form; the posting is already defined                              | Adopted                                                                                                                                            |
| STO-3  | Does a count store every item counted, or only differences? The prototype keeps only differing lines.                                            | (a) Every item on the sheet; (b) differences only                                                                                                                                                                                                                                         | (a): the record proves what was counted, and "`{n}` items counted" stays true                                        | Medium                                                                                        | [D-044](../technical-reference.md#decision-log): every item recorded                                                                               |
| STO-4  | Can a second count be submitted for a store while one is waiting?                                                                                | (a) No, 409 until the waiting one is decided; (b) yes, each approved independently                                                                                                                                                                                                        | (a)                                                                                                                  | Medium: two waiting counts would apply overlapping differences twice                          | [D-044](../technical-reference.md#decision-log): 409 while one waits                                                                               |
| STO-5  | A sale between submission and approval can make `on hand + (counted − expected)` negative. What then?                                            | (a) Refuse approval (409 "Stock has moved since this count. Count again."); (b) clamp at zero (prototype); (c) allow negative                                                                                                                                                             | (a)                                                                                                                  | Medium: clamping breaks D-003's movement sum; negative stock breaks the sale rule             | [D-044](../technical-reference.md#decision-log): approval refused (409)                                                                            |
| STO-6  | Editing and retiring items, and writing `item_price_change`. No UI in the prototype.                                                             | (a) Row actions "Edit" (name, size, prices, low level) and "Retire" with `store:receive`, recording price changes; (b) prices fixed at creation                                                                                                                                           | (a)                                                                                                                  | High: prices change each session and the audit table already exists                           | Adopted                                                                                                                                            |
| STO-7  | Is a duplicate item (same kind, name, size, level) allowed?                                                                                      | (a) Refuse (409) among active items; (b) allow                                                                                                                                                                                                                                            | (a)                                                                                                                  | High: a duplicate splits stock across two rows                                                | Adopted                                                                                                                                            |
| STO-8  | Cost basis when a delivery's unit cost differs from the item's cost price (inventory doc, still open)                                            | (a) Keep the item cost price for sales and counts; a different delivery cost leaves the difference in Store stock; (b) moving weighted average; (c) the delivery updates the item's cost price                                                                                            | (c): it records an `item_price_change`, so later sales and counts use the latest cost                                | Low: (b) is more correct but heavier; (a) lets 1300 drift from the stock value                | [D-031](../technical-reference.md#decision-log): moving weighted average per item and store; the item cost price is the default for new deliveries |
| STO-9  | Sale reference format (client-generated, D-008)                                                                                                  | (a) `STORE-YYYYMMDD-NNNN` with 4 random digits (prototype); (b) `STORE-YYYYMMDD-` plus 8 characters of a UUID; (c) a bare UUID                                                                                                                                                            | (b)                                                                                                                  | High: (a) can collide across tills on a busy day; (b) stays readable on the slip              | Adopted                                                                                                                                            |
| STO-10 | Dates on store records                                                                                                                           | (a) Today only (prototype); (b) a "Received on" date for deliveries (not future), sales and counts today only                                                                                                                                                                             | (b)                                                                                                                  | Medium: deliveries are often keyed in late; sales happen at the till                          | Adopted                                                                                                                                            |
| STO-11 | Note on a stock count. The seed count has one but the sheet has no field.                                                                        | (a) Optional note field; (b) none                                                                                                                                                                                                                                                         | (a)                                                                                                                  | High: the column exists and the Counts tab shows it                                           | Adopted                                                                                                                                            |
| STO-12 | Is "Show costs" a permission? (inventory doc, still open)                                                                                        | (a) A per-viewer screen switch, remembered in local storage; (b) a new `store:readCost` permission that also strips cost fields from the API and the dashboard                                                                                                                            | (a) for F2. The dashboard store card masks profit and stock value the same way                                       | Medium: no new permission in F2; revisit if schools want cost hidden from bursars             | Adopted                                                                                                                                            |
| STO-13 | Returning or cancelling a sale (inventory doc, still open)                                                                                       | (a) Out of F2; refuse a payment cancellation (409) on a payment linked to a store sale; (b) a "Return items" flow with `sale_return` movements, a credit and a refund                                                                                                                     | (a) now, (b) later                                                                                                   | Medium: cancelling the payment alone leaves the family owing and stock not restored           | [D-020](../technical-reference.md#decision-log): payment cancellation refused (409); returns later                                                 |
| STO-14 | "Sold this term" subtitle says "`{n}` students served" but counts sales                                                                          | (a) Count distinct students; (b) relabel "`{n}` sales"                                                                                                                                                                                                                                    | (a)                                                                                                                  | High: the copy says students                                                                  | Adopted                                                                                                                                            |
| STO-15 | Items sold row link to Who owes for a viewer without its gate (`invoice:read` and `payment:read`)                                                | (a) Not a link; (b) open a sale detail sheet instead                                                                                                                                                                                                                                      | (b) a read-only sale sheet (lines, receipt, proof) for every `store:read` holder, with "Statement" only when allowed | Medium: a store-only role still needs to see a sale                                           | Adopted                                                                                                                                            |

## Prototype gaps noticed

Stock and costs:

- Stock is a stored per-campus number (`it.stock`), mutated in place. The build derives it from movements (D-003).
- `approveStoreCount` clamps stock at zero with `Math.max(0, …)` (STO-5).
- Delivery unit cost can differ from the item's cost price, but sales and counts always use the item's cost price, so Store stock (1300) drifts from the screen's stock value (STO-8).

Approvals:

- A switched-off write-off sets `approvedBy` to the counter. D-007 requires null.
- The purchase sheet ignores the school's payment-method switches; the Payments screen honours them.

Sales:

- The sale's money account is hardcoded (STO-1).
- The proof is kept as a file name only; no upload or `proof_file_id`.
- The "Unpaid" badge on Items sold can't occur: every sale is paid in the same action.
- "`{n}` students served" counts sales, not students (STO-14).

Items and deliveries:

- Opening stock exists only in the seed (STO-2).
- "Add an item" refuses a zero cost price (`!cost`).
- The book class level defaults to the first level (JSS 1).
- New items get a hardcoded `{ lekki, ikeja }` stock map.
- The delivery "Paid from" list includes accounts on campuses other than the delivery's.
- Supplier suggestions are hardcoded.

Counts:

- The count sheet has no note field, though the record and the Counts tab show one (STO-11).
- The count keeps only differing lines, yet its expanded view is built to show "matches" (STO-3).
- The waiting-count toast and Approvals amount show the net value. A count with equal shortage and surplus shows ₦0 while stock still changes.

Dashboard and links:

- The dashboard store card shows profit and stock value regardless of Show costs (STO-12).
- The Items sold row links to Who owes even for viewers without its gate (STO-15).

Not designed:

- No sale detail, delivery detail, item detail, edit, retire, return or cancel (STO-6, STO-13).
- No dates on any store form (STO-10).

## Dependencies

None of these exist in code yet; today's migrations hold only `campus`, `school_account`, `fee_schedule` and `student`.

- M1.1: `store:*` and `adjustment:approve` in `libs/policy`, the guard, nav gating, `/me/permissions`.
- M2.1 terms (current term); M2.2 campuses (a store per campus); M2.4 students, enrolment, placement, guardians (payer); M2.5 student lifecycle (active check).
- M3.1: ledger core, accounts 1300/4500/5200/5300, Opening balance, money accounts, `document_sequence`.
- M3.3: charges with `kind = 'store'`.
- M2.2: the `FileStore` and `/files` for proof uploads ([D-028](../technical-reference.md#decision-log)).
- M3.4: payments with receipts, the statement, and the payment-method switches (Payment rules).
- M3.5: Approvals queue, approval rules (`write_off` switch), self-approval check.
- M4.4 needs M4.3, M3.4 and M2.8 (portal Purchases ships with it); M4.5 needs M4.3 and M3.5.

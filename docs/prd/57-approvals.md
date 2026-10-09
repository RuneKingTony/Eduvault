# PRD: Approvals

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M3.5` (Approvals queue and approval rules; money kinds, including payment-cancellation requests, which ship with their approval, [D-032](../technical-reference.md#decision-log)). Leave items join with `M3.6`, store write-offs with `M4.5` (see [roadmap](README.md))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md) (Rules every table follows: approval columns and null campus on approval items; Permission list), [data-model-finance.md](../brainstorming/data-model-finance.md) (Decisions: second person; Settings: approval rules), [data-model-inventory.md](../brainstorming/data-model-inventory.md) (stock counts), [53-payments.md](53-payments.md), [55-discounts-and-refunds.md](55-discounts-and-refunds.md), [22-staff-leave.md](22-staff-leave.md), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-006](../technical-reference.md#decision-log), [D-007](../technical-reference.md#decision-log), [D-013](../technical-reference.md#decision-log), [D-025](../technical-reference.md#decision-log), [D-027](../technical-reference.md#decision-log), [D-031](../technical-reference.md#decision-log), [D-032](../technical-reference.md#decision-log), [D-035](../technical-reference.md#decision-log), [D-036](../technical-reference.md#decision-log)

## Summary

One inbox for every request that needs a second person: payment cancellations, fee reductions, cancelled balances, refunds, discounts, store write-offs and staff leave. An approver sees what is waiting on their campuses, confirms or declines with a reason, and can never decide their own request. A bell in the top bar and counts in the side nav say how many are waiting. The school decides, per money kind, whether approval is needed at all ("Approval rules").

## Who uses it

| Persona                   | Permission(s)                                           | What they can do here                                                                  |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Owner (Funmi)             | all                                                     | Decide every money item and every leave request, except her own; change Approval rules |
| Principal (Grace, custom) | `adjustment:approve`, `leave:approve`, `campus:readAll` | Decide money items and leave across campuses, except her own                           |
| Bursar (Chika)            | none of the approve permissions                         | Sees the leave-only page (her own leave), see [22-staff-leave.md](22-staff-leave.md)   |
| Any other staff member    | none                                                    | The leave-only page                                                                    |
| Administrator             | `schoolAccount:read`                                    | Leave-only page; Approval rules read-only                                              |
| Super admin acting        | read permissions (all with a reason)                    | Read-only: sees items, no decisions; with a reason, decides like an approver (audited) |

Scopes applied:

- An item is visible when its campus (rule 3) is in the viewer's campus scope; an item with no campus is visible to every approver ([overview](../brainstorming/data-model-overview.md#rules-every-table-follows)).
- Deciding needs the item's permission: `adjustment:approve` for money and store items, `leave:approve` for leave.
- Deciding an item outside scope answers 404; in scope without the permission answers 403; your own item answers 409 [tenancy-001].

## Screens

### Approvals

- Route `/approvals`, web-admin, nav section Overview, second item (after Dashboard, before Announcements), phase F1. Gate: any signed-in member of the school (no permission). Command and nav icon: inbox.
- The page has two bodies:
  - **Viewer holds neither `adjustment:approve` nor `leave:approve`**: title "Approvals", description "Ask for leave and see what the school decides.", action **Request leave**, and the leave page. Specified in [22-staff-leave.md](22-staff-leave.md).
  - **Viewer holds either**: the queue below.
- Header (queue): title "Approvals"; description "Requests waiting for you to approve: money corrections and staff leave."; info tip "Staff ask, a boss approves. You can’t approve your own request." No actions.
- **Toolbar row**:
  - Left: tabs, shown only when the list holds more than one pillar: "All" ({count}), "Money" ({count}), "Leave" ({count}).
  - Right: a switch "Include {n} others approve" (build copy: "Include {n} that others approve"), shown only when items exist in scope that the viewer can't decide. Off by default; on, those items join the list.
- **Queue table** (one card), 10 per page, oldest request first:

  | Column    | Content                                                                       |
  | --------- | ----------------------------------------------------------------------------- |
  | Request   | Pillar icon (wallet for money, calendar for leave) and the kind label in bold |
  | Details   | One line per kind (table below), up to about 44 characters wide, wrapping     |
  | Amount    | ₦ amount, or the amount text ("5% off", "3 days"); blank when neither         |
  | Asked by  | Avatar and name                                                               |
  | (actions) | See below                                                                     |

- Items by kind:

  | Kind label         | Source                                | Details                                                                   | Amount                        | Permission           | Opens (from bell)     |
  | ------------------ | ------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- | -------------------- | --------------------- |
  | "Cancel a payment" | waiting `payment_void`                | "{RCT-2026-00098} from {payer}: {reason}"                                 | the payment amount            | `adjustment:approve` | Discounts and refunds |
  | "Reduce a fee"     | waiting `adjustment` `credit_note`    | "{student}: {reason}"                                                     | the amount                    | `adjustment:approve` | Discounts and refunds |
  | "Cancel a balance" | waiting `adjustment` `write_off`      | "{student}: {reason}"                                                     | the amount                    | `adjustment:approve` | Discounts and refunds |
  | "Refund"           | waiting `adjustment` `refund`         | "{student}: {reason}"                                                     | the amount                    | `adjustment:approve` | Discounts and refunds |
  | "Discount"         | waiting `student_discount`            | "{student}: {reason} ({5%} \| {₦15,000})"                                 | "{5}% off" or "₦{15,000} off" | `adjustment:approve` | Discounts and refunds |
  | "Store write-off"  | waiting stock count with a difference | "{Lekki} stock count: {summary}" (summary per [61-store.md](61-store.md)) | the loss at cost              | `adjustment:approve` | Store                 |
  | "Leave"            | waiting `staff_leave`                 | "{member} · {Annual leave} · {range}. {reason}"                           | "{n} day(s)"                  | `leave:approve`      | Approvals             |

- **Actions cell** per row:
  - The viewer lacks the item's permission (only seen with the switch on): badge "Someone else" (outline), tip "The owner or principal decides leave" for leave, "Needs someone who can approve money changes" otherwise.
  - The viewer asked for it: badge "Your own" (warning), tip with the self-approval message (rule 6).
  - Otherwise: **Approve** (primary, small, check) and **Decline** (ghost, small, x).
- Empty: "Nothing waiting for you", "When staff ask for leave, or to refund, discount, write off or void a payment, the request appears here." (check icon).
- Below the table, for an approver who is not an owner: the **My leave** card and the Request leave dialog from [22-staff-leave.md](22-staff-leave.md).
- **Approve dialog** (confirm):
  - Title "Approve this request?"; description "{kind} · asked by {name}".
  - Body: Details and Amount (bold) as a key-value list, then an info callout with what approving does:
    - Cancel a payment: "The receipt is kept but marked cancelled, and the family owes that money again."
    - Reduce a fee: "Reduces what the family owes. The original charge is untouched."
    - Cancel a balance: "Cancels what the family still owes, because it will not be paid. The original charge is untouched."
    - Refund: "Posts the refund from the money account and reduces the credit held for the student."
    - Discount: "Applies the discount to the student from the next round of charges."
    - Store write-off: "Brings store stock in line with the count and records the missing items as a loss at their average cost." (the store values stock at a moving average, [D-031](../technical-reference.md#decision-log))
    - Leave: "The staff member is marked on leave for those school days and sees your decision on their Approvals page."
    - Fallback: "Approving records you as the approver."
  - Buttons: **Cancel** (ghost), **Approve** (primary, check).
  - Toasts (success):
    - Reduce a fee, Cancel a balance, Refund: "Approved. The student’s fees have been updated." with a **Who owes** action.
    - Cancel a payment: "Approved. The payment is cancelled and the receipt is kept." with a **Payments** action.
    - Discount: "Discount approved."
    - Store write-off: "Approved. Stock now matches the count." with a **Store** action.
    - Leave: "Leave approved for {name}."
- **Decline dialog**:
  - Title "Decline this request?"; description "The request stays on record with your reason. Nothing is changed."
  - Field **Reason**: textarea, required, placeholder "The person who asked will see this".
  - Buttons: **Cancel** (ghost), **Decline** (destructive, x).
  - Toast (warning): "Declined. The request is kept with your reason." A declined cancellation returns the payment to Recorded.
- Errors on approve or decline:
  - Own request: the self-approval message (rule 6), destructive.
  - Already decided by someone else: "This has already been decided." The list refreshes.
  - Refund above the credit now held (new): "{name} now holds ₦{x} credit, less than this refund. Decline it and ask again."
- States: loading skeleton; error through `ErrorMessage`; acting read-only: rows show, no Approve or Decline (writes answer 403).

### Approvals bell (top bar)

- In the web-admin top bar on every page, for staff and for a super admin while acting in a school.
- Bell icon with a badge showing the number of items the viewer can decide, excluding their own. Tip "{n} waiting for your approval", or "Approvals" when none. Screen-reader label "Approvals".
- Popover: heading "Waiting for you" and, when any, an **Open approvals** link (ghost, extra small, arrow). Then the first five items: wallet icon, kind in medium weight, details in small muted text, amount on the right. Each opens the item's page (table above).
- Empty: "All clear", "Nothing is waiting for your approval." (check icon).

### Nav counts and dashboard

- Side nav counts (rule 14): **Approvals** shows the number the viewer can decide. Money items that live on Discounts and refunds also count on **Payments**; store write-offs count on **Store**.
- The dashboard's "Today" list shows "{n} request(s) waiting for your approval", sub-line the first two as "{kind}: {details}" joined by " · ", button **Review** to Approvals ([70-dashboard.md](70-dashboard.md), M2.6).

### Approval rules (settings)

The settings frame, route and layout are owned by [33-school-settings.md](33-school-settings.md) (M3.5); this section restates the screen for the approval behaviour it controls. Where the two differ, 33 wins on layout and route, this file on what a switch does to requests.

- Route `/settings/approvals` ([D-035](../technical-reference.md#decision-log); the prototype uses `/settings?tab=money`), web-admin Settings area, settings nav group "General", item "Approval rules" (badge-check icon), after "Admissions rules". Gate `schoolAccount:read`; switches need `schoolAccount:update` and are disabled without it.
- Header: title "Approval rules"; description "Choose which money changes need a boss to say yes first."
- Section **Requests that need approval**, description "Switched on, the request waits in Approvals until a boss says yes. Switched off, it goes through straight away. Payments received never wait." One switch each, all on by default:

  | Label                | Description                                 | Setting key    |
  | -------------------- | ------------------------------------------- | -------------- |
  | Refunds              | Paying money back to a family that overpaid | `refund`       |
  | Cancelling a balance | Giving up on money that will not be paid    | `write_off`    |
  | Reducing a fee       | Lowering what a family owes                 | `credit_note`  |
  | Discounts            | A percentage or amount off future charges   | `discount`     |
  | Cancelling a payment | Undoing a receipt that was recorded wrongly | `payment_void` |

  Toast (success): "These requests now wait for a boss to approve." when switched on; "These requests now go through straight away." when switched off.

- Section **Who can approve**, description "Nobody can approve their own request." One row: badges "Owner" and each role holding `adjustment:approve` (e.g. "Principal"); "Anyone with one of these roles can approve."; button **Change roles** (outline, arrow) to Roles, shown with `ac:read`.
- States: acting read-only renders with switches disabled.

## Business rules

1. **What waits.** An item is waiting while its record's `status` is `submitted`. Kinds: payment cancellation (request and approval both in M3.5, [D-032](../technical-reference.md#decision-log)), fee reduction, cancelled balance, refund, discount (M3.5); store write-off (M4.5); leave (M3.6).
2. **Who decides.** Money and store items need `adjustment:approve`; leave needs `leave:approve` (D-006). The owner holds both.
3. **Item campus**, for scope:
   - Fee reduction, cancelled balance, refund, discount: the student's current-term placement campus, else home campus.
   - Payment cancellation: the campuses of the payment's allocated students; visible when any is in scope (the prototype uses the money account's campus; see gaps).
   - Store write-off: the store's campus.
   - Leave: per [22-staff-leave.md](22-staff-leave.md) (the prototype uses the member's first campus).
   - An item with no campus is visible to every approver.
4. **The queue** lists waiting items in the viewer's scope that the viewer can decide; with "include others" on, it adds waiting in-scope items they can't decide, marked "Someone else".
5. **Tabs** group by pillar: Money (every money and store kind) and Leave. Tabs show only when both pillars have items.
6. **Self-approval.** Nobody approves or declines their own request. The service checks first and answers 409 "You created this. Someone else must approve it." ([D-013](../technical-reference.md#decision-log)) ([03](03-foundation-ledger-and-documents.md) rule 14; the prototype's copy also says "The database refuses approved_by = created_by"). Each table also has the checks in [03](03-foundation-ledger-and-documents.md) rule 13 on `approved_by` and `rejected_by`, so a direct write fails too.
7. **Decline needs a reason**, stored as `rejection_reason` with `rejected_by` and the time; the record stays. A declined payment cancellation sets the payment back to Recorded.
8. **Approve once.** Approve and decline update `WHERE status = 'submitted'` in the same transaction as any posting; if no row changes, the answer is 409 and nothing posts. Approving writes `approved_by` and `approved_at`.
9. **Effects on approval** are each kind's own rules: [53](53-payments.md) rules 12 to 13 (cancellation), [55](55-discounts-and-refunds.md) rules 4 to 6 and 13 (adjustments, discounts), [61-store.md](61-store.md) (write-offs), [22-staff-leave.md](22-staff-leave.md) (leave).
10. **Approval rules.** One switch per money kind (`refund`, `write_off`, `credit_note`, `discount`, `payment_void`), on by default. Store write-offs follow `write_off`. Leave approval can't be switched off. Payments themselves never wait.
11. **Switched off.** A new request of a switched-off kind is approved on creation with `approved_by` null (D-007) and posts at once. It never appears in the queue.
12. **Switching changes only new requests.** Requests already waiting stay waiting when their kind is switched off, and must still be decided ([D-027](../technical-reference.md#decision-log)).
13. **Who can approve list** shows "Owner" and every role whose permissions include `adjustment:approve`.
14. **Counts.**
    - The bell, the Approvals nav count and the dashboard task count the items the viewer can decide, excluding their own ([D-036](../technical-reference.md#decision-log)).
    - Money kinds (cancellation, reduction, cancelled balance, refund, discount) also count on the Payments nav item, and store write-offs on Store.
    - Counts refresh after any decision and on navigation; the bell also refetches every minute.
15. **Acting.** A super admin acting read-only sees the queue but every decision answers 403. With a reason they may decide; the audit log records it. They never count as the creator.
16. **Audit trail.** Every decision keeps who, when and the reason on the record itself; nothing is deleted.

## Data

No new tables. Every approvable table has one column shape ([D-025](../technical-reference.md#decision-log)): `status`, `created_by`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`, with the database checks. That covers `payment_void`, `adjustment`, `student_discount` ([finance](../brainstorming/data-model-finance.md#model)), and later `stock_count` ([inventory](../brainstorming/data-model-inventory.md); its counter is `created_by`) and `staff_leave` ([22-staff-leave.md](22-staff-leave.md); `approved_by` and `rejected_by`, not the overview's `decided_by`).

`school_setting` approval switches: [Settings](../brainstorming/data-model-finance.md#settings).

New or changed, not in the data-model docs (flagged):

- `CHECK (rejected_by <> created_by)` alongside the approved check on each approval table (rule 6).
- An index per approval table on `(organization_id, status)` where `status = 'submitted'` for the queue and counts.
- `rejected_at` on each approval table, and `staff_leave`'s `approved_by`/`rejected_by` in place of `decided_by` ([D-025](../technical-reference.md#decision-log)).

## API

Module `approvals` (read side only). Approve and decline stay with each owning module: [53](53-payments.md#api) (`/finance/payment-voids/:id/approve|decline`), [55](55-discounts-and-refunds.md#api) (`/finance/adjustments/...`, `/finance/discounts/...`), [61-store.md](61-store.md) (stock counts), [22-staff-leave.md](22-staff-leave.md) (leave). Each owning module registers a provider in `common` that returns its waiting items under its own scope rules, and the approvals module assembles the queue from them ([D-036](../technical-reference.md#decision-log)).

| Method | Path                 | Permission                     | Request                                                              | Response                                                                                                                                                                                                                                                                | Errors |
| ------ | -------------------- | ------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| GET    | `/approvals`         | signed-in member of the school | query `pillar` (`money`, `leave`), `includeOthers` (boolean), `page` | `{ items: [{ kind, id, title, amountMinor \| null, amountText \| null, createdBy: { id, name }, createdAt, campusId \| null, pillar, decide: 'yes' \| 'own' \| 'no_permission', links: { approve, decline, page } }], counts: { all, money, leave, othersCanDecide } }` | 401    |
| GET    | `/approvals/summary` | signed-in member               | —                                                                    | `{ waitingForMe, byNav: { approvals, payments, store }, preview: [first 5 items] }`                                                                                                                                                                                     | 401    |

Approval rules are read and changed through `GET` and `PATCH /school-settings` ([33](33-school-settings.md#api)); "Who can approve" comes from its `approvers`. The approve and decline routes all answer 404 (out of scope), 403 (no permission), 409 (own request, or no longer waiting), and 400 for a blank decline reason.

## Acceptance criteria

1. Given Chika's waiting void for RCT-2026-00098 and Bola's waiting balance cancellation, when the principal opens Approvals, then both rows show with Approve and Decline, and the bell shows 2.
2. Given Chika has `adjustment:approve` through a second role, when she opens Approvals, then her own void shows "Your own" with no buttons, the bell doesn't count it, and approving through the API answers 409.
3. Given the principal approves the void, then the toast reads "Approved. The payment is cancelled and the receipt is kept.", the row leaves the queue, and the bell count drops.
4. Given two approvers approve the same item at once, then one succeeds and the other gets 409 "This has already been decided." with one posting.
5. Given a decline with an empty reason, then the API answers 400 and nothing changes.
6. Given a declined void, then the payment reads Recorded and the Cancelled payments tab shows Declined with the reason.
7. Given Yemi (Ikeja bursar) holds `adjustment:approve`, when a Lekki student's refund is waiting, then it isn't in her queue, and approving it by id answers 404.
8. Given a member with neither approve permission, when they open Approvals, then they see "Ask for leave and see what the school decides." and no queue.
9. Given the owner, who decides both pillars, has money and leave items waiting, then tabs All, Money and Leave show with counts.
10. Given an approver who can't decide leave, when leave items exist on their campuses, then the switch "Include 1 that others approve" shows, and turning it on adds the row with "Someone else".
11. Given the owner switches off "Refunds", when a bursar submits a refund, then it posts at once with `approved_by` null and never appears in the queue; a refund already waiting stays waiting.
12. Given a member without `schoolAccount:update`, when they open Approval rules, then the switches are disabled and PATCH answers 403.
13. Given the principal role holds `adjustment:approve`, then "Who can approve" shows "Owner" and "Principal".
14. Given three money items waiting that the principal can decide, then the Approvals and Payments nav items each show 3.
15. Given nothing waits, then the bell popover shows "All clear" and the queue shows "Nothing waiting for you".
16. Given a super admin acting read-only, when they approve, then 403.

## Tests

- Unit: item mapping per kind (labels, details, amount text); campus resolution per kind; count roll-up to nav items; tab visibility. Web: Actions cell variants ("Someone else", "Your own", buttons); dialogs' copy per kind; bell empty state.
- Integration (`api:test-integration`):
  - Isolation: `/approvals` never returns another school's items; a campus-scoped approver doesn't get another campus's items; a void whose allocations are all on another campus is hidden.
  - Self-approval: service 409 and DB `CHECK` on approve and decline for each approval table.
  - Race: concurrent approves yield one 200 and one 409, one journal entry.
  - Switches: switched-off kinds auto-approve with `approved_by` null; switching off leaves waiting items waiting.
  - Permissions: 403 for each decision route without its permission; acting read-only 403; Approval rules PATCH needs `schoolAccount:update`.
- E2E (opt-in): bursar requests a void, principal approves from the bell, the receipt shows Cancelled; the bursar cannot approve her own request when given an approver role.

## Open decisions

| #       | Question                                                                                               | Options                                                                                                                                                                        | Recommendation                                                                                                                 | Confidence | Decided                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------- |
| OD-57-1 | How the queue reads requests owned by other modules, given modules don't import each other's internals | (a) The approvals module queries the approval tables directly (a read model over `UNION ALL`); (b) each module registers a provider in `common` that returns its waiting items | (b): keeps each table's scope rules in its own module, and leave and store plug in later without touching approvals            | Medium     | [D-036](../technical-reference.md#decision-log): one provider per module  |
| OD-57-2 | An explicit campus picker on the queue for approvers who see every campus                              | (a) None, scope only (prototype); (b) a "Campus" select, default "All campuses"                                                                                                | (b) once a school has three or more campuses; (a) for M3.5                                                                     | Low        | Adopted                                                                   |
| OD-57-3 | How counts stay fresh                                                                                  | (a) Refetch on navigation and after decisions; (b) poll every minute; (c) server push                                                                                          | (a) plus (b) for the bell                                                                                                      | Medium     | Adopted                                                                   |
| OD-57-4 | Payment cancellation item campus                                                                       | (a) The money account's campus (prototype); (b) the allocated students' campuses                                                                                               | (b): matches how the payment itself is visible; with (a) a school-wide bank account shows every cancellation to every approver | High       | Adopted                                                                   |
| OD-57-5 | Queue order                                                                                            | (a) Insertion order (prototype); (b) oldest first; (c) newest first                                                                                                            | (b): the longest-waiting request gets decided first                                                                            | Medium     | Adopted                                                                   |
| OD-57-6 | Should Approvals nav and bell count the viewer's own waiting requests                                  | (a) Nav counts them, bell doesn't (prototype); (b) neither                                                                                                                     | (b): a count of things you can't act on is noise                                                                               | High       | [D-036](../technical-reference.md#decision-log): own requests not counted |
| OD-57-7 | Tell the requester about a decision                                                                    | (a) Only on the record and lists; (b) an in-app notice on their next visit                                                                                                     | (a) for M3.5; notifications are out of scope in the overview's assumptions                                                     | Medium     | Adopted                                                                   |

## Prototype gaps noticed

- Auto-approved requests (approval switched off) record the current user as approver, against D-007.
- The self-approval message mentions the database and a column name.
- The Approvals nav count includes the viewer's own requests, while the bell and dashboard don't.
- A payment cancellation's campus comes from the money account, not the allocated students.
- The "Include {n} others approve" switch label is ungrammatical.
- Queue order is insertion order across kinds, not by age.
- There is no handling for a request decided by someone else while the dialog is open.
- Declined requests show "Rejected" elsewhere while this page says "Decline".
- Approval rules has no switch for leave; the build keeps leave approval always on (rule 10), which should be stated on the page.
- Store write-off items take their summary and loss from store helpers specified in [61-store.md](61-store.md).

## Dependencies

- M1.1 permissions: `adjustment:approve`, `leave:approve`, `schoolAccount:read/update`, and a signed-in-member guard with no permission for `/approvals`.
- M2.2 `school_setting` for the approval switches.
- M3.5 money kinds ([53](53-payments.md), [55](55-discounts-and-refunds.md)); payment-cancellation requests ship here with their approval ([D-032](../technical-reference.md#decision-log)), on M3.4's payments.
- M3.6 leave ([22-staff-leave.md](22-staff-leave.md)) and M4.5 stock counts add their kinds later through the same provider shape ([D-036](../technical-reference.md#decision-log)).
- M2.6 dashboard shows the waiting-for-you task.

# PRD: Staff leave

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M3.6` (see [roadmap](README.md))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md#foundation-model) (`staff_leave`, `school_holiday`, Still open), [permission list](../brainstorming/data-model-overview.md#permission-list) (`leave:approve`), [20-staff-and-members.md](20-staff-and-members.md), [21-roles-and-permissions.md](21-roles-and-permissions.md), [57-approvals.md](57-approvals.md) (M3.5 queue), [technical reference](../technical-reference.md) decisions `D-006`, `D-010`, `D-013`, `D-025`, `D-036`, `D-039`

## Summary

Staff ask for days off from the Approvals page: a type, the dates, a reason and who covers their classes. Someone holding `leave:approve` (the owner and the ready-made Principal role by default, per [D-006](../technical-reference.md#decision-log) and [D-010](../technical-reference.md#decision-log)) approves or declines it from the same queue that holds money corrections, and nobody decides their own request. The requester sees each decision, the days they have taken this school year and the school's holidays.

## Who uses it

| Persona (seed)                                                          | Permission(s)            | What they can do here                                             |
| ----------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| Any staff member (teacher, bursar, administrator, member with no roles) | none needed (LV-1)       | Request leave, see and withdraw their own requests                |
| Owner (Funmi Adeyemi)                                                   | `leave:approve` (all)    | Approve or decline others' leave; cannot decide their own         |
| Principal (Grace Nwosu)                                                 | `leave:approve`          | Approve or decline others' leave in campus scope; request her own |
| Bursar (Chika Eze)                                                      | `adjustment:create` only | Sees the leave-only Approvals page                                |
| Student, guardian                                                       | portal only              | No access (web-portal users)                                      |
| Super admin acting read-only                                            | every `read`             | Sees the queue; Approve, Decline and Request hidden               |

Scopes: a leave request is visible to an approver when the requester shares at least one campus with the approver's campus scope (LV-3). The requester always sees their own. Another school's request, or one outside campus scope, answers 404. A staff member without `leave:approve` calling an approver endpoint gets 403 [tenancy-001].

## Screens

### Approvals (leave parts)

- **Route:** `/approvals` in `web-admin`. Nav section **Overview**, second item (after Dashboard, before Announcements). Phase `F1`. Gate: none (every signed-in staff member); the API refuses portal-only members.
- **Nav count:** a count badge on the Approvals link with the number of waiting requests the viewer can decide, excluding the viewer's own requests ([D-036](../technical-reference.md#decision-log); the prototype includes them, see gaps).
- The queue table, tabs, the "Include {n} others approve" switch and the money rows are shared with [57-approvals.md](57-approvals.md). This PRD owns the leave rows, the leave dialogs and the leave-only page. Shared copy is quoted once here so the two PRDs agree.

#### A. Viewer without `leave:approve` and without `adjustment:approve`

- **Header:** title "Approvals", description "Ask for leave and see what the school decides.", action **Request leave** (primary, icon plus).
- **Stat row** (three tiles):
  - "Days taken": the number; sub "Approved leave in {school year}" (e.g. "Approved leave in 2026/2027").
  - "Waiting": the count; sub "Oldest sent {date}" or "Nothing waiting".
  - "Next time off": the first day of the next approved leave that hasn't ended, or "—"; sub "{type} · {n} day(s)" or "No approved leave ahead".
- **Left: card "My requests"** (icon calendar-days, no header action), the request list below.
- **Right: card "School holidays"** (icon calendar), description "No need to request leave on these days." A scrolling list of upcoming holidays and term breaks from [M2.1]: date tile (month, day), name, and "{Mon} – {Tue} · no school" (or "{Mon} · no school") for a holiday or "School resumes {date}" for a break, plus "Today", "Tomorrow", "in {n} days", "in {n} weeks" or "in {n} months". Empty: "No holidays ahead".

#### B. Viewer with `leave:approve` or `adjustment:approve`

- **Header (shared):** title "Approvals", description "Requests waiting for you to approve: money corrections and staff leave.", info tip "Staff ask, a boss approves. You can’t approve your own request." No header action.
- **Tabs (shared):** "All {n}", then "Money {n}" and "Leave {n}" for kinds present; tabs show only when more than one kind is present.
- **Switch (shared):** "Include {n} others approve", shown when there are requests the viewer can't decide; it adds them to the table.
- **Table (shared columns), leave row content:**

  | Column    | Leave row                                                                                                             |
  | --------- | --------------------------------------------------------------------------------------------------------------------- |
  | Request   | Icon calendar-days, "Leave"                                                                                           |
  | Details   | "{requester} · {type} · {range}. {reason}" (range is "7 Oct 2026" for one day, "12 Oct 2026 – 13 Oct 2026" otherwise) |
  | Amount    | "**{n} day(s)**"                                                                                                      |
  | Asked by  | Avatar and requester name                                                                                             |
  | (actions) | See below                                                                                                             |

  Action cell:
  - Viewer lacks `leave:approve`: outline badge "Someone else", tooltip "Someone with leave approval decides." (LV-7).
  - Viewer's own request: warning badge "Your own", tooltip "You asked for this. Someone else must decide." (LV-7).
  - Otherwise: **Approve** (primary, small, icon check) and **Decline** (ghost, small, icon x).

- **Empty (shared):** icon check-check, "Nothing waiting for you", "When staff ask for leave, or to refund, discount, write off or void a payment, the request appears here."
- **Below the table: card "My leave"** (icon calendar-days), with header action **Request leave** (small, primary). Summary figures: "{n} days taken this year", "{n} waiting for a decision", "{n} requests in total". Then the request list. The prototype hides this card from owners; the build shows it to everyone (LV-6).

#### Request list (both views)

- Sorted by first day, latest first.
- Row: icon tinted by status; type; status badge; "{range} · {n} school day(s)"; the reason (muted); then:
  - approved: "Approved by {name} on {date}";
  - declined: "Declined by {name}: {reason}" (destructive);
  - waiting: a **Withdraw** button (ghost, small).
- Status badges: "Waiting" (secondary, icon clock) for submitted; "Approved" (success, icon check); "Declined" (destructive); "Withdrawn" (outline) for cancelled.
- Empty: icon calendar-days, "No leave requests yet", "Ask for time off here. Someone with leave approval decides." (LV-7).
- **No other approver** (LV-9): when nobody in the school other than the requester holds `leave:approve`, the card shows an info callout "Nobody else can approve leave yet. Ask the owner to give someone leave approval." Requests are still accepted and wait.
- **Withdraw:** no confirmation; toast "Request withdrawn." (success).

#### Request leave dialog

- Opened by either **Request leave** button.
- Title "Request leave" (icon calendar-days). Description "Someone with leave approval decides. You’ll see the decision here." (LV-7).
- Fields:

  | Label                             | Control                                                                                     | Required | Default                                | Validation (message)                                                                  |
  | --------------------------------- | ------------------------------------------------------------------------------------------- | -------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
  | Type of leave                     | select: Annual leave, Sick leave, Personal leave, Study leave, Maternity or paternity leave | yes      | Annual leave                           | one of the five                                                                       |
  | First day                         | date, min today                                                                             | yes      | empty                                  | "Choose the first day of leave."; before today is refused (data model)                |
  | Last day                          | date, min today                                                                             | no       | empty; hint "Leave empty for one day." | "The last day can’t be before the first day." The build sets its min to the first day |
  | Reason                            | textarea, placeholder "e.g. Doctor’s appointment"                                           | yes      | empty                                  | non-empty after trim, at most 500 characters ("Give a reason.", new)                  |
  | Cover for your classes (optional) | text, placeholder "e.g. Ayo Bassey will take JSS 2 Mathematics"                             | no       | empty                                  | at most 200 characters                                                                |

- Whole-form check: at least one counted day (weekdays minus school holidays, [D-039](../technical-reference.md#decision-log)), else "Those dates are school holidays or a weekend. Choose at least one school day."
- Buttons: **Cancel** (ghost), **Send request** (primary, icon send).
- On success: toast "Leave request sent: {n} school day(s). Someone with leave approval will decide." (LV-7) and the request appears as Waiting.
- An overlap with the requester's own waiting or approved leave answers 409 and shows "You already asked for leave on some of these days." under the dates (LV-8).

#### Approve dialog (leave)

- Title "Approve this request?". Description "Leave · asked by {name}".
- Key–value: Details (as in the table), Amount "**{n} days**".
- Info callout: "The staff member is marked on leave for those school days and sees your decision on their Approvals page."
- Buttons: **Cancel** (ghost), **Approve** (primary, icon check, gate `leave:approve`).
- On success: toast "Leave approved for {name}." Refusal toasts carry the server message (own request; already decided).

#### Decline dialog (shared with money requests)

- Title "Decline this request?" (icon circle-x). Description "The request stays on record with your reason. Nothing is changed."
- Field **Reason**: textarea, required, placeholder "The person who asked will see this".
- Buttons: **Cancel** (ghost), **Decline** (destructive, icon x).
- On success: warning toast "Declined. The request is kept with your reason." Without the permission: "You can’t decide leave requests." (the prototype's "You need leave:approve." is not used).

#### States

- Loading: skeleton stats and rows. Error: `ErrorMessage`.
- Acting super admin, read-only: queue visible; Approve, Decline, Request leave and Withdraw hidden.
- A request decided by someone else while the dialog is open: 409, toast "Someone has already decided this request." and the row refreshes.

### Where leave shows elsewhere

- **Dashboard › Needs you today** ([M2.6]): for anyone who can decide at least one waiting request (own excluded): "{n} request(s) waiting for your approval", sub with the first two "{kind}: {details}" joined by " · ", button **Review** to Approvals. Leave items count here.
- **Top bar bell** (shared with M3.5): tooltip "{n} waiting for your approval" or "Approvals"; popover "Waiting for you" with up to five items (kind, details, amount) and **Open approvals**; empty "All clear", "Nothing is waiting for your approval." Own requests excluded.
- **Recent activity** ([M2.6]): "{name} asked for {type, lower case}: {range}.", "{name}’s {type, lower case} ({range}) was approved.", "A request was declined: {reason}".
- **Member page** ([20](20-staff-and-members.md)), for `leave:approve` holders: a "Leave" card listing the member's requests (type, dates, days, status; no reasons) (LV-4).
- **Staff and members list:** an "On leave" badge (secondary) beside the name on each day of approved leave (LV-4). This is what "marked on leave" in the approve dialog means.

## Business rules

1. Any staff member of the active school may request leave for themselves (LV-1). Portal-only members (roles only `member`, `student`, `guardian`) are refused (403).
2. Type is one of `annual`, `sick`, `personal`, `study`, `parental`, shown as "Annual leave", "Sick leave", "Personal leave", "Study leave", "Maternity or paternity leave".
3. The first day is today or later; the last day defaults to the first day and is not before it; reason is required; cover is optional.
4. **Days** = the weekdays from first to last day inclusive (`leaveDays`), minus `school_holiday` days ([D-039](../technical-reference.md#decision-log)). Term breaks still count. A request must count at least one day.
5. A request starts `submitted`. Only its requester may withdraw it, and only while `submitted` (status `cancelled`, shown "Withdrawn"). Withdrawing someone else's request answers 404.
6. Approving or declining needs `leave:approve` (D-006) and a `submitted` request in the approver's scope (LV-3).
7. **No self-decision.** The requester can never approve or decline their own request. The service checks first and answers 409 `SelfApproval`; the database checks `approved_by <> created_by` and `rejected_by <> created_by` ([D-025](../technical-reference.md#decision-log)), and `ErrorFilter` maps their violation (`23514`) to the same 409 ([D-013](../technical-reference.md#decision-log)).
8. Declining needs a reason, which the requester sees.
9. A decision is final: an approved or declined request can't be changed or withdrawn (LV-5).
10. Two approvers deciding at once: the second gets 409 (conditional update on `status = 'submitted'`).
11. **Days taken this year** = the sum of days of the requester's approved leave whose first day is on or after the current school year's start.
12. **Next time off** = the earliest approved leave whose last day is today or later.
13. Requests are never deleted.
14. A request may not overlap the requester's own `submitted` or `approved` leave: 409 "You already asked for leave on some of these days." ([D-039](../technical-reference.md#decision-log)).
15. A request is accepted even when nobody else holds `leave:approve`; it waits until someone does (LV-9).

## Data

- `staff_leave`: `id`, `organization_id`, `type`, `starts_on`, `ends_on`, `reason`, `cover`, `status` (`submitted`, `approved`, `rejected`, `cancelled`), and the shared approval columns `created_by` (the requester), `created_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason` ([D-025](../technical-reference.md#decision-log)), plus `updated_at`. This replaces the overview's [Foundation model](../brainstorming/data-model-overview.md#foundation-model) columns `user_id`, `decided_by` and `decided_at`; the overview should be amended.
- Constraints this module adds:
  - `CHECK (ends_on >= starts_on)`.
  - `CHECK (type IN ('annual','sick','personal','study','parental'))`; the doc names the types but not the stored keys.
  - `CHECK (approved_by IS NULL OR approved_by <> created_by)` and `CHECK (rejected_by IS NULL OR rejected_by <> created_by)`, the approval rule every approvable table carries.
  - `CHECK ((status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))`.
  - `CHECK ((status = 'rejected') = (rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND rejection_reason IS NOT NULL))`.
  - FKs: `created_by`, `approved_by` and `rejected_by` to `user.id` with `ON DELETE RESTRICT`, so a removed member's history keeps their name; `organization_id` to `organization`.
  - Index `(organization_id, status)` for the queue and `(organization_id, created_by, starts_on)` for "my leave".
- The prototype stores a declined request's decider as `rejectedBy` with no date; the build records `rejected_by` and `rejected_at`, and `approved_by` and `approved_at` for approvals.
- No campus column: scope comes from the requester's `teamMember` rows (LV-3).
- Reads `school_holiday`, `academic_session` and `term` from M2.1.
- Migration: one dbmate migration creating `staff_leave`. `leave:approve` joins `libs/policy` in this slice and is added to the Principal starter role ([D-010](../technical-reference.md#decision-log)); the same migration adds it to each existing school's Principal role that the school hasn't edited ([21](21-roles-and-permissions.md), RP-11).

## API

`leave` module. Contract types in `@eduvault/api-contract` (`contract.leave`). `LeaveDto = { id, createdBy, requesterName, type, startsOn, endsOn, days, reason, cover, status, approvedBy, approvedAt, rejectedBy, rejectedAt, deciderName, rejectionReason, createdAt }`.

| Method | Path                  | Permission                        | Request                                       | Response                                                                                                                              | Errors                                                                                         |
| ------ | --------------------- | --------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/me/leave`           | staff member of the active school | —                                             | `{ items: LeaveDto[], daysTakenThisYear, waiting, oldestWaitingSentOn, nextTimeOff: LeaveDto \| null, otherApproverExists: boolean }` | 403 portal-only                                                                                |
| POST   | `/leave`              | staff member of the active school | `{ type, startsOn, endsOn?, reason, cover? }` | `LeaveDto`                                                                                                                            | 400 invalid, past start, end before start, no counted day; 403 portal-only; 409 overlap (LV-8) |
| POST   | `/leave/:id/withdraw` | requester only                    | —                                             | `LeaveDto`                                                                                                                            | 404 not theirs or another school; 409 not `submitted`                                          |
| GET    | `/leave`              | `leave:approve`                   | query `status?` (default `submitted`)         | `LeaveDto[]` in scope, own included with `isOwn: true`                                                                                | 403                                                                                            |
| POST   | `/leave/:id/approve`  | `leave:approve`                   | —                                             | `LeaveDto`                                                                                                                            | 403; 404 out of scope or another school; 409 `SelfApproval` (own request), or not `submitted`  |
| POST   | `/leave/:id/decline`  | `leave:approve`                   | `{ reason }`                                  | `LeaveDto`                                                                                                                            | 400 empty reason; 403; 404; 409 `SelfApproval` (own), or not `submitted`                       |

- The leave module registers its provider with the M3.5 Approvals queue ([D-036](../technical-reference.md#decision-log)); `GET /approvals` lists leave rows from it with `kind: 'leave'`, `amountText: '{n} days'`, `askedBy`, `canDecide` and `isOwn`. Counts and the bell leave out the viewer's own requests.
- "Staff member" endpoints use `@OrganizationAuth()` with no permission plus a portal-only check in the service (LV-1).
- The service pre-checks self-decision; the `23514` → 409 mapping in `ErrorFilter` (from M1.1, [D-013](../technical-reference.md#decision-log)) is the backstop.

## Acceptance criteria

1. **Request.** Given Emeka (teacher), when he asks for Annual leave on Thursday 22 October 2026 with a reason (no other leave on that day), then the toast reads "Leave request sent: 1 school day. Someone with leave approval will decide." and the request shows "Waiting".
2. **Weekend or holiday only.** Given a request for Saturday and Sunday, or for weekdays that are all school holidays, then it is refused with "Those dates are school holidays or a weekend. Choose at least one school day."; given a week that includes one school holiday, then it counts 4 days.
3. **End before start.** Given a last day before the first, then "The last day can’t be before the first day." and 400 from the API.
4. **Past start.** Given a first day before today, then the API answers 400.
5. **Withdraw.** Given Emeka's waiting request, when he withdraws it, then it shows "Withdrawn" and leaves the approvers' queue; withdrawing it again answers 409; Chika withdrawing it answers 404.
6. **Approve.** Given Ayo's sick-leave request (12–13 Oct), when Funmi approves it, then the toast reads "Leave approved for Ayo Bassey.", Ayo's list shows "Approved by Funmi Adeyemi on {today}", and "Days taken" includes 2.
7. **Decline.** Given Emeka's waiting personal-leave request for 20 October, when Funmi declines it with a reason, then Emeka sees "Declined by Funmi Adeyemi: {reason}" and an empty reason answers 400.
8. **No self-decision.** Given Grace (principal) requested leave, then her row shows "Your own" with no buttons, and `POST /leave/{id}/approve` as Grace answers 409 `SelfApproval`; a row updated directly with `approved_by = created_by` is refused by the database and the filter maps it to 409.
9. **Permission.** Given Chika (no `leave:approve`), then she sees the leave-only Approvals page and `GET /leave` answers 403.
10. **Scope.** Given a principal role without `campus:readAll` on Lekki only, then Ikeja-only staff's requests are absent from her queue and approving one answers 404.
11. **Race.** Given two approvers open the same request, when both approve, then the second gets 409 and the toast "Someone has already decided this request."
12. **Isolation.** Given a request in another school, then every leave endpoint answers 404 for it.
13. **Dashboard.** Given two waiting requests by others, then Funmi's "Needs you today" shows "2 requests waiting for your approval" with **Review**.
14. **Removed member.** Given Ayo had approved leave and is removed from the school, then the decision still shows his name and Funmi's.
15. **Overlap.** Given Emeka's waiting request for 22 October, when he asks again for 21–23 October, then 409 "You already asked for leave on some of these days."
16. **No other approver.** Given the owner is the only `leave:approve` holder, when she requests leave, then it is accepted and her My leave card shows "Nobody else can approve leave yet. Ask the owner to give someone leave approval."

## Tests

- **Unit (`nx run policy:test` or `shared`)**: `leaveDays` across weekends, single days and school holidays; "days taken this year" and "next time off".
- **Unit (`nx run web-admin:test`)**: leave-only page vs approver view by permission; "Your own" and "Someone else" cells; dialog validation messages; Withdraw only on waiting rows; My leave card for every staff member.
- **Integration (`nx run api:test-integration`)**
  - Isolation: each route against another school's request answers 404; `staff_leave` rows never leak across schools [tenancy-002].
  - Campus scope for approvers (LV-3).
  - Self-decision refused by the service (409 `SelfApproval`) and by the `CHECK` (direct update, mapped to 409).
  - Status transitions: withdraw, approve, decline only from `submitted`; concurrent approve gives one 200 and one 409.
  - Portal-only member gets 403 on `POST /leave`.
  - Overlap refused (LV-8).
- **E2E (opt-in, `eduvault-e2e`)**: teacher persona requests leave; owner approves it from Approvals; teacher sees "Approved by …"; owner cannot act on a request they made.

## Open decisions

| #    | Question                                                                                                                                                                                                                                       | Recommendation                                                                                                                                                                                                             | Confidence                                                                                                                 | Decided                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| LV-1 | Who may request leave? Options: any staff member, no permission; a new `leave:request` permission in staff starter roles.                                                                                                                      | Any member who isn't portal-only, no permission, including members with no roles yet.                                                                                                                                      | Low: "a member with no roles can do nothing" argues for a permission, but leave is about the person, not the school's data | Adopted                                                                                                                                |
| LV-2 | Do leave days subtract school holidays? (data-model overview, Still open)                                                                                                                                                                      | Yes: count weekdays minus `school_holiday` days; a request that only covers holidays is refused like a weekend ("Those dates are school holidays or a weekend. Choose at least one school day."). Term breaks still count. | Medium: the UI already says "school days" and lists holidays beside the form                                               | [D-039](../technical-reference.md#decision-log): holidays subtracted                                                                   |
| LV-3 | Which approvers see a request? The prototype uses only the requester's first campus. Options: school-wide for every `leave:approve` holder; any overlap between the requester's campuses and the approver's scope.                             | Overlap with the approver's campus scope (all for `campus:readAll`).                                                                                                                                                       | Medium: consistent with tenancy; school-wide is simpler if schools only ever have one approver                             | Adopted                                                                                                                                |
| LV-4 | Show who is on leave? The approve dialog promises "marked on leave" but nothing shows it. Options: nothing in M3.6; a "Leave" card on the member page for `leave:approve` holders; plus an "On leave" badge on the members list and dashboard. | M3.6: a "Leave" card on the member page (type, dates, days, status; no reasons) for `leave:approve` holders, and an "On leave" badge on the members list on approved days. Reword the dialog if this is cut.               | Low                                                                                                                        | Adopted                                                                                                                                |
| LV-5 | Can approved leave that hasn't started be cancelled?                                                                                                                                                                                           | Not in M3.6; the requester asks an approver, who records it later through a "Cancel leave" action (new status `cancelled` with `decided_by`).                                                                              | Medium                                                                                                                     | Adopted; the later "Cancel leave" records its decider in the [D-025](../technical-reference.md#decision-log) columns, not `decided_by` |
| LV-6 | Can the owner request leave? The prototype hides "My leave" from owners.                                                                                                                                                                       | Yes: show My leave to every staff member; an owner's request needs another `leave:approve` holder.                                                                                                                         | Medium                                                                                                                     | Adopted                                                                                                                                |
| LV-7 | The copy says "The owner or principal approves it/decides leave" in five places, which D-006 made untrue for a school that delegates `leave:approve`.                                                                                          | Replace with "Someone with leave approval decides." (and "Your own": "You asked for this. Someone else must decide.").                                                                                                     | High: D-006 made it a permission                                                                                           | Adopted                                                                                                                                |
| LV-8 | May a request overlap the requester's own waiting or approved leave?                                                                                                                                                                           | No: 409 "You already asked for leave on some of these days."                                                                                                                                                               | Medium                                                                                                                     | [D-039](../technical-reference.md#decision-log): overlapping requests refused (409)                                                    |
| LV-9 | What if nobody else in the school holds `leave:approve`?                                                                                                                                                                                       | Accept the request, and show the requester "Nobody else can approve leave yet. Ask the owner to give someone leave approval."                                                                                              | Low                                                                                                                        | Adopted                                                                                                                                |

## Prototype gaps noticed

- Nothing shows who is on leave, despite the approve dialog's promise (LV-4).
- Owners never see "My leave" (LV-6).
- Leave items are scoped by the requester's first campus only (LV-3).
- The Approvals nav count includes the viewer's own requests; the bell and dashboard exclude them.
- The "Last day" input's minimum is today, not the first day.
- A declined request records `rejectedBy` but no decision date.
- Days don't subtract holidays even though the page lists them beside the form (LV-2).
- No overlap check (LV-8).
- Copy names "the owner or principal" (LV-7); the self-approval tooltip and the "You need leave:approve." toast show internal wording.
- Type is stored as its display string; the build stores a key.

## Dependencies

- **M1.1** (guard, `/me/permissions`, the ready-made Principal role, [D-010](../technical-reference.md#decision-log)) and **M1.3** (members and campuses). `leave:approve` itself joins the permission list in this slice.
- **M2.1** for school years, terms and holidays ("days taken this year", the holiday list, LV-2).
- **M3.5** for the shared Approvals queue frame; leave plugs in as one more provider ([D-036](../technical-reference.md#decision-log)).
- **M2.6** for the dashboard task and activity feed.

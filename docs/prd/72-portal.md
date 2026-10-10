# PRD: Student and guardian portal

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53` (script lines 4280–4387, shell 641–662, statement 3564–3593, scopes 186–190)
- Milestone and slice: `M2.8` (shell, Home, My children), `M3.7` (Fees, family statement), `M4.4` (Purchases and the price list) (see [roadmap](README.md))
- Related: [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) phase 4a and its [web-portal folder structure](../brainstorming/permissions-and-custom-roles.md#appsweb-portal-students-and-guardians), [data-model-overview.md](../brainstorming/data-model-overview.md#foundation-model) (`guardian`, `guardian_student`, `student.user_id`), [data-model-finance.md](../brainstorming/data-model-finance.md#reports-all-derived) (student and family statements), [data-model-inventory.md](../brainstorming/data-model-inventory.md#sales-to-students) (store sales, portal Purchases), [71-announcements](71-announcements.md), [70-dashboard](70-dashboard.md) (term and holiday rules), [technical reference](../technical-reference.md) decisions [D-001, D-002, D-008, D-009, D-015, D-019, D-030, D-038](../technical-reference.md#decision-log)

## Summary

`web-portal` is where students and guardians sign in to see their own school records. A student sees their own; a guardian sees each linked child and switches between them. M2.8 gives them a home page (term, holidays, announcements, class teacher, profile) and, for guardians, a My children overview. M3.7 adds fees and the family statement, and M4.4 adds store purchases and the store price list. The portal is read-only: families can't change anything here. Where this differs from the permissions doc's phase 4a plan, and what happens to the existing `apps/web-portal/src` files, is listed at the end of [Prototype gaps noticed](#prototype-gaps-noticed).

## Who uses it

| Persona (seed)                                                         | Permission(s) (`student`/`guardian` starter roles)                         | What they can do here                                                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Student (Ada Okeke, `greenfield-0123`)                                 | `student:readOwn`, `feeLine:readOwn`, `invoice:readOwn`, `payment:readOwn` | Home, Fees, Purchases for herself                                                                                                 |
| Guardian (Ngozi Okeke, mother and fee payer of Ada, Chidi and Kelechi) | same four                                                                  | My children, then Home, Fees and Purchases for whichever child is selected; the family statement                                  |
| Guardian who doesn't pay (Ifeanyi Okeke, Ada's father)                 | same four                                                                  | Same pages for Ada, fees and purchases included ([D-030](../technical-reference.md#decision-log))                                 |
| Staff                                                                  | none of the `readOwn` permissions                                          | No portal access; staff use `web-admin`; the portal shows the staff screen of shell decision S-13 and portal endpoints answer 403 |

Scopes: **student scope** on `OrgContext`. A student's scope is their own student id; a guardian's is every student linked to them through `guardian_student`. Every portal endpoint filters by it. A student id outside scope answers 404; in scope without the permission answers 403 [tenancy-001]. Campus and class scope do not apply in the portal.

## Screens

### Portal shell (M2.8)

The shell chrome (top bar, user menu, top and bottom nav, default page, staff-on-portal screen) is specified in [10-app-shell-and-navigation](10-app-shell-and-navigation.md#web-portal-shell-students-and-guardians); M2.8 builds it. This module owns the pages and the child switcher's behaviour:

- Nav items and their slices: My children (`/children`, guardians only) and Home (`/`) in M2.8, Fees (`/fees`) in M3.7, Purchases (`/purchases`) in M4.4. Gates as in the shell PRD's table.
- **Child switcher** (guardians only): a group labelled "Viewing child" of chips, one per linked child, each with an avatar and the child's first name; the selected chip is pressed. Desktop: in the top bar. Phones: above the page content, scrolling sideways, and hidden on My children. Choosing a chip changes the child for Home, Fees and Purchases and keeps the current page.
- The selected child defaults to the first linked child and is carried in a `child` search param (shell decision S-15). An id that isn't linked falls back to the first child; the API re-checks scope.
- Sign-in, first-password change and the "not in a school" screen belong to M1.2 ([11-sign-in-and-setup](11-sign-in-and-setup.md)).

### My children (M2.8, statement part M3.7)

- Route `/children`; nav section Portal, first item (guardians only); phase P4a; gate `student:readOwn`. A student who opens it is redirected to Home.
- Header (portal style, no breadcrumb): "Hello, {guardian first name}"; description "{n} children at {school name}. Here is what each one owes." (singular "child" when one; see gaps).
- **Child cards** (three per row on desktop, one on phones), one per linked child:
  - Large avatar, full name, "{class} · {campus}" (or "—" when not placed this term).
  - Row "School fees": "{amount} owed" in the destructive colour when the balance is above zero; "{amount} in credit" in the credit colour when below zero; otherwise a success badge "Paid up" with a check ([D-038](../technical-reference.md#decision-log)).
  - Button "See fees" (primary, small): selects the child and opens Fees.
  - The fee row is shown only with `invoice:readOwn`. Every linked guardian sees it, whether or not they pay ([D-030](../technical-reference.md#decision-log)).
- A guardian with no linked children sees an empty state "No children linked" with the text "Your login still works. Ask the school office to link your children." (new copy). It is rare: removing a guardian's last link also removes their membership of the school ([42-guardians](42-guardians.md) GUA-7).
- **Family statement** (M3.7, shown only with `invoice:readOwn`; it covers every linked child, whoever pays):
  - Heading "Family statement" with "Total owed **{amount}**" at right, where the amount is the sum of positive balances; a child's credit never offsets another child's debt ([D-038](../technical-reference.md#decision-log)).
  - With more than one child: a row of stat tiles, one per child (name, balance, class), then "Family total" (users icon) with "Owed across all children" or "Nothing owed".
  - Then one statement card per child (below).

### Home (M2.8)

- Route `/`; nav section Portal, second item for guardians, first for students; phase P4a; gate `student:readOwn`. Shows the selected child (guardian) or the student.
- **Hero**: large avatar; small line "{greeting}, {student first name}" for a student or "{greeting}, {guardian first name} · viewing" for a guardian (greeting by the school's local time, as on the staff dashboard); heading = student's full name; line "{class} · {campus} campus". Facts row: "**{term name}** {session name}", "Week **{w}** of {weeks}", "Ends **{term end date}**". A progress bar of school days done. Term and week rules as in [70-dashboard](70-dashboard.md) R1–R3.
- **Tiles** (four on desktop, two per row on phones):

  | Tile          | Gate              | Value                                                                         | Sub-line                                         | Opens |
  | ------------- | ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ----- |
  | Fees          | `invoice:readOwn` | "{amount}" when owing, otherwise "Paid up"                                    | "Owed", "{amount} paid ahead", or "Nothing owed" | Fees  |
  | Next holiday  | —                 | "Today", "Tomorrow", "{n} days", or "—"                                       | "{name} · {date}" or "None this term"            | —     |
  | Announcements | —                 | count of items for this student published in the last 7 days                  | "New this week"                                  | —     |
  | Class teacher | —                 | lead class teacher's name this session (else the first class teacher), or "—" | class name                                       | —     |

  The Fees tile uses the destructive tone when owing and the success tone otherwise.

- **Two columns** (stacked on phones):
  - Left: **Announcements** card, specified in [71-announcements](71-announcements.md#announcements-on-the-portal-display).
  - Right: **Upcoming holidays** card (icon calendar), next four entries with the portal sub-lines "School resumes {date}" (break) and "{Dow} – {Dow} · no school" or "{Dow} · no school" (holiday), relative times as on the dashboard; empty state "No holidays ahead". Then **Profile** card (icon user), collapsible, closed by default:

    | Row                       | Value                                                              |
    | ------------------------- | ------------------------------------------------------------------ |
    | Admission no.             | the admission number with the school prefix, monospace (`GF-0123`) |
    | Class teacher             | name or "—"                                                        |
    | Date of birth             | date                                                               |
    | Username (student)        | the student's username, monospace (`greenfield-0123`)              |
    | Signed in with (guardian) | the guardian's email, or their username when they have no email    |

### Fees (M3.7)

- Route `/fees`; nav section Portal, after Home; phase P4a; gate `invoice:readOwn`.
- Header "Fees"; description "{student full name} · {term name} {session name}".
- One stat (half width on desktop), icon receipt: label "Owing" when the balance is above zero, otherwise "School fees"; value the amount owed or "Paid up"; sub-line "Still to pay" (owing), "{amount} extra" (credit), or "Nothing owed".
- Heading "Statement", then the child's statement card.

### Statement card (shared by Fees and the family statement, M3.7)

The portal variant of the finance statement (same component as staff Who owes, in portal mode):

- Header: avatar, full name, "{admission no.} · {class} · {campus}", plus " · archived" when the student has left or graduated.
- Money tiles: "Owing" (or "Extra paid" when in credit) with the amount or "Nothing"; "Paid"; "Reduced" (only when there were reductions); "Total" charged.
- When in credit, an info callout: "{amount} was paid in extra. It is taken off the next fees automatically." No refund button.
- Table: Date | What | Status | Amount. "What" describes the entry without internal journal references, for example "Term fees, First term, 2026/2027", "Payment RCT-2026-00088 from Ngozi Okeke (Bank transfer)", "Store purchase: {items}". Status badge: "Charged" (destructive), "Paid" (success, for payments), "Reduced" (success, for reductions). Ten rows per page with the shared pager.
- Footer row: "Owing now", "Extra paid" or "Nothing owing" with the amount.
- Footer line when charges are unpaid: "Unpaid charges, oldest first" followed by badges "{charge number} {outstanding}".
- Empty: "No entries yet".

### Purchases (M4.4)

- Route `/purchases`; nav section Portal, last item; phase P4a; gate `invoice:readOwn`.
- Header "Purchases"; description "Books, uniforms and other items bought for {student first name} at the school store".
- Three stats:

  | Label           | Value                               | Sub-line                                        |
  | --------------- | ----------------------------------- | ----------------------------------------------- |
  | Spent this term | sum of this term's purchases        | "{n} purchase(s) in {term name, lower case}"    |
  | Items bought    | total quantity across all purchases | "Books and uniforms"                            |
  | Last purchase   | date of the latest purchase, or "—" | "{total} · paid at the store", or "Nothing yet" |

- Heading "Purchase history", then one card per store sale, newest first:
  - Title: cart icon and the sale date. Description "{campus} campus store · receipt {receipt number}".
  - Badge "Paid by {method}" (success, check), where method is "POS", "cash" or "bank transfer".
  - Table: Item | Qty | Price | Amount; footer "Total" with the sale total. Prices are those frozen on the sale.
- Empty state (in a card): icon cart, "No purchases yet", "Books and uniforms bought at the school store show up here with their receipts."
- **Store price list** card (icon tags), description "Paid at the store by {methods}. Store items are not added to school fees.", where `{methods}` lists the ways to pay switched on in Payment rules (`/settings/payment-rules`; behaviour in [53-payments](53-payments.md)), for example "cash, POS or bank transfer":
  - "Books for {level}": one tile per book for the student's current level: book icon, name, level name, price. A muted "Out of stock" badge when the student's campus store has none.
  - "Uniforms": one tile per uniform name: tag icon, name, "Sizes {8, 10, 12, 14}" or "One size", and the price or "{lowest} – {highest}". "Out of stock" when no size is in stock at the student's campus store.
  - When neither: "No items listed".

### States (all portal pages)

- Loading: page skeleton under the shell.
- Error: `ErrorMessage` in the page body.
- Denied (403): nav item hidden; a direct visit redirects to Home (or, if Home is denied too, to a "Your account can’t see anything here yet. Ask the school office." page; new copy).
- Not found (404): a child id outside student scope in the URL falls back to the first linked child (UI) and the API answers 404.
- Read-only: everything in the portal is read-only. Acting super admins don't use the portal.

## Business rules

1. **R1** A user is a portal **student** when a `student` row in the active school has `user_id` = the user; a portal **guardian** when a `guardian` row has `user_id` = the user. Their roles are the `student` and `guardian` starter roles (permissions doc phase 4a).
2. **R2** Student scope: a student's own id; a guardian's linked student ids from `guardian_student`. It is computed once per request in the guard and carried on `OrgContext` as `studentScope`.
3. **R3** Every portal endpoint takes a `studentId` (or derives the set) and answers 404 when the id is not in student scope, including ids from another school.
4. **R4** Portal endpoints check their `readOwn` permission through `@OrganizationAuth(resource, 'readOwn')` on each handler. A staff member holding `read` but not `readOwn` gets 403 from portal endpoints; staff screens never use portal endpoints.
5. **R5** Linked children include those who left or graduated, shown with " · archived", so families can still see a debt. A student's own login is different: recording a leaving or a graduation (including through "Start new school year") removes the student's membership of the school, so their login no longer opens it; the user row and `student.user_id` are kept, and undoing a leaving restores the membership ([40-students](40-students.md) S-16).
6. **R6** The class, campus and class teacher shown are those of the student's placement in the current term; without one, class shows "—" and the campus falls back to the home campus.
7. **R7** Balance = sum of the student's journal lines on fees receivable (derived, never stored). Owing > 0; credit < 0.
8. **R8** Family "Total owed" = sum of positive balances of the children in the statement; one child's credit never offsets another's debt, and credit is shown separately on that child ([D-038](../technical-reference.md#decision-log)).
9. **R9** Portal statement lines are the same entries as the staff statement, without journal references or links to staff pages.
10. **R10** Purchases are the student's `store_sale` rows with their lines, newest first; "this term" means the sale date is within the current term's dates.
11. **R11** The price list shows the whole catalogue of unretired items: books whose level is the student's current-session level, and uniforms grouped by name with their sizes and price range. Prices are the current selling prices. An item with no stock at the student's campus store stays listed, marked "Out of stock". The method copy lists the switched-on ways to pay.
12. **R12** Announcements follow [71-announcements](71-announcements.md) R10–R11; holidays and term figures follow [70-dashboard](70-dashboard.md) R1–R6.
13. **R13** Nothing in the portal writes data, other than the sign-in and password flows of M1.2.
14. **R14** Portal nav shows only pages whose gate passes, like the staff nav.
15. **R15** Fees, the family statement and Purchases are shown to every guardian linked to the child, not only those marked as paying fees ([D-030](../technical-reference.md#decision-log)). `pays_fees` decides who receives charges, not who may read them.

## Data

No new tables in this module. It reads:

- `student` (with `user_id`, `date_of_birth`, `admission_number`), `guardian` (with `user_id`, `email`, `username`), `guardian_student` ([overview](../brainstorming/data-model-overview.md#foundation-model)).
- `student_enrollment`, `enrollment_placement`, `class_arm`, `class_level`, `class_teacher`, `campus`.
- `term`, `holiday`, `announcement`.
- `journal_entry`, `journal_line`, `invoice`, `payment`, `payment_allocation`, `adjustment` ([finance](../brainstorming/data-model-finance.md#model)).
- `store_sale`, `store_sale_line`, `item` ([inventory](../brainstorming/data-model-inventory.md#sales-to-students)).
- Better Auth `user.username` for the student's username.

Index needed (owned by M2.4): `guardian (organization_id, user_id)` and `student (organization_id, user_id)`, both unique where not null, so the guard resolves student scope with one indexed query.

`OrgContext` gains `studentScope: 'all' | string[]` and the helper `inStudentScope` (permissions doc, "How far each person can see").

## API

New `portal` module. All routes filter by `ctx.organizationId` and `ctx.studentScope`.

| Method | Path                                        | Permission        | Request  | Response                                                                                                                                                                                        | Errors   |
| ------ | ------------------------------------------- | ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| GET    | `/portal/me`                                | `student:readOwn` | —        | `{ kind: 'student' \| 'guardian', name, email?, username?, school: {name, admissionPrefix, logoUrl?}, children: [{ id, firstName, lastName, className?, campusName, archived }] }`              | 403      |
| GET    | `/portal/children`                          | `student:readOwn` | —        | `[{ id, name, className?, campusName, balanceMinor? }]`; `balanceMinor` only with `invoice:readOwn`                                                                                             | 403      |
| GET    | `/portal/students/:studentId`               | `student:readOwn` | —        | `{ id, name, admissionNumber, dateOfBirth, className?, campusName, classTeacherName?, username? }`                                                                                              | 403, 404 |
| GET    | `/portal/students/:studentId/announcements` | `student:readOwn` | `?limit` | see [71-announcements](71-announcements.md#api)                                                                                                                                                 | 403, 404 |
| GET    | `/portal/students/:studentId/statement`     | `invoice:readOwn` | `?page`  | `{ balanceMinor, totals: {chargedMinor, paidMinor, reducedMinor}, lines: [{date, description, kind: 'charged'\|'paid'\|'reduced', amountMinor}], unpaid: [{number, outstandingMinor}], total }` | 403, 404 |
| GET    | `/portal/family-statement`                  | `invoice:readOwn` | —        | `{ totalOwedMinor, children: [{ studentId, name, className?, balanceMinor }] }` (cards; each child's lines come from the statement route)                                                       | 403      |
| GET    | `/portal/students/:studentId/purchases`     | `invoice:readOwn` | —        | `{ spentThisTermMinor, termPurchaseCount, itemsBought, sales: [{ id, date, campusName, receiptNumber, method, totalMinor, lines: [{itemName, quantity, unitPriceMinor, amountMinor}] }] }`      | 403, 404 |
| GET    | `/portal/students/:studentId/price-list`    | `invoice:readOwn` | —        | `{ levelName, books: [{name, priceMinor, inStock}], uniforms: [{name, sizes: string[], minPriceMinor, maxPriceMinor, inStock}], paymentMethods: string[] }`                                     | 403, 404 |

Term, week and holidays come from `GET /calendar/current` and `GET /calendar/days-off?limit=4` ([30-school-years-and-terms](30-school-years-and-terms.md#api)), which any signed-in member of the school may call. Contract types in `@eduvault/api-contract` under `portal.*`. Money fields are `*Minor` integers with the school currency.

## Acceptance criteria

1. Given Ngozi is linked to Ada, Chidi and Kelechi, when she signs in, then she lands on My children with three cards and the description "3 children at Greenfield College. Here is what each one owes."
2. Given Ada signs in, when the portal opens, then she lands on Home, sees no My children nav item, and `/children` redirects to Home.
3. Given Ngozi on My children, when she presses "See fees" on Chidi's card, then Fees opens with "Chidi Okeke · First term 2026/2027" and the switcher shows Chidi pressed.
4. Given Ngozi viewing Chidi on Fees, when she picks Kelechi in the switcher, then Fees shows Kelechi's statement without leaving the page.
5. Given Ngozi, when she requests `/portal/students/{Tobi's id}/statement`, then it answers 404.
6. Given Ada, when she requests `/portal/students/{Chidi's id}`, then it answers 404 (a sibling is not in a student's own scope).
7. Given a guardian of school B, when they request a school A student's portal route, then it answers 404.
8. Given a staff member with `invoice:read` but no `invoice:readOwn`, when they call `/portal/students/:id/statement`, then it answers 403.
9. Given a custom guardian role without `invoice:readOwn`, when the guardian opens the portal, then Fees and Purchases are absent from the nav, the Home Fees tile is hidden, and My children shows no fee rows and no family statement.
10. Given Ada owes nothing and holds credit of ₦5,000, when Fees renders, then the stat reads "School fees", "Paid up", "₦5,000 extra" and the callout "₦5,000 was paid in extra. It is taken off the next fees automatically." shows.
11. Given one child owes ₦100,000 and another holds ₦20,000 credit, when the family statement renders, then "Total owed" is ₦100,000.
12. Given Ada bought JSS 2 books by POS on 8 Sep 2026, when Purchases renders, then a card dated 8 Sep 2026 shows "Lekki campus store · receipt {RCT number}", a "Paid by POS" badge and one line per book.
13. Given Ada is in JSS 2, when the price list renders, then it lists the JSS 2 textbooks and the uniforms grouped by name, for example "School shirt", "Sizes 8, 10, 12, 14", "₦5,500"; retired items are absent.
14. Given a guardian with only a username (`etim-family`), when they open Home's Profile, then "Signed in with" shows `etim-family`.
15. Given a published announcement for Ikeja families, when Ada (Lekki) opens Home, then it is absent.
16. Given Ifeanyi is linked to Ada and doesn't pay fees, when he opens Fees, then he sees Ada's statement, and `/portal/students/{Ada's id}/statement` answers 200 ([D-030](../technical-reference.md#decision-log)).
17. Given Chidi holds ₦20,000 credit, when Ngozi opens My children, then Chidi's card reads "₦20,000 in credit" rather than "Paid up".
18. Given the JSS 2 Mathematics textbook has no stock at the Lekki store, when Ada's price list renders, then it is listed with "Out of stock".
19. Given POS is switched off in Payment rules, when the price list renders, then its description reads "Paid at the store by cash or bank transfer."
20. Given Ada is recorded as left, when Ngozi signs in, then Ada's card shows " · archived" with her balance; when Ada signs in with her own login, then the school no longer opens for her.

## Tests

- Unit (`nx run web-portal:test`): nav filtering by permissions and kind; default route by kind; child selection falls back to the first child when the URL id isn't linked; Fees stat copy for owing, credit and zero; uniform grouping and price range. (`nx run api:test`): student-scope resolution; family total rule R8.
- Integration (`api:test-integration`):
  - Isolation for every `/portal/*` route: another school's student (404); guardian A vs guardian B's child (404); a student vs their unlinked sibling (404) [tenancy-002].
  - 403 for each route without its `readOwn` permission, including a staff member with only `read`.
  - Statement and family totals against real journal rows, matching the staff Who owes figures for the same students [testing-002].
  - Purchases return frozen sale prices after an item price change.
- E2E (required, `eduvault-e2e`): sign in as the guardian persona, switch children, open Fees and Purchases; sign in as the student persona and check My children is absent; try a sibling's id in the URL.

## Open decisions

| #       | Question                                                                                                                                                                    | Options                                                                                                                                                           | Recommendation                                                                            | Confidence                                                                                | Decided                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| OD-72-1 | Which permission gates Home's school context (term, holidays, announcements, class teacher)? There is no `announcement:readOwn` or `session:readOwn`.                       | (a) `student:readOwn` covers the student's school context; (b) add new `readOwn` actions                                                                          | (a)                                                                                       | Medium: avoids permissions that no role would ever separate                               | Adopted                                                                                                                                   |
| OD-72-2 | Does a non-paying guardian see fees? CONTEXT.md calls the family statement "a paying guardian's children"; the prototype shows fees to every linked guardian.               | (a) every linked guardian sees each linked child's fees, and the family statement covers all linked children; (b) only paying guardians see fees                  | (a), and update the glossary wording                                                      | Low: a school may want to hide fees from a separated parent; would need a per-link switch | [D-030](../technical-reference.md#decision-log): every linked guardian sees fees and purchases                                            |
| OD-72-3 | How is "Total owed" and a child in credit shown? The prototype nets credit against debt in "Family total" but not in the header, and shows "Paid up" for a child in credit. | (a) sum positive balances only; show credit as "{amount} in credit" on the child card; (b) net across children                                                    | (a)                                                                                       | High: each child keeps their own account (data-model decision)                            | [D-038](../technical-reference.md#decision-log): owed summed, credit shown separately                                                     |
| OD-72-4 | Do left or graduated children, and their own logins, stay in the portal?                                                                                                    | (a) guardians keep seeing them, marked archived, while linked; a left student's login keeps read access; (b) remove on leaving                                    | (a) for guardians; for the student's own login, disable sign-in on leaving (M2.5 decides) | Low: depends on the lifecycle PRD                                                         | Adopted; the student-login part is settled in [40-students](40-students.md) S-16 (leaving or graduating removes the student’s membership) |
| OD-72-5 | Page file names: the permissions doc plans `my-profile-page`, `my-fees-page`; the prototype has Home, Fees, Purchases, My children.                                         | (a) `home-page`, `fees-page` (rewritten), `purchases-page`, `children-page`; (b) the doc's names                                                                  | (a), matching the screens                                                                 | High: Profile is a card on Home, not a page                                               | Adopted                                                                                                                                   |
| OD-72-6 | Which permission gates Purchases and the price list? The prototype uses `invoice:readOwn`; there is no `store:readOwn`.                                                     | (a) `invoice:readOwn` (a store sale is a charge and a payment); (b) add `store:readOwn`                                                                           | (a)                                                                                       | Medium: the sale already appears on the statement under the same permission               | Adopted                                                                                                                                   |
| OD-72-7 | What do `feeLine:readOwn` and `payment:readOwn` gate? No portal screen uses them.                                                                                           | (a) keep in the starter roles, unused until a "fees for next term" page; payment lines ride on `invoice:readOwn`; (b) require `payment:readOwn` for payment lines | (a)                                                                                       | Medium: splitting a statement by permission would confuse families                        | Adopted                                                                                                                                   |
| OD-72-8 | Should the price list show only items stocked at the student's campus store?                                                                                                | (a) yes, hide items with zero stock there; (b) show the catalogue                                                                                                 | (b), with "Out of stock" when zero at their campus                                        | Low: families may want prices before stock arrives                                        | Adopted                                                                                                                                   |

## Prototype gaps noticed

- Portal nav ignores permission gates (it filters only by guardian/student), unlike the staff nav.
- The hero always says "Good morning".
- Admission prefix `GF-` and username prefix `greenfield-` are hardcoded; real values come from `school_account.admission_prefix` ([D-019](../technical-reference.md#decision-log)) and the school slug.
- The crest shows "GC" for every school.
- "Signed in with" is blank for a guardian who has a username and no email.
- My children's description says "children" even for one child.
- My children shows balances with only `student:readOwn`, though Fees needs `invoice:readOwn`.
- "Family total" nets credit against debt; the header uses max(0, total); a child in credit shows "Paid up".
- Purchases can show an "Unpaid" badge, though a store sale is always paid at the store (inventory decision).
- "Items bought" counts all time while "Spent this term" counts this term, side by side.
- The price list ignores retired items, campus stores and stock, and its payment-method copy is hardcoded instead of following the school's payment rules.
- The statement's unpaid-charges footer shows charge numbers while the rows hide references.
- The hero says "{campus} campus" while child cards say "{campus}".
- Sign-out is not wired.
- No loading, error or empty states for Home's Announcements card.

### Where the prototype differs from permissions doc phase 4a

| Topic          | Permissions doc (phase 4a)                                                       | Prototype                                                                                       | This PRD                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pages          | `index` → my-profile, `fees` → my-fees, `children`; results and attendance later | Home (profile is a card), Fees, Purchases, My children with a family statement                  | Follow the prototype                                                                                                     |
| What 4a covers | "Only the student's own record and fees"                                         | Home also shows term progress, holidays, announcements, class teacher                           | Home needs M2.1, M2.3 and M2.7 data                                                                                      |
| Permissions    | `student` and `feeSchedule` gain `readOwn`                                       | `student`, `feeLine`, `invoice`, `payment` `readOwn`; `feeSchedule` replaced by `feeLine`       | Follow the data-model permission list                                                                                    |
| Purchases      | Not mentioned                                                                    | A full page plus price list                                                                     | M4.4, with store sales                                                                                                   |
| Child switcher | `__root.tsx` and `components/child-switcher.tsx`                                 | Header on desktop; above content on phones; hidden on My children                               | Same file, placement per prototype                                                                                       |
| Navigation     | Not specified                                                                    | Top nav on desktop, bottom nav on phones, My children for guardians only, default route by kind | Follow the prototype                                                                                                     |
| Queries        | `mePermissions`, `myProfile`, `myFees`, `children`                               | —                                                                                               | Adds `portalMe`, `calendarCurrent`, `daysOff`, `announcements`, `statement`, `familyStatement`, `purchases`, `priceList` |

### Existing `apps/web-portal/src`, and what changes

| File                                                             | Today                                                                                                                         | Change                                                                                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `app.tsx`                                                        | Sign-in form, "Eduvault Portal" header, `ContextSwitchers` (school and campus), "Sign out", a "not added to a school" message | Shell moves into the root route; drop the campus switcher; school picker per shell decision S-14; sign-in and password steps from M1.2 |
| `routes/__root.tsx`                                              | Hardcoded "Students" and "Fees" links                                                                                         | Portal shell; `beforeLoad` loads `/me/permissions` and `/portal/me` into context; nav filtered by permission and kind                  |
| `routes/index.tsx`                                               | Loads the staff student and campus lists                                                                                      | Home; loader prefetches `/portal/students/:id`, `/calendar/current`, `/calendar/days-off`, announcements                               |
| `routes/fees.tsx`                                                | Loads fee schedules                                                                                                           | Fees; `beforeLoad` needs `invoice:readOwn`                                                                                             |
| `routes/children.tsx`                                            | —                                                                                                                             | New; guardians only                                                                                                                    |
| `routes/purchases.tsx`                                           | —                                                                                                                             | New in M4.4                                                                                                                            |
| `pages/students-page.tsx` (+ spec)                               | Staff-style student list                                                                                                      | Removed                                                                                                                                |
| `pages/fees-page.tsx`                                            | Fee schedule list                                                                                                             | Rewritten as the portal Fees page                                                                                                      |
| `pages/home-page.tsx`, `children-page.tsx`, `purchases-page.tsx` | —                                                                                                                             | New                                                                                                                                    |
| `components/child-switcher.tsx`, `components/portal-nav.tsx`     | —                                                                                                                             | New                                                                                                                                    |
| `queries.ts`                                                     | `students`, `campuses`, `feeSchedules`                                                                                        | Replaced by the portal queries above                                                                                                   |

The statement card is shared with staff Who owes, so it belongs in `libs/ui` as a presentational component taking the statement data as props.

## Dependencies

- M1.1 (permission list, guard, `/me/permissions`), M1.2 (portal sign-in with username or email, temporary passwords).
- M2.4 (students with `user_id`, guardians with portal logins, `guardian_student`) and the `student`/`guardian` starter roles with their `readOwn` permissions ([D-015](../technical-reference.md#decision-log)).
- M2.8: M2.1 (term, holidays), M2.3 (class teachers), M2.7 (announcements). The Fees tile and fee rows stay hidden until M3.7.
- M3.7: M3.4 (payments, statements) and M2.8.
- M4.4: M4.3 (store items, stock and stores) and the store sales built in the same slice; the method copy reads Payment rules (M3.4).

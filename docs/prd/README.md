# Eduvault roadmap and module specs

- Status: draft, awaiting review before `to-spec`
- Date: 2026-10-09
- Source of truth: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53` ([D-001](../technical-reference.md#decision-log))
- Read with: [technical reference](../technical-reference.md) (shared rules and decision log), [data model overview](../brainstorming/data-model-overview.md), [permissions doc](../brainstorming/permissions-and-custom-roles.md)

## How the roadmap is cut

Milestones follow the data model's phase order ([D-005](../technical-reference.md#decision-log)). Each slice inside a milestone is vertical: it ships its migration, API, contract types, screens, an isolation test for every new table and route [tenancy-002], and the dev-seed rows it needs, and it can be checked end to end on its own. Components land with the first slice that needs them, not as a separate layer.

## Milestones and slices

### M0 Foundations

| Slice | What ships                                                                                                                      | Needs | PRDs   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| M0.1  | Brand tokens, fonts, dark mode; both app shells (sidebar with rail, topbar, mobile nav, portal bottom nav) with placeholder nav | —     | 01, 10 |
| M0.2  | Test harness changes, SWC build for the seed, the Greenfield dev seed skeleton, e2e personas                                    | —     | 04     |

### M1 Access

| Slice | What ships                                                                                                                                                                                                                                                                          | Needs      | PRDs       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| M1.1  | Permission list in `libs/policy` (incremental), any-of guard, `/me/permissions`, starter roles seeded (including Principal), nav gating, 401/403/404/409 contract, `23514`→409, `DELETE /students/:id` removed                                                                      | M0.1, M0.2 | 02, 10, 21 |
| M1.2  | Sign-in and set-up: sign-up off, bootstrap super admin, server-side user creation, temporary passwords and forced change, no-school screen, **create school** from a minimal platform page (owner, starter roles, admission prefix; creates `class_level` and seeds default levels) | M1.1       | 11, 12     |
| M1.3  | Staff and members: list, detail, add with temporary password, role-assignment wizard, combination rules, remove                                                                                                                                                                     | M1.2       | 20         |
| M1.4  | Roles: list, editor with plain-language areas, templates, copy, fixed slug, refuse delete in use                                                                                                                                                                                    | M1.3       | 21         |
| M1.5  | Platform console: schools list and detail, suspend, replace owner, acting in a school with a reason, audit log                                                                                                                                                                      | M1.2       | 12         |

### M2 School foundation (F0)

| Slice | What ships                                                                                                                                                       | Needs            | PRDs       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- |
| M2.1  | School years, terms, holidays; make current (including next year's first term); the "no current term" state                                                      | M1.1             | 30         |
| M2.2  | Campuses; school settings (profile with logo, admissions rules, danger zone, handover); the `FileStore` (Postgres)                                               | M1.1             | 32, 33, 03 |
| M2.3  | Levels page (over the table M1.2 created), classes, class teachers, teacher-candidates endpoint, archive and restore                                             | M2.1, M2.2, M1.3 | 31         |
| M2.4  | Students list and detail, admission wizard, guardians with portal logins (username plugin), `activity_event`                                                     | M2.3, M1.2       | 40, 41, 42 |
| M2.5  | Lifecycle: not seen since, back in school, record leaving, graduate class, move for next term, placement roll-forward on make-current, **Start new school year** | M2.4             | 40, 30, 31 |
| M2.6  | Dashboard first cut: term card, holidays, tasks, recent activity                                                                                                 | M2.4             | 70         |
| M2.7  | Announcements: staff list and editor, portal-ready feed                                                                                                          | M2.2             | 71         |
| M2.8  | Portal shell, Home, My children, child switcher, profile card, announcements on Home                                                                             | M2.4, M2.7       | 72, 10     |

### M3 Money (F1)

| Slice | What ships                                                                                                                                                     | Needs      | PRDs           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------- |
| M3.1  | Ledger core (documents, references, journal and balance trigger), money accounts (including cash box), money categories with the Journal tab, opening balances | M2.2       | 03, 56         |
| M3.2  | School fees and other fees, fee types, opt-ins; drops `fee_schedule` and both old fees pages                                                                   | M3.1, M2.3 | 50             |
| M3.3  | Charge students (prepare, check, send, cancel), charges list and detail, `student_discount` table and its application                                          | M3.2, M2.4 | 51, 52, 55     |
| M3.4  | Payments with split allocation and proof, receipts (print view), payment rules, who owes, student and family statements                                        | M3.3, M2.2 | 53, 54, 33     |
| M3.5  | Approvals queue (provider shape), counts and bell, approval rules, fee reductions, cancelled balances, refunds, discount screens, payment cancellations        | M3.4       | 57, 55, 53, 33 |
| M3.6  | Staff leave: request, withdraw, approve and decline in Approvals (`leave:approve`)                                                                             | M3.5       | 22             |
| M3.7  | Portal Fees and family statement                                                                                                                               | M3.4, M2.8 | 72             |

### M4 Store and subjects (F2)

| Slice | What ships                                                                                         | Needs            | PRDs   |
| ----- | -------------------------------------------------------------------------------------------------- | ---------------- | ------ |
| M4.1  | Subject catalogue, subject teachers per class and term                                             | M2.3             | 60     |
| M4.2  | Level-subject editor (core, elective, order) and per-session elective picker                       | M4.1             | 60     |
| M4.3  | Store items, one store per campus (backfilled), deliveries and opening stock, stock movements      | M3.1, M2.2       | 61, 32 |
| M4.4  | Store sales (charge, payment and stock out in one action) and portal Purchases with the price list | M4.3, M3.4, M2.8 | 61, 72 |
| M4.5  | Stock counts, store write-offs in Approvals                                                        | M4.3, M3.5       | 61, 57 |

### Later (not specified from the prototype)

| Milestone | Scope                                                                            | Design source                                                                      |
| --------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| M5        | Expenses and suppliers (F1b)                                                     | [data-model-finance.md](../brainstorming/data-model-finance.md#expenses-f1b)       |
| M6        | Grading (F3): assessments, scores, report cards, attendance, fee hold, promotion | [data-model-grading.md](../brainstorming/data-model-grading.md)                    |
| M7        | Rest of inventory (F4): named stores, transfers, requisitions, assets, library   | [data-model-inventory.md](../brainstorming/data-model-inventory.md#later-model-f4) |

The dashboard grows with each slice; [70-dashboard.md](70-dashboard.md) maps every card to the slice that adds it.

## Module specs

| PRD                                                                              | Slices                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------- |
| [01 Foundation: design system](01-foundation-design-system.md)                   | M0.1, then components per slice                   |
| [02 Foundation: permissions and scopes](02-foundation-permissions-and-scopes.md) | M1.1, then resources per slice                    |
| [03 Foundation: ledger and documents](03-foundation-ledger-and-documents.md)     | M2.2 (file store), M3.1                           |
| [04 Foundation: testing and seed](04-foundation-testing-and-seed.md)             | M0.2, then seed rows per slice                    |
| [10 App shell and navigation](10-app-shell-and-navigation.md)                    | M0.1, M1.1, M2.8                                  |
| [11 Sign-in and set-up](11-sign-in-and-setup.md)                                 | M1.2                                              |
| [12 Platform console](12-platform-console.md)                                    | M1.2 (create school), M1.5                        |
| [20 Staff and members](20-staff-and-members.md)                                  | M1.3                                              |
| [21 Roles and permissions](21-roles-and-permissions.md)                          | M1.1 (starter roles), M1.4                        |
| [22 Staff leave](22-staff-leave.md)                                              | M3.6                                              |
| [30 School years and terms](30-school-years-and-terms.md)                        | M2.1, M2.5                                        |
| [31 Classes](31-classes.md)                                                      | M2.3, M2.5 (graduate class)                       |
| [32 Campuses](32-campuses.md)                                                    | M2.2, M4.3 (store per campus)                     |
| [33 School settings](33-school-settings.md)                                      | M2.2, M3.4 (payment rules), M3.5 (approval rules) |
| [40 Students](40-students.md)                                                    | M2.4, M2.5                                        |
| [41 Admission](41-admission.md)                                                  | M2.4                                              |
| [42 Guardians](42-guardians.md)                                                  | M2.4                                              |
| [50 Fees](50-fees.md)                                                            | M3.2                                              |
| [51 Charge students](51-charge-students.md)                                      | M3.3                                              |
| [52 Charges](52-charges.md)                                                      | M3.3, M4.4 (store charges)                        |
| [53 Payments](53-payments.md)                                                    | M3.4, M3.5 (cancellations)                        |
| [54 Who owes and statements](54-who-owes-and-statements.md)                      | M3.4                                              |
| [55 Discounts and refunds](55-discounts-and-refunds.md)                          | M3.3 (discount table), M3.5                       |
| [56 Money accounts and categories](56-money-accounts-and-categories.md)          | M3.1                                              |
| [57 Approvals](57-approvals.md)                                                  | M3.5, M3.6 (leave), M4.5 (store write-offs)       |
| [60 Subjects](60-subjects.md)                                                    | M4.1, M4.2                                        |
| [61 Store](61-store.md)                                                          | M4.3, M4.4, M4.5                                  |
| [70 Dashboard](70-dashboard.md)                                                  | M2.6, then a card per slice                       |
| [71 Announcements](71-announcements.md)                                          | M2.7, M2.8 (portal display)                       |
| [72 Portal](72-portal.md)                                                        | M2.8, M3.7, M4.4                                  |

Template for new specs: [_template.md](_template.md).

## Decisions

Decisions that cross modules, or change the data model, permissions or roadmap, are logged in the [technical reference](../technical-reference.md#decision-log). Each PRD's **Open decisions** table carries the module-local ones, with a **Decided** column.

### Adopted by default

Every open decision a writer raised was reviewed with the advisor. Unless listed below, the writer's recommendation was adopted as written, including the low-confidence ones that are module-local and reversible. To change one, name its ID (for example `STO-12`) and it will be reopened.

- **Deferred:** a CSV export of Who owes (OD-54-6).
- **Overridden:** store cost uses a moving weighted average, not "a delivery updates the cost price" (STO-8); a payment-cancellation request and its approval both ship in M3.5, not split across M3.4 and M3.5.
- **Conflicts resolved:** see D-020 to D-026 in the technical reference; the rest of the cross-module defaults are D-009 to D-048.
- **Deviates from the prototype.** These defaults change behaviour the prototype shows. Each is adopted but worth a deliberate yes:
  - 50-2: only people who see every campus can create or change every-campus fee lines (the prototype lets the Lekki bursar).
  - OD-71-1: only people who see every campus can address an announcement to everyone.
  - D-021: "Not active yet" settings rows are hidden in production.
  - OD-57-6: nav and bell counts leave out the viewer's own requests (the prototype counts them in the nav).
  - 51-1, 51-3: charge rounds with nothing in the viewer's scope are hidden, and sending or cancelling a round that holds out-of-scope charges answers 403.
  - OD-70-1: Recent activity is filtered by campus and pillar permission (the prototype shows every event, money included, to every member).
  - STO-12: "Show costs" off also masks cost figures on the dashboard's Store card.
  - OD-72-8: the portal price list marks items that are out of stock at the child's campus "Out of stock" (the prototype shows no stock state).
  - D-050: recording a leaving or graduation closes the student's own portal login.
- **Asked and answered:** file storage (D-028), moving students into a new school year (D-029), fee visibility for non-paying guardians (D-030).

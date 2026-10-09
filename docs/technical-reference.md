# Technical reference

The document to read before implementing any slice of the roadmap, and to update whenever a decision is made while building. It points at the detailed sources rather than restating them; it states only the rules every slice shares and the log of decisions.

- Status: living. Last updated 2026-10-09.
- Roadmap and module specs: [docs/prd/README.md](prd/README.md)
- Design source of truth: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY` (see [D-001](#decision-log))

## How to use this document

1. Before a slice: read its PRD, the decisions it cites here, and [conventions](conventions.md).
2. While building: when you choose something the PRD or data model doesn't settle, add a row to the [decision log](#decision-log) in the same PR, with the next `D-` number. If it is architectural and hard to reverse, also write an ADR and link it.
3. When a decision is overturned, don't delete its row: set its status to `superseded by D-…` and add the new row.
4. When an open question is settled, move it from [Open questions](#open-questions) into the log.

## Sources

| Topic                                      | Where                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Screens, copy, flows                       | The prototype (D-001) and the module PRDs in [docs/prd](prd/README.md)                                                                     |
| Data model, foundation and cross-cutting   | [data-model-overview.md](brainstorming/data-model-overview.md)                                                                             |
| Finance                                    | [data-model-finance.md](brainstorming/data-model-finance.md)                                                                               |
| Store and inventory                        | [data-model-inventory.md](brainstorming/data-model-inventory.md)                                                                           |
| Grading                                    | [data-model-grading.md](brainstorming/data-model-grading.md)                                                                               |
| Permissions, roles, super admin, accounts  | [permissions-and-custom-roles.md](brainstorming/permissions-and-custom-roles.md)                                                           |
| Domain words                               | [CONTEXT.md](../CONTEXT.md)                                                                                                                |
| Architecture and module boundaries         | [architecture.md](architecture.md)                                                                                                         |
| Coding conventions and which gate enforces | [conventions.md](conventions.md)                                                                                                           |
| Verification policy                        | [verification.md](verification.md), [ADR 0004](adr/0004-verification-policy.md)                                                            |
| Tenancy                                    | [ADR 0005](adr/0005-tenancy.md)                                                                                                            |
| Monorepo, auth, database                   | [ADR 0001](adr/0001-nx-and-pnpm-catalogs.md), [ADR 0002](adr/0002-better-auth-in-nestjs.md), [ADR 0003](adr/0003-raw-sql-dbmate-kysely.md) |

## Rules every slice follows

Each is decided elsewhere; the link is the authority.

- **Tenancy.** Every school-scoped table has `organization_id`; every query filters by the active school and the campus scope. Out of scope answers 404; in scope without the permission answers 403 [tenancy-001] [tenancy-002]. Each new table or route ships an isolation test in `api:test-integration`.
- **Guard.** `@OrganizationAuth(resource, action)` on each handler, never the class. The permission list lives in code in `libs/policy`; a resource joins it in the same change that adds its endpoints.
- **Scopes.** Campus scope, class scope (binds only `class:read` without `class:readAll`), student scope (own records, or a guardian's linked children). Finance is campus-scoped, never class-scoped. See the overview's [Class scope](brainstorming/data-model-overview.md#class-scope).
- **Never delete** money, results or students [risk-001]. Archive, retire, void or supersede. FKs to them use `ON DELETE RESTRICT`.
- **Money.** `BIGINT` minor units; one currency per school; balances and stock on hand are derived, never stored; every movement has a per-school unique `reference` and applies at most once.
- **Approvals.** `approved_by <> created_by` enforced by the database; a kind switched off by the school is approved on creation with `approved_by` null.
- **Document numbers** from `document_sequence` per school, kind and year (`CHG-2026-00042`).
- **Null `campus_id`** means "every campus" on configuration and "school-wide" on money; see the overview's rules.
- **UI.** Components come from `libs/ui` via the shadcn CLI; theme tokens only, never raw colours; Better Auth client code in `auth-client`.
- **Tests.** Never run the full suite [testing-001]; tenancy and permission rules against real Postgres [testing-002]; browser e2e is opt-in.

## Decision log

| ID    | Date       | Decision                                                                                                                                                                                                                                   | Source                        | Refs                                             | Status |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------ | ------ |
| D-001 | 2026-10-09 | The brand prototype artifact is the source of truth for screens, flows and copy. Where it is silent, the data-model docs' earlier design stands and is phased later                                                                        | User                          | data-model-overview.md                           | Active |
| D-002 | 2026-10-09 | The campus store (uniforms, textbooks) ships at F2; consumables, requisitions, assets and library at F4 on the same catalogue                                                                                                              | User                          | data-model-inventory.md                          | Active |
| D-003 | 2026-10-09 | Stock on hand is derived from append-only `stock_movement` rows, not a stored quantity                                                                                                                                                     | User                          | data-model-inventory.md                          | Active |
| D-004 | 2026-10-09 | Store deliveries post directly (Dr Store stock / Cr money account); approved expenses and suppliers come in F1b                                                                                                                            | User                          | data-model-finance.md                            | Active |
| D-005 | 2026-10-09 | Phase order: F0 foundation, F1 finance, F1b expenses, F2 store and subjects, F3 grading, F4 rest of inventory                                                                                                                              | User                          | data-model-overview.md#phases                    | Active |
| D-006 | 2026-10-09 | Role-name checks become permissions: `leave:approve` (owner and principal by default); class and subject teacher pickers list campus members holding `class:read`. The one-senior-role limit and the handover rule stay tied to role names | User                          | data-model-overview.md#permission-list           | Active |
| D-007 | 2026-10-09 | A switched-off approval records `approved_by` null rather than the creator, so the self-approval check holds                                                                                                                               | Agent default (aligning docs) | data-model-overview.md#rules-every-table-follows | Active |
| D-008 | 2026-10-09 | Store sale references are generated by the client so a retry posts once                                                                                                                                                                    | Agent default (aligning docs) | data-model-inventory.md#sales-to-students        | Active |

## Open questions

| Question | Raised in | Owner |
| -------- | --------- | ----- |

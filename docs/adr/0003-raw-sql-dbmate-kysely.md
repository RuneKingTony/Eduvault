# Raw SQL migrations (dbmate) with Kysely and committed generated types

- Status: accepted
- Date: 2026-10-07

## Context

We want the schema to be plain, reviewable SQL, queries to be type-checked, and an agent to be told, deterministically, when the three drift apart.

## Decision

- Schema changes are dbmate `.sql` migrations. No ORM.
- Queries use Kysely over a `pg` Pool (`DB_TOKEN`), with `sql` templates for anything complex.
- `kysely-codegen` types (`apps/api/src/db/db-types.ts`) and dbmate's `apps/api/db/schema.sql` are committed. `pnpm drift` regenerates both in a throwaway Postgres container and fails on any difference; `pnpm drift:fix` rewrites them.
- `schema.sql` is dumped with the `pg_dump` inside the server image, so it does not depend on the developer's local `pg_dump` version.
- Naming: Better Auth owns camelCase columns and text ids; domain tables are snake_case with UUID ids. Kysely has no `CamelCasePlugin`, because it would break access to Better Auth's tables.
- Money is stored as integer minor units (`BIGINT`), and exposed as a number.

## Alternatives considered

- **Prisma/Drizzle**: a second schema language, and Better Auth's generator would still have to be reconciled with it.
- **Letting dbmate dump `schema.sql`**: output changes with the local `pg_dump` version and a random `\restrict` token, which would make the gate flaky.

## Consequences

- The drift gate needs Docker.
- Foreign keys carry tenancy: `student` and `fee_schedule` reference `campus (team_id, organization_id)`, so a row can never point at another school's campus.

# Development

## Prerequisites

Node 24 (`.nvmrc`), pnpm 10 (`packageManager`), Docker. `pnpm install` also installs the Husky hook.

## Everyday loop

```sh
pnpm validate:quick      # lint + typecheck + unit tests, affected projects only
nx run api:test-integration   # when API, policy, contract or migrations changed
```

Never run an unscoped test command across the monorepo. `pnpm validate` runs everything; it is for a final check, not the inner loop.

## Running the stack

```sh
pnpm db:up && pnpm db:seed && pnpm dev
```

| Service    | URL                   |
| ---------- | --------------------- |
| API        | http://localhost:3000 |
| web-admin  | http://localhost:4200 |
| web-portal | http://localhost:4201 |
| Postgres   | localhost:5434        |

Seeded accounts all use the password `password123`; the table is in `.claude/skills/run-local/SKILL.md`. `GET /health` returns 200 when the API can reach Postgres.

The API reads `apps/api/.env.local` (created from `.env.example`) and refuses to start if a variable is missing or malformed, naming each one.

## Database

| Task                    | Command                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Start only Postgres     | `nx run api:db-start`                                                                          |
| Apply migrations        | `nx run api:db-migrate-up`                                                                     |
| Wipe and recreate       | `nx run api:db-reset` (wipes the volume, restarts Postgres, migrates; re-seed afterwards)      |
| Seed                    | `nx run api:db-seed` (idempotent)                                                              |
| New migration           | add `apps/api/db/migrations/<timestamp>_<name>.sql` with `-- migrate:up` and `-- migrate:down` |
| Refresh generated files | `pnpm drift:fix`                                                                               |

After any schema change run `pnpm drift:fix` and commit `schema.sql` and `db-types.ts` with the migration.

## Adding an API resource

1. Add the schemas and routes to `libs/api-contract` (the SPAs and API both fail typecheck until they agree).
2. Add a permission to `libs/policy/src/statements.ts` and grant it in `roles.ts`.
3. Add a migration with `organization_id` (and a composite campus foreign key if campus aware).
4. Add a module under `apps/api/src/app/modules/`; put `@OrganizationAuth(resource, action)` on each handler and filter every query by `ctx.organizationId` and, where campus aware, `inCampusScope`.
5. Cover it in `apps/api/test/*.integration.spec.ts`, including a cross-school case.

## Integration tests

`apps/api/test/support/base-test.ts` exposes the `baseTest` fixture: `signUp`, `signIn`, `createOrganization`, `createCampus`, `addMember`, `promoteToAdmin`, `setActiveOrganization`, `setActiveCampus` and an `api(user)` supertest helper. Each test starts from truncated tables; one Postgres container serves the whole run.

## Troubleshooting

- **`Cannot connect to the Docker daemon`**: start Docker, then retry.
- **Port 5434 busy**: another Eduvault Postgres is running (`nx run api:db-stop`).
- **Signed in on :4200 and :4201 at once**: expected; cookies are shared across localhost ports.

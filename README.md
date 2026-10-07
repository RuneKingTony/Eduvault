# Eduvault

School-management monorepo: two React SPAs and a NestJS API on Postgres, with Better Auth. A school is a Better Auth organization and a campus is a team, so one user can hold a different role in each school.

| App          | Stack                                            | Port |
| ------------ | ------------------------------------------------ | ---- |
| `web-admin`  | React, Vite, TanStack Router and Query, Tailwind | 4200 |
| `web-portal` | same                                             | 4201 |
| `api`        | NestJS, Better Auth, Kysely, dbmate (raw SQL)    | 3000 |

Shared code lives in `libs/` as `@eduvault/{api-contract,policy,shared,ui,testcontainers}`.

## Quick start

Needs Node 24, pnpm 10 and Docker.

```sh
pnpm install
pnpm db:up && pnpm db:seed && pnpm dev
```

Sign in at http://localhost:4200 with `multi@eduvault.test` / `password123`.

## Verify

```sh
pnpm validate:quick   # affected projects: lint, typecheck, unit tests
pnpm validate         # everything, including drift gates and integration tests (Docker)
```

## Docs

- [Architecture](docs/architecture.md): boundaries, auth flow, tenancy, what Better Auth owns
- [Development](docs/development.md): running, database, adding a resource
- [Verification](docs/verification.md): every gate and how to fix it
- [Decisions](docs/adr/): Nx and catalogs, Better Auth in NestJS, raw SQL, verification policy, tenancy
- [CLAUDE.md](CLAUDE.md): agent instructions

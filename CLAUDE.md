# CLAUDE.md

Eduvault: a school-management monorepo (Nx + pnpm catalogs). Verification is static checks plus API integration tests; there is no browser e2e. Details in `docs/`.

## Layout

- `apps/api` — NestJS API (Better Auth, Kysely, dbmate). Modules in `src/app/modules/`, shared infra in `src/app/common/`. Integration tests in `test/`.
- `apps/web-admin` (:4200), `apps/web-portal` (:4201) — React SPAs (Vite, TanStack Router + Query, Tailwind 4).
- `libs/` — `@eduvault/{api-contract,policy,shared,ui,testcontainers}`, resolved through `tsconfig.base.json` paths.
- `scripts/` — drift-gate tooling (`drift-check.ts`), run through `pnpm drift` / `pnpm drift:fix`.
- Nx tags: `scope:api`, `scope:web-admin`, `scope:web-portal`, `scope:shared`. Apps cannot import each other; web cannot import api (`nx lint` fails).

## Commands

| Need                   | Command                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| Fast loop (affected)   | `pnpm validate:quick`                                                    |
| Everything             | `pnpm validate` (needs Docker)                                           |
| One project            | `nx run <project>:<lint\|typecheck\|test\|build>`                        |
| API integration tests  | `nx run api:test-integration` (real Postgres via Testcontainers)         |
| Postgres only          | `nx run api:db-start` (host port **5434**)                               |
| Migrate / reset / seed | `nx run api:db-migrate-up` / `api:db-reset` / `api:db-seed`              |
| Run all three apps     | `pnpm dev` (Postgres + migrate + api :3000 + admin :4200 + portal :4201) |
| Regenerate drift files | `pnpm drift:fix`, then review and commit                                 |
| New Better Auth schema | `nx run api:auth-generate`                                               |

Ports: Postgres 5434, API 3000, web-admin 4200, web-portal 4201. First run copies `apps/api/.env.example` to `.env.local`.
Recipe for running everything and signing in: `.claude/skills/run-local/SKILL.md`.

## Testing

Never run the full test suite (bare `nx run-many -t test`, unscoped `vitest`). Scope to affected projects: `pnpm validate:quick`, or `nx run <project>:test`. `pnpm validate` is the one place everything runs; use it only when asked.

Unit tests (`nx run <project>:test`) never start Docker. Integration tests (`api:test-integration`) and the drift gates do.

## Definition of done

1. `pnpm validate:quick` is green.
2. If `apps/api`, `libs/policy`, `libs/api-contract` or any migration changed: `nx run api:test-integration` is green too.
3. If the DB schema or Better Auth options changed: `pnpm drift` is green (run `pnpm drift:fix` first).

## Gotchas

- **Never hand-edit** `apps/api/db/schema.sql`, `apps/api/src/db/db-types.ts` or `apps/api/db/auth-schema.snapshot.sql`; `pnpm drift:fix` regenerates them. Better Auth tables come from `api:auth-generate`, never from hand-written SQL.
- Better Auth tables use camelCase columns and text ids (`DEFAULT gen_random_uuid()::text`, because `generateId: false`). Domain tables are snake_case. Kysely has no `CamelCasePlugin` on purpose.
- Tenancy: organization = school, team = campus. Every school-scoped table carries `organization_id`, and every query filters by `ctx.organizationId` and the campus scope. Out-of-scope rows answer 404, not 403.
- `@OrganizationAuth(resource, action)` goes on each handler, not the class, so the guard runs once.
- The default team per organization is disabled; a campus is a team plus a `campus` row. Creating a campus enrols its creator, because Better Auth only activates a team the user belongs to.
- Nest needs decorator metadata, so the API is built with SWC through Vite into `apps/api/dist/main.cjs` and run with `node` (not `tsx`). The output stays inside `apps/api` so pnpm's strict `node_modules` resolves.
- Session cookies are host-scoped, not port-scoped: signing in on :4200 also signs in :4201.
- Docker must be running for integration tests and `pnpm drift`.

## Git

- Conventional commits with a scope from the table in `.claude/commands/commit-conventional.md`. Never add a `Co-Authored-By` trailer.
- Branches are `edu-<issue>-<slug>`, PRs are drafts titled `EDU-<n>: ...`. Diff against `origin/main`, never local `main`.
- Never bypass hooks (`--no-verify`, `HUSKY=0`) and never background a command with `nohup` or `&`; the PreToolUse guard blocks both. Use `run_in_background: true`.

## Agent skills

Issues are in GitHub Issues via `gh` (`docs/agents/issue-tracker.md`). Domain vocabulary is in `CONTEXT.md`, decisions in `docs/adr/`.

## Comment hygiene

Don't add code comments by default. Add one only for something a reader can't work out from the code: a non-obvious constraint, a workaround, or the reason for a surprising choice. One or two lines. Never restate what the code does, narrate the change, or reference a ticket or PR.

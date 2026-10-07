## Goal
Scaffold a TypeScript **Nx monorepo** called **eduvault**: two React SPAs and one NestJS API, with Postgres (raw SQL migrations, no ORM) and Better Auth. The backend has integration tests. The whole repo is optimised so an AI agent can verify its own changes quickly and deterministically, using static checks plus integration tests. No browser e2e in the default loop, and no deployment or infrastructure code (no production Dockerfiles, Terraform, or scanners). See the note at the end for what was later allowed. The only container is a local `docker-compose.yml` running Postgres.

## Reference (read-only)
Adapt conventions from `/Users/judeokafor/Documents/fogado`:
- `nx.json`, `eslint.config.mjs` (`scope:*` module-boundary tags), `pnpm-workspace.yaml` (catalogs).
- `.husky/`, `.claude/settings.json`, and `CLAUDE.md`.
- `apps/api/auth.ts`, and `apps/api/src/app/common/auth/` (Better Auth wiring).
- dbmate `db/migrations`, `libs/testcontainers`, and `docs/adr/`.

Don't copy Fogado's domain code, Terraform, i18n, Jira, notifications, rank hooks, or its broken `api:serve`. Make `serve` work for eduvault.

## Stack
Verify versions and APIs with `npx ctx7@latest` before pinning.
- **Tooling:** Nx with inferred-target plugins (`@nx/vite`, `@nx/vitest`, `@nx/eslint`, `@nx/node`/`@nx/nest`, `@nx/react`, `@nx/js`) with pnpm workspaces and **catalogs**. Pin Node (`.nvmrc`, `engines`) and `packageManager`.
- **apps/web-admin** and **apps/web-portal:** React, Vite, TS, TanStack Router and Query, Tailwind, Vitest + React Testing Library, and Better Auth `createAuthClient` (with `organizationClient({ teams: { enabled: true } })`). Both include a school switcher, and a campus switcher when the active school has more than one campus.
- **apps/api:** NestJS with zod validation, fail-fast env validation, `/health`, and the example domain below.
- **libs/** (`@eduvault/<name>`, Nx-tagged):
  - `api-contract`: zod-based typed contract used by the API and both SPAs. Changing it must break consumers' typecheck.
  - `policy`: Better Auth access-control roles and statements.
  - `shared`: pure TS utilities.
  - `ui`: shared components.
  - `testcontainers`: Postgres test helper.

## Database: raw SQL, no ORM
- **dbmate** `.sql` migrations, a `pg` Pool via a `DB_TOKEN`, **Kysely** as the typed query builder (`` sql`...` `` for complex queries), and **kysely-codegen** types committed to the repo.
- Targets: `db:migrate:up`, `db:reset`, and `db:seed` (deterministic dev state, including two schools, one with two campuses, and a user in both schools). `nx run api:db-start` starts only Postgres.
- Gates: the regenerated Kysely types must match the committed ones, and dbmate's `schema.sql` must be current.

## Tenancy model
- **Organization = the school** (the paying entity: fee account, staff, roles). A user can belong to many schools, with a different role in each (`member` row per school). `session.activeOrganizationId` is the school currently in use.
- **Campus = a Better Auth team** inside the organization (`organization({ teams: { enabled: true } })`). `teamMember` rows say which campuses a member works at, and `session.activeTeamId` is the active campus. The `team` permission in `libs/policy` governs who can create or edit campuses.
- Campus details beyond a name (address and so on) go in a thin domain `campus` table referencing `team.id`. Better Auth's tables are never edited by hand.
- **Organization-level:** the school fee account (`school_account`). **Campus-aware:** `fee_schedule` (nullable `campus_id`, where null applies to every campus) and `student` (a `campus_id`).
- **Domain tables** reference `user.id` and `organization.id` by foreign key, and every school-scoped domain table carries `organization_id`.
- Verify the exact team APIs and generated columns with `npx ctx7@latest` (`/better-auth/better-auth`) and the real `api:auth-generate` output. Record the decisions in an ADR.
- **Out of scope:** schools under separate legal entities or bank accounts. Those are separate organizations, and a school-group concept is not modelled.

## Better Auth (keep minimal)
- `better-auth` + `@thallesp/nestjs-better-auth` (`AuthModule.forRootAsync`), with `bodyParser: false`, `disableGlobalAuthGuard: true`, and `disableTrustedOriginsCors: true`.
- A Nest-free `better-auth-base.ts` shared by the Nest factory and a root `auth.ts` CLI shim. An `api:auth-generate` target emits the auth schema SQL into the migrations. A gate fails if the generated schema differs from the committed one.
- `advanced.database.generateId: false`. Email/password with `autoSignIn`, and no email verification. `admin` and `organization` plugins (teams enabled), with roles in `libs/policy` (owner/admin/teacher/student, plus `team` permissions).
- A `databaseHooks.session.create.before` hook sets the default `activeOrganizationId` to the user's first membership (and `activeTeamId` to their first team in it). Without it, sessions created outside the web flow have no active school and every school-scoped route fails. Users with several schools get an explicit chooser in the SPA.
- Cookies are `httpOnly` + `sameSite: lax`. `trustedOrigins` is an explicit list of both SPA URLs, and `*` only when `NODE_ENV=test`.
- Guards: `SessionAuthGuard` and `OrganizationAuthGuard`, each with a decorator. The organization guard resolves the active school, member role, and active campus via `AuthService.api`, and supplies them to handlers. Banned users count as unauthenticated.

## Example domain (keep minimal)
Only enough to exercise the tenancy rules: `campus` (details), `school_account`, `fee_schedule`, and `student`. Provide a protected CRUD for each, scoped by active school and campus.

## Backend integration tests
Vitest + Supertest against **real Postgres via Testcontainers**:
- Run dbmate migrations before the suite, and isolate each test (transaction rollback or truncate).
- Provide a `baseTest` fixture (`test.extend`) exposing `signUp`, `createOrganization`, `createCampus`, `addMember`, and `promoteToAdmin`.
- Cover:
  - sign-up/sign-in, 401, 403, 404, banned-user rejection, and validation errors.
  - full CRUD on the example resources.
  - **school isolation**: org A can't read org B's data, including for a user in both schools who has A active.
  - **campus isolation**: a teacher assigned to campus 1 can't read campus 2's students, while an owner/admin sees all campuses.
  - **role per school**: the same user is a teacher in school A and an admin in school B, and permissions follow the active school.
  - the default-active-school hook, and switching school via `setActive`.
- Run them as a separate target, `api:test-integration`. Unit tests run separately, and each is scoped to the project it covers.

## Static verification (the agent's feedback loop)
- **Lint and types:** ESLint flat config (typescript-eslint strict, `unused-imports`) and `@nx/enforce-module-boundaries` with tags `scope:web-admin | web-portal | api | shared`. Apps can't import each other, and web can't import api. Prettier check, and strict `tsc --noEmit` per project with no baseline.
- **`knip`:** unused files, exports, and dependencies.
- **Drift gates:** Kysely types, `schema.sql`, and the Better Auth schema.
- **Husky `pre-commit`:** prettier + `nx affected -t lint typecheck`.
- **Scripts:**
  - `validate:quick`: affected-only lint, typecheck, and unit tests. Fast, terse output.
  - `validate`: format:check → lint → typecheck → knip → drift gates → unit → integration → build. Exits non-zero on any failure.

## Agent workflow
- **`CLAUDE.md`:** layout, exact commands, ports, and gotchas. "Never run the full test suite; scope to affected projects." A comment-hygiene rule, and a definition of done: `validate:quick` green, plus integration tests if the API changed.
- **`.claude/settings.json`:** allowlist `pnpm`, `nx`, and `docker compose`. PostToolUse hook runs prettier on edited files, and a Stop hook runs `nx affected -t lint typecheck`.
- **`.claude/skills/run-local/SKILL.md`:** a verified recipe to start Postgres, migrate, seed a dev user, and serve all three apps.

## docs/
- `docs/adr/`: `0000-template.md`, `0001` Nx + catalogs, `0002` Better Auth in NestJS, `0003` raw SQL (dbmate) + Kysely, `0004` verification policy (no browser e2e in `pnpm validate`), `0005` tenancy (organization = school, campus = team, out-of-scope cases). Keep them short and decision-focused.
- `docs/architecture.md`: Mermaid diagram, module boundaries, auth flow, tenancy model, and the required section below.
- `docs/development.md` and `docs/verification.md` (every gate, what it catches, how to fix it).
- A `README.md` of under one page, linking to `docs/`.

### "What Better Auth owns" (required in `docs/architecture.md`)
Document it from the real output of `api:auth-generate`, not from memory:
- **Core tables:** `user`, `session`, `account`, `verification`, with the exact generated columns.
- **`admin` plugin:** the columns it adds to existing tables (e.g. `user.role`, `banned`, `banReason`, `banExpires`, `session.impersonatedBy`).
- **`organization` plugin:** `organization`, `member`, `invitation`, `session.activeOrganizationId`, and, with teams enabled, `team`, `teamMember`, and `session.activeTeamId`. State the mapping: organization = school, team = campus, and `member.role` = the roles in `libs/policy`.
- **Endpoints:** the `/api/auth/*` route groups (core, admin, organization), reached by SPAs only through `createAuthClient`.
- **Ownership boundary:** Better Auth owns the tables and endpoints above. Eduvault owns the domain tables, role permissions, guards, and the active-school/campus scoping of every query.
- **Workflow:** `api:auth-generate` emits SQL, which is committed as a dbmate migration, and the drift gate keeps them in sync. After any auth-option change, regenerate, review the diff, and re-run the Kysely codegen.

## Working method
1. Read the Fogado reference, then output the planned tree, Nx tags, and target graph **before** writing files.
2. Build in layers, committing after each: workspace and lint boundaries → libs → DB + Kysely → API + Better Auth → example domain → integration tests → SPAs → hooks and Claude config → docs.
3. Run every gate for real and show the output. Don't claim a pass you haven't run. If something can't run, say so and list what's unverified.

## Acceptance criteria
- [ ] `pnpm install && pnpm validate` passes from a clean clone.
- [ ] `docker compose up` starts Postgres, and all three apps run locally, with `/health` returning 200.
- [ ] A user can sign up and sign in via Better Auth from each SPA, and a multi-school user can switch school (and campus) in both.
- [ ] Integration tests pass against a real Postgres container, covering auth, authorization, school isolation, campus isolation, per-school roles, and CRUD.
- [ ] A cross-app import fails `nx lint`.
- [ ] A contract change breaks `typecheck` in a consuming SPA.
- [ ] A schema change without regenerating the Kysely types fails the drift gate.
- [ ] `docs/` contains the ADRs and guides above, including "What Better Auth owns".

## Superseded in part
The original goal excluded browser e2e and CI/CD. Both are now allowed, with limits:
- **CI** is allowed: `.github/workflows/validate-pr.yml` runs `pnpm validate`. Deployment and infrastructure code are still out of scope.
- **Playwright e2e** is allowed as an opt-in project, `apps/web-e2e` (`nx run web-e2e:e2e`), driven by the `eduvault-e2e` skill. It is not part of `pnpm validate`, `validate:quick` or CI; nothing in the default loop starts a browser.
- Decision record: ADR 0004.

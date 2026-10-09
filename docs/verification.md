# Verification

Every gate, what it catches, and how to fix it. `pnpm validate` runs them in this order and exits non-zero on the first failure; `pnpm validate:quick` runs lint, typecheck and unit tests on affected projects.

| #   | Gate        | Command                       | Catches                                                                                                                     | Fix                                                                            |
| --- | ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Format      | `pnpm format:check`           | Files not matching Prettier                                                                                                 | `pnpm format`                                                                  |
| 2   | Lint        | `nx run-many -t lint`         | typescript-eslint strict (type-checked), unused imports, **module boundary violations**, [convention rules](conventions.md) | Fix the code. For a boundary error, move shared code into a `scope:shared` lib |
| 3   | Typecheck   | `nx run-many -t typecheck`    | Strict `tsc --noEmit` per project, no baseline. **A change to `api-contract` fails every consumer that uses the old shape** | Update the consumers to the new contract                                       |
| 4   | Knip        | `pnpm knip`                   | Unused files, exports and dependencies; unlisted dependencies                                                               | Delete the dead code, or add the dependency to the right `package.json`        |
| 5   | Drift       | `pnpm drift`                  | See below                                                                                                                   | `pnpm drift:fix`, review, commit                                               |
| 6   | Unit tests  | `nx run-many -t test`         | Logic in libs, API units, SPA components (fake API and auth clients). Never starts Docker                                   | Fix the code or the test                                                       |
| 7   | Integration | `nx run api:test-integration` | Auth, 401/403/404, validation, CRUD, school isolation, campus isolation, per-school roles, session hook, `setActive`        | See below                                                                      |
| 8   | Build       | `nx run-many -t build`        | Production bundles that no longer compile or resolve                                                                        | Fix the import or config named in the error                                    |

## Drift gates (`pnpm drift`)

One throwaway Postgres container runs the committed migrations, then:

1. **Better Auth satisfied**: `better-auth generate` against the migrated database must report nothing missing. Fails when auth options need a table or column that no migration provides.
2. **Auth snapshot**: a fresh generation against an empty database must equal `apps/api/db/auth-schema.snapshot.sql`.
3. **`schema.sql`**: a `pg_dump` from the container must equal `apps/api/db/schema.sql`.
4. **Kysely types**: `kysely-codegen` output must equal `apps/api/src/db/db-types.ts`.

A failure prints a unified diff of the first 40 lines. Fix with `pnpm drift:fix`; for a new Better Auth requirement review the generated migration before committing. Needs Docker.

## Integration tests

Each test truncates Better Auth and domain tables first, with the single `TRUNCATE "user", "organization", "verification" RESTART IDENTITY CASCADE` in `apps/api/test/support/base-test.ts`; everything else cascades from `user` or `organization`. A new table that references neither joins that statement, once, never per spec.

Every module's spec carries a `describe('isolation')` block built on `twoSchools()` that covers the applicable cases of the twelve-case table in [conventions.md](conventions.md#isolation-cases): 1 to 7 now, 8 to 12 as their slices land (class scope M2.3, portal M2.8, money M3.1, approvals M3.5, acting M1.5). A new table or route without its block is not reviewable. A failing isolation test means a query is missing `organization_id` or the campus scope. A 403 where 200 was expected usually means the role lacks the permission in `libs/policy`, or the session has no active school (use `signIn` after `createOrganization`/`addMember`).

## Automatic checks

- **Pre-commit (Husky):** Prettier on staged files, then `nx affected -t lint typecheck`.
- **Claude Code:** a PostToolUse hook runs Prettier on each edited file; a Stop hook runs `nx affected -t lint typecheck` and refuses to finish while it fails.

## Browser e2e: required before a PR is ready

Required for every change that touches product code ([ADR 0004, amended](adr/0004-verification-policy.md#amended-2026-10-09-browser-e2e-is-required)): web apps, `libs/ui`, `libs/shared`, API source, migrations, seed, `libs/api-contract` or `libs/policy`. `bash .claude/skills/eduvault-e2e/scripts/e2e-gate.sh` prints `browser` for those and `skip` for docs, tests, tooling and `.claude`-only diffs. A run that ends `BLOCKED (environment)` is not a pass: start the stack and run again. It stays outside `pnpm validate`, `validate:quick` and CI, because there is no Playwright project; the definition of done in `CLAUDE.md` requires it instead.

| Need                        | Command                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Run against the local stack | `pnpm dev` in one shell, then follow `.claude/skills/eduvault-e2e/SKILL.md`            |
| Create personas             | `bash .claude/skills/eduvault-e2e/scripts/provision.sh`                                |
| Reverse a run's data        | `bash .claude/skills/eduvault-e2e/scripts/cleanup.sh "$PWD/tmp/e2e/<run>/ledger.json"` |

The browser is driven through the `playwright-cli` skill and the API through `curl`; there is no Playwright project in the workspace. Personas are provisioned through the real API, screenshots go to `tmp/e2e/<run>/`, and a run's schools, students and user accounts stay until `pnpm db:reset`, because students and money are never deleted (cleanup reverses only empty campuses and closes sessions). If the stack is down the run stops with `BLOCKED (environment)`, which is not a pass.

## Not verified by any gate

No script enforces the browser e2e run: `pnpm validate` and CI pass without it, so it is required by the definition of done and checked in review and by `/ship`. Within the default loop, sign-in and school/campus switching are covered by component tests with fake clients.

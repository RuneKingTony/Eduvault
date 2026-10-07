# Verification

Every gate, what it catches, and how to fix it. `pnpm validate` runs them in this order and exits non-zero on the first failure; `pnpm validate:quick` runs lint, typecheck and unit tests on affected projects.

| #   | Gate        | Command                       | Catches                                                                                                                           | Fix                                                                            |
| --- | ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Format      | `pnpm format:check`           | Files not matching Prettier                                                                                                       | `pnpm format`                                                                  |
| 2   | Lint        | `nx run-many -t lint`         | typescript-eslint strict findings, unused imports, **module boundary violations** (cross-app or web-to-api imports, tag breaches) | Fix the code. For a boundary error, move shared code into a `scope:shared` lib |
| 3   | Typecheck   | `nx run-many -t typecheck`    | Strict `tsc --noEmit` per project, no baseline. **A change to `api-contract` fails every consumer that uses the old shape**       | Update the consumers to the new contract                                       |
| 4   | Knip        | `pnpm knip`                   | Unused files, exports and dependencies; unlisted dependencies                                                                     | Delete the dead code, or add the dependency to the right `package.json`        |
| 5   | Drift       | `pnpm drift`                  | See below                                                                                                                         | `pnpm drift:fix`, review, commit                                               |
| 6   | Unit tests  | `nx run-many -t test`         | Logic in libs, API units, SPA components (fake API and auth clients). Never starts Docker                                         | Fix the code or the test                                                       |
| 7   | Integration | `nx run api:test-integration` | Auth, 401/403/404, validation, CRUD, school isolation, campus isolation, per-school roles, session hook, `setActive`              | See below                                                                      |
| 8   | Build       | `nx run-many -t build`        | Production bundles that no longer compile or resolve                                                                              | Fix the import or config named in the error                                    |

## Drift gates (`pnpm drift`)

One throwaway Postgres container runs the committed migrations, then:

1. **Better Auth satisfied**: `better-auth generate` against the migrated database must report nothing missing. Fails when auth options need a table or column that no migration provides.
2. **Auth snapshot**: a fresh generation against an empty database must equal `apps/api/db/auth-schema.snapshot.sql`.
3. **`schema.sql`**: a `pg_dump` from the container must equal `apps/api/db/schema.sql`.
4. **Kysely types**: `kysely-codegen` output must equal `apps/api/src/db/db-types.ts`.

A failure prints a unified diff of the first 40 lines. Fix with `pnpm drift:fix`; for a new Better Auth requirement review the generated migration before committing. Needs Docker.

## Integration tests

Each test truncates Better Auth and domain tables first. A failing isolation test means a query is missing `organization_id` or the campus scope. A 403 where 200 was expected usually means the role lacks the permission in `libs/policy`, or the session has no active school (use `signIn` after `createOrganization`/`addMember`).

## Automatic checks

- **Pre-commit (Husky):** Prettier on staged files, then `nx affected -t lint typecheck`.
- **Claude Code:** a PostToolUse hook runs Prettier on each edited file; a Stop hook runs `nx affected -t lint typecheck` and refuses to finish while it fails.

## Opt-in browser e2e

Not a gate: it is outside `pnpm validate`, `validate:quick` and CI. Run it when a diff touches `apps/web-admin`, `apps/web-portal` or UI-visible API (`bash .claude/skills/eduvault-e2e/scripts/e2e-gate.sh` prints `skip`, `api` or `browser`).

| Need                        | Command                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| One-time browser install    | `pnpm --filter @eduvault/web-e2e exec playwright install chromium`         |
| Run against the local stack | `pnpm dev` in one shell, then `nx run web-e2e:e2e`                         |
| Reverse a failed run's data | `pnpm --filter @eduvault/web-e2e cleanup "$PWD/tmp/e2e/<run>/ledger.json"` |

The run provisions owner, admin, teacher, student and foreign-school personas through the real API, writes screenshots to `tmp/e2e/<run>/`, and deletes the schools, campuses and students it created when every test passes (user accounts cannot be removed through the API and remain until `pnpm db:reset`). If the stack is down the run stops with `BLOCKED (environment)`, which is not a pass. The skill is `.claude/skills/eduvault-e2e/SKILL.md`.

## Not verified by any gate

Browser behaviour in the default loop. The SPAs' sign-in and school/campus switching are covered by component tests with fake clients; against the real API they are covered only by the opt-in e2e run or by hand with the `run-local` recipe.

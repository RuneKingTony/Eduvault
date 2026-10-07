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

Each test truncates Better Auth and domain tables first. A failing isolation test means a query is missing `organization_id` or the campus scope. A 403 where 200 was expected usually means the role lacks the permission in `libs/policy`, or the session has no active school (use `signIn` after `createOrganization`/`addMember`).

## Automatic checks

- **Pre-commit (Husky):** Prettier on staged files, then `nx affected -t lint typecheck`.
- **Claude Code:** a PostToolUse hook runs Prettier on each edited file; a Stop hook runs `nx affected -t lint typecheck` and refuses to finish while it fails.

## Not verified by any gate

Browser behaviour. The SPAs' sign-in and school/campus switching are covered by component tests with fake clients; against the real API they are checked by hand with the `run-local` recipe.

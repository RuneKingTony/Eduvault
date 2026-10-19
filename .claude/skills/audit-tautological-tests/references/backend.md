# Backend (apps/api, libs/policy, libs/shared)

Where Eduvault's backend tests can be tautological, from the first audit.

## Layers

- **Unit specs** (`apps/api/src/**/*.spec.ts`, never start Docker) test services against hand-written fakes (`fake-*.repository.ts`) or `vi.fn()` mocks.
- **Integration specs** (`apps/api/test/*.integration.spec.ts`) run against real Postgres and carry the tenancy, permission and constraint rules (`testing-002`). They are the oracle for any rule that lives in SQL.

The design is unit tests for service branching and integration tests for SQL. A unit test is only worth keeping when it checks branching the service owns.

## Patterns to look for

| Pattern                                   | Example                                                                        | Grade                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Pass-through echo                         | `expect(await service.roll(ctx)).toEqual(repository.rollCounts)`               | Tautology                                                            |
| Every field echoed from a fake or mock    | `recordingOptions` asserting `accounts`, `payers`, `students` from the stubs   | Tautology                                                            |
| The fake owns the rule                    | retire-once asserted against a fake whose `retire` checks `retiredAt === null` | Tautology (test of the fake)                                         |
| Parameters of a mocked `Pool`             | `expect(pool.query).toHaveBeenCalledWith(expect.any(String), [...])`           | Tautology or change detector: whether the SQL is right is unknowable |
| Oracle is the implementation              | `requestHash: paymentRequestHash(body)`                                        | Weak oracle: use a literal for money paths                           |
| `toBeDefined()` or `not.toBeNull()` alone | `resolves.toBeDefined()`                                                       | Weak oracle                                                          |
| Error class without the message           | `rejects.toBeInstanceOf(ConflictException)` where the message is the contract  | Weak oracle                                                          |
| Copy and constant pins in `libs/policy`   | `expect(PERM_HELP['x']).toBe('<literal>')`, "has the six starter roles"        | Change detector                                                      |

## Not tautological

- `with-school-lock.spec.ts`: mocks `pg`, but retry, timeout and release logic is real.
- `dashboard-money.service.spec.ts`: real arithmetic and filtering.
- Invariant loops in `libs/policy` (starter permissions exist in `ALL_PERMISSIONS`) and guardrails tied to a policy (`no student:delete`, `risk-001`).
- Integration specs that assert a database refusal (`invoice-constraints`).
- 404/403 branch tests of a service, when the SQL scope is covered in an `isolation` block.

## The fakes

Each fake is a second implementation of its repository. A rule written in a fake is tested against the fake's idea of Postgres. Two repositories have a contract spec that runs the same scenarios against the fake and Postgres: the FileStore (`apps/api/test/file-store.contract.ts`, both drivers) and the store items (`apps/api/test/store-repository.contract.ts` with `store-repository.integration.spec.ts`, which found and now guards the `item_active_key` drift). The other fakes have none.

For each fake, record: does it implement a scope filter, state transition or uniqueness rule, and is there an integration twin or a contract spec? Fakes without one can drift silently.

Compare every rule in a fake with the real constraint. In the first audit of `store`, `FakeStoreRepository.clashes()` (the rename path) compared `displayName` only, while the real index `item_active_key` covers `organization_id, kind, name, variant, class_level_id` (`apps/api/db/schema.sql`), so a test of a rename collision leaned on a rule Postgres does not have. A fake method with an unused `_scope` or `_organizationId` parameter (the scanner's `fake-ignores-scope`) cannot prove any scope claim; tests that use it only prove the not-found branch.

## Remedies

1. Delete pass-through echoes and tests whose rule has an integration twin.
2. Add a repository contract spec (the `store-repository.contract.ts` pattern: literal-titled scenarios registered through the runner's `test`, one runner for the fake and one for Postgres) for fakes that carry rules. Make the fake school-aware so the contract can test isolation. Write the scenarios against Postgres first, so the contract describes the real behaviour.
3. Where a service has no branching, drop the fake and let integration cover it.
4. Replace `toBeDefined()` with `toMatchObject` on the fields that matter; add the message to class-only error checks.
5. Use a literal expected value for money amounts, and a golden literal for any hash that is persisted (`requestHash` is stored, so changing its canonical form would turn replays of old references into 409s). A hash that is only compared within one run needs no golden value: computing it with the production function is fine and a literal there would be a change detector.
6. Lint what is mechanical: `@vitest/eslint-plugin` has `no-restricted-matchers` (ban `toBeDefined`, `toBeTruthy`) and `require-to-throw-message`. No rule catches echoes or a class-only error check, so those stay a review job.
7. Mutation testing (Stryker with the Vitest runner) scoped to one module quantifies pseudo-tested methods. Run it manually, not in `pnpm validate`, until the numbers justify a gate.

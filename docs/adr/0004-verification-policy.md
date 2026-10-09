# Verify with static checks and API integration tests; no browser e2e in the default loop

- Status: accepted, superseded in part (see Superseded in part)
- Date: 2026-10-07

## Context

The repo is edited mostly by an agent that needs a fast, deterministic yes/no after every change. Browser e2e is slow and flaky, and tells an agent little about why it failed.

## Decision

Confidence comes from, in order: formatting, ESLint (typescript-eslint strict plus module boundaries), strict `tsc --noEmit` per project, knip, the three drift gates, unit tests, API integration tests against real Postgres, and a production build. `pnpm validate` runs them in that order and stops at the first failure; `pnpm validate:quick` runs lint, typecheck and unit tests on affected projects only.

- Module boundaries: apps cannot import each other, web cannot import api, `shared` depends only on `shared`. Violations fail `nx lint`.
- A change to `libs/api-contract` breaks `typecheck` in every consumer that uses the changed shape.
- There is no browser e2e in `pnpm validate`, and no deployment or infrastructure code. The only container is Postgres for local development.
- The SPAs are covered by component tests with a fake API client and a fake auth client. Sign-in and school switching against the real API are verified by hand, with the `run-local` recipe.

## Alternatives considered

- **Playwright e2e in `pnpm validate`**: rejected for speed and flakiness. As an opt-in project it is allowed (see Superseded in part).
- **Mocking Postgres in API tests**: rejected; tenancy rules live in SQL and foreign keys.

## Consequences

- Whole-stack UI regressions are caught by a person, not a gate.
- Docker is a prerequisite for `pnpm validate`.

## Superseded in part

Two parts of this decision were relaxed after it was written:

- **CI is allowed.** `.github/workflows/validate-pr.yml` runs `pnpm validate` on pull requests. It adds no gate of its own; `pnpm validate` stays the single definition of "green".
- **Opt-in browser e2e is allowed.** The `eduvault-e2e` skill drives the `run-local` stack with `playwright-cli` and `curl`, only when a diff touches `apps/web-admin`, `apps/web-portal` or UI-visible API. It has no project in the workspace, so it is kept out of `pnpm validate`, `validate:quick` and CI. The static-check-first order above is unchanged.

Still true: no deployment or infrastructure code.

## Amended 2026-10-09: browser e2e is required

Replaces the "Opt-in browser e2e is allowed" paragraph above.

- **Required before a PR is ready.** Every change whose diff touches product code (`apps/web-admin`, `apps/web-portal`, `libs/ui`, `libs/shared`, `apps/api` source, migrations or seed, `libs/api-contract`, `libs/policy`) must pass an `eduvault-e2e` run on the local stack, with browser steps, before its PR leaves draft. API-only diffs run browser steps too, because the screens read from them; the curl checks stay as part of the run. Docs, tests, tooling and `.claude`-only diffs need none.
- **A run that cannot happen is not a pass.** `BLOCKED (environment)` stops the change until the stack runs; it no longer lets `/ship` push.
- **Still outside `pnpm validate`, `validate:quick` and CI.** There is no Playwright project, so the speed and flakiness reasons above still keep browser e2e out of the deterministic gates. The run is an agent-driven check that the definition of done requires, not a gate a script enforces.
- Decided by the engineer; logged as D-051 in the technical reference.

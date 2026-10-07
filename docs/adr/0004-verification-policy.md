# Verify with static checks and API integration tests; no browser e2e

- Status: accepted
- Date: 2026-10-07

## Context

The repo is edited mostly by an agent that needs a fast, deterministic yes/no after every change. Browser e2e is slow and flaky, and tells an agent little about why it failed.

## Decision

Confidence comes from, in order: formatting, ESLint (typescript-eslint strict plus module boundaries), strict `tsc --noEmit` per project, knip, the three drift gates, unit tests, API integration tests against real Postgres, and a production build. `pnpm validate` runs them in that order and stops at the first failure; `pnpm validate:quick` runs lint, typecheck and unit tests on affected projects only.

- Module boundaries: apps cannot import each other, web cannot import api, `shared` depends only on `shared`. Violations fail `nx lint`.
- A change to `libs/api-contract` breaks `typecheck` in every consumer that uses the changed shape.
- There is no browser e2e, and no deployment or infrastructure code. The only container is Postgres for local development.
- The SPAs are covered by component tests with a fake API client and a fake auth client. Sign-in and school switching against the real API are verified by hand, with the `run-local` recipe.

## Alternatives considered

- **Playwright e2e**: rejected for speed and flakiness.
- **Mocking Postgres in API tests**: rejected; tenancy rules live in SQL and foreign keys.

## Consequences

- Whole-stack UI regressions are caught by a person, not a gate.
- Docker is a prerequisite for `pnpm validate`.

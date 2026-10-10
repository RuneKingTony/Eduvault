# Testing

- `[testing-001]` Never run the full test suite. Scope to affected projects with pnpm validate:quick or nx run <project>:test; run pnpm validate only when asked.
  - why: The full suite is slow and starts Docker; affected-only keeps the loop fast with the same signal for the change.
  - evidence: score 0 · 0 decisions · last confirmed 2026-10-07 · confidence: high

- `[testing-002]` Test tenancy and permission rules against real Postgres in api:test-integration, not with mocks. Browser e2e (the eduvault-e2e skill, driven by playwright-cli) is opt-in and runs only when the diff touches web-admin, web-portal or UI-visible API.
  - why: Tenancy lives in SQL and foreign keys, which a mock cannot exercise; browser e2e is slow so it must earn its place.
  - evidence: score 2.5 · 4 decisions · last confirmed 2026-10-09 · confidence: high

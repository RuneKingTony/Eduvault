# Process

- `[process-001]` Use conventional commits with a scope from the commit-conventional table, and never add a Co-Authored-By trailer. Branches are edu-<issue>-<slug>; PRs are drafts titled EDU-<n>: ...; diff against origin/main. Push straight to main only when the engineer explicitly chooses it.
  - why: A uniform history drives changelogs and scoped review, and authorship stays with the engineer.
  - evidence: score 2 · 4 decisions · last confirmed 2026-10-09 · confidence: high

- `[process-002]` Plan the full scope the engineer asks for instead of deferring parts to keep a change small. For feature work, make it reviewable by splitting delivery into sequential phases, one goal and one PR each, every phase green before the next starts. Mechanical changes follow process-003.
  - why: Offered narrower or deferred scope, the engineer chose the broader option, and accepted phased delivery to keep each change reviewable.
  - evidence: score 9.5 · 7 decisions · last confirmed 2026-10-09 · confidence: high

- `[process-003]` Deliver mechanical or tooling-wide changes (refactors across modules, lint rules and their fixes) as one issue and one PR, even when the diff is large. Phase only feature work, or when the engineer asks.
  - why: Twice offered phased delivery for a cross-module refactor and a lint rollout, the engineer chose a single change and PR.
  - evidence: score 4 · 2 decisions · last confirmed 2026-10-09 · confidence: medium

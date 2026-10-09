# Process

- `[process-001]` Use conventional commits with a scope from the commit-conventional table, and never add a Co-Authored-By trailer. Branches are edu-<issue>-<slug>; PRs are drafts titled EDU-<n>: ...; diff against origin/main. With no git remote configured, committing directly on main is acceptable.
  - why: A uniform history drives changelogs and scoped review, and authorship stays with the engineer.
  - evidence: score 1 · 2 decisions · last confirmed 2026-10-07 · confidence: high

- `[process-002]` Plan the full scope the engineer asks for instead of deferring parts to keep a change small. Make it reviewable by splitting delivery into sequential phases, one goal and one PR each, every phase green before the next starts.
  - why: Offered narrower or deferred scope, the engineer chose the broader option, and accepted phased delivery to keep each change reviewable.
  - evidence: score 9 · 6 decisions · last confirmed 2026-10-09 · confidence: high

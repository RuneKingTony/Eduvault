# Tenancy

- `[tenancy-001]` A row outside the caller's school or campus answers 404, never 403. Use 403 only when the caller can see the resource but lacks the permission for the action.
  - why: A 403 confirms the id exists in another school, so ids leak across tenants.
  - evidence: score 0 · 0 decisions · last confirmed 2026-10-07 · confidence: high

- `[tenancy-002]` Every school-scoped table carries organization_id and every query filters by the active school and the campus scope. Owners and admins see all campuses; everyone else sees only campuses they belong to. Add an isolation test with each new table or route.
  - why: A single missing filter leaks one school's students or money to another.
  - evidence: score 0 · 0 decisions · last confirmed 2026-10-07 · confidence: high

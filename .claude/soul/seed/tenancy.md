# Tenancy

- `[tenancy-001]` A row outside the caller's school or campus answers 404, never 403. Use 403 only when the caller can see the resource but lacks the permission for the action.
  - why: A 403 confirms the id exists in another school, so ids leak across tenants.
  - evidence: score 1 · 2 decisions · last confirmed 2026-10-07 · confidence: high

- `[tenancy-002]` Every school-scoped table carries organization_id and every query filters by the active school and the campus scope. Owners and admins see all campuses; everyone else sees only campuses they belong to. Add an isolation test with each new table or route.
  - why: A single missing filter leaks one school's students or money to another.
  - evidence: score 7 · 14 decisions · last confirmed 2026-10-09 · confidence: high

- `[tenancy-003]` Default to least privilege. A new member, role or platform user starts with no access, platform access inside a school is read-only unless a reason is given, and narrower scopes (own records, assigned classes) ship with the feature they protect rather than later.
  - why: The engineer asked for least privilege outright and chose the stricter, earlier-scoped option when offered a deferral.
  - evidence: score 7 · 6 decisions · last confirmed 2026-10-09 · confidence: high

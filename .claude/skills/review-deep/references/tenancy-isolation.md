# Tenancy isolation (sonnet)

Also pass `CONTEXT.md` and `docs/adr/0005-tenancy.md`. Relevant paths: `apps/api/src/app/modules/**`, `apps/api/src/app/common/campus-*.ts`, `apps/api/db/migrations/**`, `apps/api/test/tenancy.integration.spec.ts`.

```
Dimension: tenancy isolation. Organization = school, team = campus. A user must never read or change another school's rows, nor a campus they do not belong to (owners and admins see every campus of their school).

Look for:
- A new school-scoped table without organization_id and a foreign key to organization, or a campus reference that is not the composite (campus_id, organization_id) foreign key
- A Kysely query on a school-scoped table with no filter on ctx.organizationId, including updates, deletes, joins and subqueries (a join can pull in another school's row)
- A query that ignores the campus scope for a campus-aware table (student, fee_schedule). A null campus_id on fee_schedule means every campus of that school, not every school
- Lookups by id alone (findById, where id = $1) with no organization check: an IDOR across schools
- Out-of-scope rows answering 403 or a message that confirms the row exists, instead of 404
- organization_id or campus_id taken from the request body, params or query instead of the session context
- Writes that accept a campus_id without checking it belongs to the caller's school and that the caller may use it
- Raw SQL or helper functions that bypass the shared scoping helpers in common/
- A new table or route with no case in the tenant-isolation integration tests (a foreign-school user gets 404 and sees no rows)
- Better Auth tables edited by hand, or a default team assumed to exist

Clean line: "No tenancy isolation issues found."
```

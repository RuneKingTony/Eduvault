# Resolve permissions from the database on every request

- Status: accepted
- Date: 2026-10-09

## Context

Access was four fixed role names checked by name in `libs/policy`. Schools need roles they can combine and edit, and a role change has to apply at once: a person whose access was just removed must not keep it until their session expires. Better Auth already stores roles per school in `organizationRole` when dynamic access control is on.

## Decision

- Permissions are a code-defined list in `libs/policy` (`statements.ts`). `owner` (every permission, including ones added later) and `member` (none) live in code; every other role is an `organizationRole` row keyed by a slug, with an editable label. Six starter roles are written for each school by `syncStarterRoles`.
- `member.role` holds comma-separated slugs. On every guarded request `OrganizationAuthGuard` reads one row set, `SELECT role, permission FROM "organizationRole" WHERE "organizationId" = $1 AND role = ANY($2)`, unions it with the code roles through `resolvePermissions`, and checks the handler's permission before any row is read. No cache.
- The result is `OrgContext` (`roles`, `permissions`, `isOwner`, campus scope, class scope, student scope, acting). The campus scope is `'all'` for a holder of `campus:readAll`, otherwise the member's campuses.
- `GET /me/permissions` returns the same union; the SPAs gate nav, routes and controls from it and never from role names.
- Order of answers: 401 without a session, 403 `NoSchool` without an active school, 403 `Missing permission <resource>:<action>` for a visible route the caller may not use, 404 for a row outside the caller's school or campus.
- Two layers: Better Auth's own routes (teams, invitations, members) check `organization`, `member`, `invitation`, `team` and `ac` against the `ac` it is given (`betterAuthAc`, `betterAuthRoles`: `owner` holds everything, `member` nothing). The app list drives `can()`, the capability areas and `/me/permissions`, and Better Auth's internal statements never appear there.

## Alternatives considered

- **Roles and permissions in the session** (the earlier "no round trip" choice in ADR 0002): cheap, but a role change would not apply until the session was refreshed.
- **A per-process cache with invalidation**: saves one indexed read per request and adds invalidation bugs across API instances. Revisit only if the read shows up in a profile.
- **Better Auth's `hasPermission` per request**: it knows only its own statements and the code roles, so it cannot express the app's permissions.

## Consequences

- One extra indexed read per guarded request, on `organizationRole("organizationId")`.
- A role edit, or a member's role change, applies on the next request. The SPA refetches `/me/permissions` on window focus and after any 403.
- Every new permission is added to `statements.ts` and to the starter roles in the same change; existing schools get it through `syncStarterRoles`, which rewrites only starter roles nobody has edited.
- Better Auth's campus routes need `member:update` to enrol a member, which no starter role holds, so the API enrols a campus creator through Better Auth's adapter after its own `team:create` check.

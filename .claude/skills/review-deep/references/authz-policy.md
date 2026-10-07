# Authz / policy (sonnet)

Relevant paths: `libs/policy/src/**`, `apps/api/src/app/common/auth/**`, every `*.controller.ts`.

```
Dimension: authorization and the policy library. Roles (owner, admin, teacher, student) and their permission statements live in libs/policy; handlers enforce them with @OrganizationAuth(resource, action).

Look for:
- A new or changed controller handler with no @OrganizationAuth (or @SessionAuth where signed-in-only is genuinely intended). It must be on each handler, not the class, so the guard runs once
- @OrganizationAuth() with no resource and action on a handler that reads or changes school data (school membership alone is not authorization)
- A resource/action that is too broad for what the handler does (a read permission guarding a write, teacher granted an owner-only action)
- Changes to libs/policy statements or role grants that widen access without a matching test in roles.spec.ts, or that remove a deny the API depends on
- A new resource added to statements without every role being given an explicit decision
- Ownership checks missing on top of the role check where the role is not enough (a student reading another student's record, a teacher touching a class they do not teach)
- Authorization done in the service from client-supplied role or user ids instead of the session
- Guards or decorators changed so that a thrown error becomes a pass, or ordering of guards changes
- Banned or unauthenticated users able to reach a new route
- Sensitive routes missing rate limiting, input validation (zod pipe) or allow-listed body fields (mass assignment)
- Secrets, tokens or cookie options weakened in the Better Auth config

Clean line: "No authorization or policy issues found."
```

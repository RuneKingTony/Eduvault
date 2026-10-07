# Run Better Auth inside NestJS and keep its options Nest-free

- Status: accepted
- Date: 2026-10-07

## Context

Authentication, sessions, organizations and campuses (teams) come from Better Auth. The API needs its guards to know the active school and campus, and the Better Auth CLI needs the same options to generate a schema.

## Decision

- `@thallesp/nestjs-better-auth` mounts Better Auth through `AuthModule.forRootAsync` with `disableGlobalAuthGuard: true` and `disableTrustedOriginsCors: true`; the Nest app is created with `bodyParser: false` so Better Auth reads its own bodies.
- Options live in `better-auth-base.ts` with no Nest imports. The Nest factory (`better-auth.ts`) and the CLI shim (`apps/api/auth.ts`) both build from it.
- `advanced.database.generateId: false`: the database mints ids. Better Auth's generated SQL has no default for that, so `api:auth-generate` adds `DEFAULT gen_random_uuid()::text` to every primary key when it writes the migration.
- Cookies are `httpOnly` and `sameSite: lax`. `trustedOrigins` is the two SPA URLs; `*` only when `NODE_ENV=test`. CORS is ours, restricted to the same two origins.
- Our guards (`SessionAuthGuard`, `OrganizationAuthGuard`) call `AuthService.api` for the session, active member and teams. Banned users count as unauthenticated. Permission checks use `can()` from `libs/policy`, the same roles Better Auth is configured with.
- A `databaseHooks.session.create.before` hook gives every new session the user's first school and first campus in it.

## Alternatives considered

- **The library's global auth guard**: it cannot express "needs an active school and this permission", so every route would re-check by hand.
- **Calling `auth.api.hasPermission` per request**: an extra round trip for a decision the pure role map already makes.

## Consequences

- Changing an auth option means regenerating and reviewing the schema (`api:auth-generate`), then the Kysely types.
- Better Auth's declared types omit plugin fields when plugins come from a shared factory, so `AuthContextService` narrows the session with a local `PluginSession` type.

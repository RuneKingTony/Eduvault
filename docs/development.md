# Development

## Prerequisites

Node 24 (`.nvmrc`), pnpm 10 (`packageManager`), Docker. `pnpm install` also installs the Husky hook.

## Everyday loop

```sh
pnpm validate:quick      # lint + typecheck + unit tests, affected projects only
pnpm validate:one api    # the same three targets for named projects (space-separated)
nx run api:test-integration   # when API, policy, contract or migrations changed
```

`validate:quick` diffs against `origin/main` (`defaultBase` in `nx.json`), so run `git fetch` first, and runs two tasks at a time (`--parallel=2`) to bound memory. A change to `libs/api-contract`, `libs/policy` or `libs/shared`, or to `tsconfig.base.json`, the root ESLint config or `pnpm-lock.yaml`, widens the affected set; use `validate:one` for a small change you know is local. Preview the set with `pnpm nx show projects --affected`.

Never run an unscoped test command across the monorepo. `pnpm validate` runs everything; it is for a final check, not the inner loop.

## Running the stack

```sh
pnpm db:up && pnpm db:seed && pnpm dev
```

| Service                        | URL                                  |
| ------------------------------ | ------------------------------------ |
| API                            | http://localhost:3000                |
| web-admin                      | http://localhost:4200                |
| web-portal                     | http://localhost:4201                |
| Postgres                       | localhost:5434                       |
| MinIO (optional, profile `s3`) | localhost:9100 (API), 9101 (console) |

Seeded accounts all use the password `password123`; the table is in `.claude/skills/run-local/SKILL.md`. `GET /health` returns 200 when the API can reach Postgres.

The API reads `apps/api/.env.local` (created from `.env.example`) and refuses to start if a variable is missing or malformed, naming each one.

## File storage (optional S3)

Files go to Postgres (`file_blob`) unless `FILE_STORE_DRIVER=s3` ([ADR 0007](adr/0007-s3-compatible-file-store.md)). To try the S3 driver locally:

| Task                          | Command                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Start MinIO and make a bucket | `nx run api:s3-start` (compose profile `s3`; API :9100, console :9101, login `eduvault` / `eduvault-secret`)  |
| Switch the API to it          | uncomment the `FILE_STORE_DRIVER` and `S3_*` lines in `apps/api/.env.local`, restart the API                  |
| Dry-run the copy              | `nx run api:files-copy --args="--from=postgres --to=s3"` (prints counts; exits non-zero on a mismatch or gap) |
| Copy for real                 | add `--apply`; it is idempotent, verifies each object's SHA-256 and deletes nothing                           |

Cutover is copy, verify, switch the driver, then copy and verify once more. Roll back by switching to `postgres`; after uploads on S3, run `--from=s3 --to=postgres --apply` first. The bucket must exist, with versioning on where the provider offers it (Cloudflare R2 does not offer it; see [ADR 0009](adr/0009-deploy-staging-to-render.md)); the app only checks it at boot. `file_blob` stays until a later migration drops it, no sooner than 30 days after a clean verify.

## Staging (Render)

[`render.yaml`](../render.yaml) describes staging: a Postgres 17 database, the API as a web service, and `web-admin` and `web-portal` as static sites. Files go to a Cloudflare R2 bucket ([ADR 0009](adr/0009-deploy-staging-to-render.md)). Deploys are manual (`autoDeploy: false`) until CI deploys them. Staging holds synthetic data only.

Every host, domain and secret is entered in the Render dashboard (`sync: false`), because the domain is the owner's and nothing secret belongs in git. This table is the one list of staging variables: `render.yaml`, `apps/api/.env.example` and ADR 0009 point here, and a spec fails when the blueprint and this section drift apart.

| Variable                                                                          | Where it is set | Must be                                                                                                              |
| --------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NODE_VERSION`                                                                    | blueprint       | `24`, on all three services, as in `.nvmrc`                                                                          |
| `NODE_ENV`                                                                        | blueprint       | `production` (secure cookies, sign-in rate limit)                                                                    |
| `DATABASE_URL`                                                                    | blueprint       | the database's connection string, wired by Render                                                                    |
| `BETTER_AUTH_SECRET`                                                              | blueprint       | generated by Render, never reused from another environment                                                           |
| `BETTER_AUTH_URL`                                                                 | dashboard       | `https://api.staging.<domain>`                                                                                       |
| `WEB_ADMIN_URL`, `WEB_PORTAL_URL`                                                 | dashboard       | `https://admin.staging.<domain>`, `https://portal.staging.<domain>`                                                  |
| `AUTH_COOKIE_DOMAIN`                                                              | dashboard       | `.staging.<domain>`; the three URLs above must sit under it or the API refuses to boot, naming the one that does not |
| `FILE_STORE_DRIVER`, `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE`              | blueprint       | `s3`, `eduvault-staging`, `auto`, `true`                                                                             |
| `S3_ENDPOINT`                                                                     | dashboard       | `https://<account-id>.r2.cloudflarestorage.com`                                                                      |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                                        | dashboard       | an R2 token scoped to the `eduvault-staging` bucket only                                                             |
| `GATEWAY_ENCRYPTION_KEY`                                                          | dashboard       | a fresh `openssl rand -base64 32`                                                                                    |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`                               | dashboard       | a real address and a strong password; the bootstrap refuses `password123` and `.test` addresses in production        |
| `VITE_API_URL` (both sites), `VITE_PORTAL_URL` (admin), `VITE_ADMIN_URL` (portal) | dashboard       | the API URL, and the other app's URL; they are read at build time, so changing one needs a new deploy of that site   |

The API sends no email, so staging needs no mail provider (D-425).

### One-off setup, in order

1. Buy the domain on Cloudflare. Create the `eduvault-staging` R2 bucket and an API token scoped to that bucket.
2. In Render, create a Blueprint from `render.yaml`. Check the plan names it reports and what the paid Postgres tier costs.
3. Fill the dashboard variables from the table. Do `AUTH_COOKIE_DOMAIN` together with the three URLs; a mismatch fails at boot.
4. Attach the custom domains `api.staging.<domain>`, `admin.staging.<domain>` and `portal.staging.<domain>` to their services, and add the DNS-only CNAMEs Render shows in Cloudflare.
5. Run the first deploy from the dashboard. The pre-deploy command applies migrations; the service is live when `GET /health` answers 200.

### Seed once

Seeding is never part of a deploy. After the first deploy, open a shell on `eduvault-api` (run `corepack enable` first if `pnpm` is not found) and run, in this order:

```sh
pnpm nx run api:bootstrap-admin   # the super admin from BOOTSTRAP_ADMIN_*
ALLOW_PRODUCTION_SEED=true pnpm nx run api:db-seed   # optional demo school; idempotent
```

**`api:db-seed` creates every persona with the password `password123`.** With `NODE_ENV=production` it (and `api:db-seed-demo`) refuses to run unless `ALLOW_PRODUCTION_SEED=true` is set. On a public host anyone can guess that password, so change those passwords straight after, or seed nothing and create the schools through the super admin. Resetting and re-seeding is a later issue (EDU-340).

### Rollback

Redeploy the previous successful build from the service's Deploys list. Migrations are not reversed: a bad migration is fixed forward with a new one. A rollback to code older than the schema works only while the new migrations stayed backward compatible, so keep them additive.

## Free live demo

A throwaway public demo on Neon and Render free tiers, with no custom domain and synthetic data only, is described in [`docs/demo.md`](demo.md). It shares no configuration with staging.

## Database

| Task                    | Command                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Start only Postgres     | `nx run api:db-start`                                                                            |
| Apply migrations        | `nx run api:db-migrate-up`                                                                       |
| Wipe and recreate       | `nx run api:db-reset` (wipes the volume, restarts Postgres, migrates; re-seed afterwards)        |
| Seed                    | `nx run api:db-seed` (idempotent; needs `ALLOW_PRODUCTION_SEED=true` when `NODE_ENV=production`) |
| Demo school (opt-in)    | `pnpm db:seed:demo` / `nx run api:db-seed-demo` (idempotent; 600 students, about 2 to 8 min)     |
| New migration           | add `apps/api/db/migrations/<timestamp>_<name>.sql` with `-- migrate:up` and `-- migrate:down`   |
| Refresh generated files | `pnpm drift:fix`                                                                                 |

The demo school has people, a billed term, payments and wallets, and also fills the Store, Approvals, Announcements, Leave and student list; `.claude/skills/run-local/SKILL.md` lists what it holds.

After any schema change run `pnpm drift:fix` and commit `schema.sql` and `db-types.ts` with the migration.

## Adding an API resource

1. Add the schemas and routes to `libs/api-contract` (the SPAs and API both fail typecheck until they agree).
2. Add a permission to `libs/policy/src/statements.ts` and grant it in `roles.ts`.
3. Add a migration with `organization_id` (and a composite campus foreign key if campus aware).
4. Add a module under `apps/api/src/app/modules/`; put `@OrganizationAuth(resource, action)` on each handler and filter every query by `ctx.organizationId` and, where campus aware, `inCampusScope`.
5. Cover it in `apps/api/test/*.integration.spec.ts`, including a cross-school case.

## UI components (shadcn)

`libs/ui` is a shadcn project (`libs/ui/components.json`, preset `b1fy405VLO`: radix-nova). Tokens live in `libs/ui/src/styles/theme.css`, which holds the brand palette from [PRD 01](prd/01-foundation-design-system.md) in light and dark, the brand layer (card ring, button sweep, focus, skeleton shimmer, page reveal, one reduced-motion block) and the 24 `avatar-h-*` hue classes. Fonts are self-hosted through fontsource packages in the `ui` catalog: Inter (body, `h2` to `h4`), Playfair Display 600 and 700 (page `h1`, crest letters; `font-display`) and Roboto Mono (references, `kbd`, `code`; `font-mono`); no font is requested from a third-party host. Theme, avatar hue, contrast and the compact-width hook are in `libs/ui/src/lib/` and `hooks-custom/`; helpers (`cn`, `fieldValue`) in `libs/ui/src/lib/`. Components are split by owner:

- `src/components/ui/` and `src/hooks/`: shadcn CLI output only. Treat it as vendored: running `pnpm ui:add <name> --overwrite` must not lose anything. Change the look through tokens in `theme.css` or a CLI variant; change behaviour with an in-house wrapper.
- `src/components/custom/`: in-house components (`TextField`, `SchoolCrest`, `AppTopbar`, `PortalNav`, ...), built from the `ui/` primitives. Names never reuse a shadcn name. Specs live here only.

If a vendored file needs a real fix (an accessibility bug, say), edit it, add a one-line comment with the reason and list the file here so the next `--overwrite` re-applies it.

- Add or update a component: `pnpm ui:add <component>`, then `pnpm ui:localize`. The apps consume `libs/ui` from source, so the CLI's `@/` imports cannot resolve; `ui:localize` rewrites them to relative paths, undoes the CLI swapping `cn` for the unrelated `cn` npm package, then runs install, Prettier and `eslint --fix`.
- If the CLI adds a package to `libs/ui/package.json` (`ui:add command` brings `cmdk`), move its version into the `ui` catalog in `pnpm-workspace.yaml` and write `catalog:ui`. The vendored `components/ui/` folder is exempt from the colour-literal lint and a few a11y and style rules (see `libs/ui/eslint.config.mjs`), so CLI output lands without patching.
- Export new components from `libs/ui/src/index.ts`, in the shadcn or in-house block; apps import only from `@eduvault/ui`.
- Re-apply the preset from `libs/ui`: `pnpm --filter @eduvault/ui exec shadcn apply --preset b1fy405VLO`, then `pnpm ui:localize`. Applying it rewrites the colour values in `theme.css`, which now come from the brand palette rather than the preset: keep the structure it adds, then restore the palette from git. The preset does not define `success`, `warning` or the brand tokens; they are kept by hand in `theme.css`.
- `libs/ui/vite.config.mts` is empty on purpose: the CLI only recognises a project that has a Vite config.

## Integration tests

`apps/api/test/support/base-test.ts` exposes the `baseTest` fixture: `createUser` (sign-up is off, so accounts are made on the server), `signIn`, `createOrganization`, `createSchoolViaPlatform`, `createCampus`, `addMember`, `makeSuperAdmin`, `setActiveOrganization`, `setActiveCampus` and an `api(user)` supertest helper. Each test starts from truncated tables; one Postgres container serves the whole run.

## Troubleshooting

- **`Cannot connect to the Docker daemon`**: start Docker, then retry.
- **Port 5434 busy**: another Eduvault Postgres is running (`nx run api:db-stop`).
- **Signed in on :4200 and :4201 at once**: expected; cookies are shared across localhost ports.

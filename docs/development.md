# Development

## Prerequisites

Node 24 (`.nvmrc`), pnpm 10 (`packageManager`), Docker. `pnpm install` also installs the Husky hook.

## Everyday loop

```sh
pnpm validate:quick      # lint + typecheck + unit tests, affected projects only
nx run api:test-integration   # when API, policy, contract or migrations changed
```

Never run an unscoped test command across the monorepo. `pnpm validate` runs everything; it is for a final check, not the inner loop.

## Running the stack

```sh
pnpm db:up && pnpm db:seed && pnpm dev
```

| Service    | URL                   |
| ---------- | --------------------- |
| API        | http://localhost:3000 |
| web-admin  | http://localhost:4200 |
| web-portal | http://localhost:4201 |
| Postgres   | localhost:5434        |

Seeded accounts all use the password `password123`; the table is in `.claude/skills/run-local/SKILL.md`. `GET /health` returns 200 when the API can reach Postgres.

The API reads `apps/api/.env.local` (created from `.env.example`) and refuses to start if a variable is missing or malformed, naming each one.

## Database

| Task                    | Command                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Start only Postgres     | `nx run api:db-start`                                                                          |
| Apply migrations        | `nx run api:db-migrate-up`                                                                     |
| Wipe and recreate       | `nx run api:db-reset` (wipes the volume, restarts Postgres, migrates; re-seed afterwards)      |
| Seed                    | `nx run api:db-seed` (idempotent)                                                              |
| New migration           | add `apps/api/db/migrations/<timestamp>_<name>.sql` with `-- migrate:up` and `-- migrate:down` |
| Refresh generated files | `pnpm drift:fix`                                                                               |

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

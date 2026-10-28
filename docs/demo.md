# Free live demo

A public demo of Eduvault on free tiers: a Neon Postgres database, one Render free web service for the API and two Render free static sites. It needs no domain and holds synthetic data only. It shares no configuration with staging ([`development.md`](development.md#staging-render)): staging stays on paid plans, Cloudflare R2 and shared cookie domains.

Each static site proxies the API under `/api`, so the browser only ever talks to its own origin and the session cookie is first-party. The SPAs are built with `VITE_API_URL=/api` (D-428).

## What the demo is not

- Not for real students or real money. Anyone with the URL can reach the sign-in page.
- Not staging. Files go to Postgres (`FILE_STORE_DRIVER` stays at its default), there is no mail and no custom domain.
- Not automatic. Nothing deploys on a push to `main`; the demo only moves when you move the `demo` branch.

## 1. Neon

1. Create a Neon project on Postgres 17 (the repo develops and tests on 17.6) and note the **direct** connection string and the **pooled** one (host contains `-pooler`).
2. Use the direct string as `DATABASE_URL` for the API and for migrations and seeding. `dbmate` and the seed take session-level locks, which the pooler's transaction mode breaks.
3. Keep `sslmode=require` on the string and drop `channel_binding=require` if Neon added it: `dbmate` may reject that parameter and fail the build-time migration.

## 2. The API (Render web service)

Create a **Web Service** from the repository with these settings:

| Setting           | Value                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime           | Node                                                                                                                                                                                      |
| Branch            | `demo`                                                                                                                                                                                    |
| Plan              | Free                                                                                                                                                                                      |
| Auto-deploy       | Off                                                                                                                                                                                       |
| Build command     | `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm nx run api:build && cd apps/api && ./node_modules/.bin/dbmate --migrations-dir db/migrations --no-dump-schema up` |
| Start command     | `node apps/api/dist/main.cjs`                                                                                                                                                             |
| Health check path | `/health`                                                                                                                                                                                 |

Free services have no pre-deploy command, so migrations run at the end of the build. A failed migration fails the build and the previous deploy keeps serving (D-430). `dbmate` runs each migration in its own transaction, so a run that fails part-way leaves the earlier migrations applied while the old code keeps serving. Keep migrations additive so the old code still works against a migrated schema.

The free instance has 512 MB for the build. If the install or `api:build` is killed for memory or times out, narrow the install to the API and its workspace libraries by replacing `pnpm install --frozen-lockfile --prod=false` with `pnpm install --frozen-lockfile --prod=false --filter 'api...'` (not verified here; check it on the first deploy).

## 3. The two static sites

Create two **Static Sites** from the same repository and the `demo` branch, one per app.

| Setting         | `web-admin`                                                                                     | `web-portal`                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Build command   | `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm nx run web-admin:build` | `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm nx run web-portal:build` |
| Publish path    | `dist/apps/web-admin`                                                                           | `dist/apps/web-portal`                                                                           |
| `NODE_VERSION`  | `24`                                                                                            | `24`                                                                                             |
| `VITE_API_URL`  | `/api`                                                                                          | `/api`                                                                                           |
| Other app's URL | `VITE_PORTAL_URL` = the portal site's URL                                                       | `VITE_ADMIN_URL` = the admin site's URL                                                          |

Add three **Redirects/Rewrites** to each site, in this order. Render applies the first rule that matches, so the order matters:

| #   | Source        | Destination                             | Type    | Why                                                         |
| --- | ------------- | --------------------------------------- | ------- | ----------------------------------------------------------- |
| 1   | `/api/auth/*` | `https://<api>.onrender.com/api/auth/*` | Rewrite | Better Auth is mounted at `/api/auth`, so the path is kept  |
| 2   | `/api/*`      | `https://<api>.onrender.com/*`          | Rewrite | The rest of the API has no `/api` prefix, so it is stripped |
| 3   | `/*`          | `/index.html`                           | Rewrite | Client-side routes load the SPA                             |

The auth client turns a relative `VITE_API_URL` into the page origin and calls `/api/auth/...` itself (D-429); everything else concatenates `/api` in front of the contract path.

## 4. Variables

Set these on the API service in the dashboard. `<api>`, `<admin>` and `<portal>` are the three `onrender.com` hostnames, known once the services exist.

| Variable                                            | Value                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `NODE_VERSION`                                      | `24`                                                                                                                     |
| `NODE_ENV`                                          | `production` (secure cookies, sign-in rate limit)                                                                        |
| `DATABASE_URL`                                      | the Neon direct string                                                                                                   |
| `BETTER_AUTH_SECRET`                                | a fresh `openssl rand -base64 48`                                                                                        |
| `BETTER_AUTH_URL`                                   | `https://<api>.onrender.com`                                                                                             |
| `WEB_ADMIN_URL`, `WEB_PORTAL_URL`                   | `https://<admin>.onrender.com`, `https://<portal>.onrender.com`; the browser's `Origin` is the site's URL, not the API's |
| `GATEWAY_ENCRYPTION_KEY`                            | a fresh `openssl rand -base64 32`                                                                                        |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | a real address and a strong password; the bootstrap refuses `password123` and `.test` addresses in production            |
| `FILE_STORE_DRIVER`                                 | leave unset (`postgres`)                                                                                                 |
| `AUTH_COOKIE_DOMAIN`                                | leave unset; the cookie is host-only on each site                                                                        |

The static sites take `NODE_VERSION` and the `VITE_*` values from the table in section 3. The `VITE_*` values are read at build time, so changing one needs a new deploy of that site.

## 5. Seed from your machine

Free services have no shell, so seed Neon from your own checkout. Export the direct Neon string and the production-mode values the API uses, so the seed matches the deployed configuration. Variables already in your shell win over `apps/api/.env.local`.

```sh
export DATABASE_URL='<Neon direct string>'
export NODE_ENV=production BETTER_AUTH_URL='https://<api>.onrender.com' \
  WEB_ADMIN_URL='https://<admin>.onrender.com' WEB_PORTAL_URL='https://<portal>.onrender.com' \
  BETTER_AUTH_SECRET='<same as the API>' GATEWAY_ENCRYPTION_KEY='<same as the API>' \
  BOOTSTRAP_ADMIN_EMAIL='<real address>' BOOTSTRAP_ADMIN_PASSWORD='<strong password>'
pnpm nx run api:bootstrap-admin                        # the super admin; the seed bundles build the same under NODE_ENV=production
ALLOW_PRODUCTION_SEED=true pnpm nx run api:db-seed     # optional demo school; idempotent
```

**`api:db-seed` creates every persona with the password `password123`.** On a public host anyone can guess it, so change those passwords straight after, or seed nothing and create the schools through the super admin (D-427).

## 6. Moving and rolling back the `demo` ref

Render deploys a branch, not a tag, so `demo` is a branch that only receives fast-forwards of commits already on `main`. It never has commits of its own.

```sh
git fetch origin
git push origin <sha>:refs/heads/demo      # fast-forward only; a rejection means <sha> is not ahead of demo
```

Then trigger a manual deploy on the API and on each static site. To roll back, point `demo` at the previous commit with a forced push (`git push --force-with-lease origin <old-sha>:refs/heads/demo`) and deploy again. That is the one push that is not a fast-forward. Migrations are not reversed: a bad migration is fixed forward with a new one.

Protect the branch so only you can move it: restrict pushes to your account and block deletion, but allow your own force pushes, or the rollback is rejected.

## 7. Before a demo

A free web service sleeps after 15 minutes without traffic and takes about a minute to wake. Open `https://<api>.onrender.com/health` a few minutes before you present and wait for a 200; a cold sign-in otherwise looks like a failure.

## Limits

- Cold start of about a minute on the API after 15 idle minutes, and every idle gap brings it back: the first request after a pause, a sign-in through the rewrite included, can wait that long and may come back as a gateway error. Retry once the API answers `/health`. To avoid it during a long session, ping `/health` every 10 minutes from any scheduler; that keeps the instance awake and counts against its free hours.
- Admin and portal sessions are separate, because each cookie is host-only on its own site. Signing in on one does not sign in the other.
- The demo is public and its data is synthetic; do not enter anything real.
- Neon's free storage cap applies, and files in Postgres count against it.
- Sign-in is limited to 5 per minute per address in production, and the address is the first entry of `x-forwarded-for` (D-070). If Render's rewrite does not forward the visitor's address, everyone shares one bucket and the sixth sign-in in a minute gets a 429 until the window clears. Check it before inviting people: sign in from two networks within a minute. If they share the limit, sign the demo accounts in ahead of time and stagger the audience's sign-ins; sessions outlast the minute. `AUTH_RATE_LIMIT` cannot switch the limit off while `NODE_ENV=production`, and dropping production mode also drops secure cookies, so open an issue rather than change either.
- Render's free tier limits instance hours per month; the three services share the workspace allowance.

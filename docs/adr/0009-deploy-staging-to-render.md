# Deploy staging to Render, with files on Cloudflare R2

- Status: proposed
- Date: 2026-10-27
- Supersedes ADR 0004 (in part): the line "no deployment or infrastructure code"

## Context

ADR 0004 says there is no deployment or infrastructure code, and ADR 0007 added an S3-compatible file store while choosing no host. EDU-337 asks for a staging environment that looks like production, so the three apps need somewhere to run and a way to share a session between them.

Facts that shape it:

- The API builds to `apps/api/dist/main.cjs` and keeps its packages external, so the service needs `node_modules` at runtime. The SPAs build to static files.
- `admin`, `portal` and `api` will be subdomains of one registrable domain. Better Auth's cookie is host-scoped today, so signing in on one does not sign in the others, which is what local development already relies on across ports.
- The API sends no email (D-425), and migrations are dbmate files that must run before new code starts.
- ADR 0007 wanted versioning on the bucket as a recovery net. Cloudflare R2 does not offer S3 object versioning (to be re-confirmed against R2's current documentation before staging holds anything that matters).

## Decision

Staging runs on Render, described by `render.yaml` at the repo root, with files in an R2 bucket. The first deploy is triggered by hand; later deploys come from the `Deploy staging` workflow (D-431, EDU-339).

- **Host:** one Postgres 17 database, the API as a Node web service, and `web-admin` and `web-portal` as static sites with a rewrite to `index.html` for client routes. Custom domains `api.`, `admin.` and `portal.staging.<domain>` are attached in the dashboard, with DNS-only CNAMEs in Cloudflare.
- **Cookie scope:** `AUTH_COOKIE_DOMAIN` (for example `.staging.example.com`) turns on `crossSubDomainCookies`. At boot the API checks that its own URL and both web URLs sit under that domain. Unset, cookies stay host-scoped (D-423). `SameSite=lax` stays because the three hosts are same-site.
- **Files:** `FILE_STORE_DRIVER=s3` against a private R2 bucket with a token scoped to that bucket (ADR 0007).
- **Migrations** run as the service's pre-deploy command, so a failed migration stops the deploy and the old version keeps serving. Seeding never runs on deploy.
- **Secrets and hosts** live only in Render's store. The blueprint marks each one `sync: false`, except `BETTER_AUTH_SECRET`, which Render generates per environment (D-426). The variables are listed once, in the "Staging (Render)" table of `docs/development.md`.
- **Synthetic data only.** Staging holds no real student or payment data.
- **Build:** every service installs with `--prod=false` because Render may build with `NODE_ENV=production` (D-424), and pins `NODE_VERSION`.

## Alternatives considered

- **One `STAGING_DOMAIN` variable expanded in code into the three URLs**: adds code and a second way to set what `env.ts` already takes explicitly.
- **Host-scoped cookies and one sign-in per app**: no code, but staging would behave unlike the production shape the epic asks for.
- **Postgres file store on staging**: needs nothing, but leaves the S3 driver and its R2 quirks untested before production.
- **Hard-coding hostnames in the blueprint**: the owner buys the domain later.

## Consequences

- The "no deployment or infrastructure code" line of ADR 0004 no longer holds; `render.yaml` is the first such file. The static checks stay the gate, and a spec keeps `render.yaml`, `env.ts` and the staging table in `docs/development.md` from drifting apart.
- Without object versioning, a wrong delete in the bucket is not recoverable from the bucket. That is acceptable for synthetic data. Production needs its own answer (a second bucket, an export, or a provider with versioning) before it holds proof of transfer.
- `api:db-seed` creates personas with the password `password123`. With `NODE_ENV=production` it and `api:db-seed-demo` refuse to run unless `ALLOW_PRODUCTION_SEED=true` is set, but on a public host the personas are still a risk, documented in `docs/development.md`; resetting and re-seeding is EDU-340.
- A later feature that sends email must revisit staging, since no transport exists.
- Rollback is a redeploy of the previous build; migrations are fixed forward.

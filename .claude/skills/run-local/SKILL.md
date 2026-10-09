---
name: run-local
description: Start Postgres, migrate, seed a dev user and serve the Eduvault API, web-admin and web-portal locally. Use whenever you need to run the apps or check a change against the real stack.
---

# Run Eduvault locally

Verified on macOS, Node 24, pnpm 10, Docker 28. All commands run from the repo root.

## 1. Install and start Docker

```sh
pnpm install
docker info >/dev/null 2>&1 || open -a OrbStack || open -a Docker   # macOS; any Docker daemon works
```

## 2. Postgres, migrations, seed

```sh
pnpm db:up      # nx run api:db-start (port 5434) + api:db-migrate-up; copies apps/api/.env.example to .env.local
pnpm db:seed    # bundles and runs the seed; prints "Already seeded; nothing to do." on re-run
```

The seed creates three schools through the API's services (Greenfield College with Lekki and Ikeja, Hilltop Academy, St Brendan's Schools) and Greenfield's 28 students, then runs its own check. Its banner prints the seeded "today", the latest Wednesday on or before the run day; `SEED_TODAY=2026-10-07 pnpm db:seed` pins it to the prototype's date. It needs a fresh database: after `pnpm db:reset`, seed again.

The seed first creates the super admin `admin@eduvault.test` (password `password123`, from `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in `.env.local`), then every persona on the server (sign-up is off), then each school through the platform service with its prefix, city and default levels. Kemi Balogun arrives on a temporary password, so her first sign-in shows "Choose your own password".

Seed data (password for all: `password123`; every member holds the starter role slugs from M1.1):

| Email                          | Schools and roles                                           | Sees        |
| ------------------------------ | ----------------------------------------------------------- | ----------- |
| `funmi@greenfield.test`        | Greenfield owner, Lekki and Ikeja                           | 28 students |
| `tunde.bakare@greenfield.test` | Greenfield administrator, Lekki and Ikeja                   | 28          |
| `grace.nwosu@greenfield.test`  | Greenfield teacher and principal, Lekki and Ikeja           | 28          |
| `chika.eze@greenfield.test`    | Greenfield bursar, Lekki                                    | 23          |
| `yemi.alade@greenfield.test`   | Greenfield bursar, Ikeja                                    | 5           |
| `emeka.obi@greenfield.test`    | Greenfield teacher, Lekki                                   | 23          |
| `ayo.bassey@greenfield.test`   | Greenfield teacher, Lekki                                   | 23          |
| `uche.nweke@greenfield.test`   | Greenfield teacher, Lekki                                   | 23          |
| `claire.ade@greenfield.test`   | Greenfield teacher, Lekki and Ikeja                         | 28          |
| `kemi.balogun@greenfield.test` | Greenfield member only (no roles), Lekki                    | none (403)  |
| `multi@eduvault.test`          | Greenfield teacher at Lekki, Hilltop administrator at Main  | 23, then 0  |
| `kola@hilltop.test`            | Hilltop Academy owner, Main                                 | 0           |
| `principal@stbrendans.test`    | St Brendan's Schools owner, Main, Annex and Junior          | 0           |
| `admin@eduvault.test`          | Super admin, no school: web-admin opens `/platform/schools` | n/a         |

## Super admin without the seed

The super admin is the one account no HTTP route creates. On an empty database, or to add another:

```sh
nx run api:bootstrap-admin     # reads BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD from apps/api/.env.local
# ✓ superadmin created (role: superadmin)   (a rerun prints "superadmin already exists")
```

It exits non-zero when the email belongs to a user who is not a super admin, or when a variable is missing, and prints no password. Sign in with it on web-admin (`http://localhost:4200`): it lands on the platform console, where "Create school" makes a school and its owner and shows the owner's temporary password once.

## 3. Serve all three apps

```sh
pnpm dev        # api http://localhost:3000, web-admin :4200, web-portal :4201
```

Check it:

```sh
curl -s localhost:3000/health                      # {"status":"ok"}
curl -s -c /tmp/cj -X POST localhost:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' -H 'origin: http://localhost:4200' \
  -d '{"email":"multi@eduvault.test","password":"password123"}' >/dev/null
curl -s -b /tmp/cj localhost:3000/students         # Lekki students only (23)
```

`api:serve` builds once, then rebuilds on change and restarts node (`vite build --watch` + `node --watch dist/main.cjs`).

## Resetting and stopping

```sh
pnpm db:reset            # wipe the volume, restart Postgres, re-migrate (re-seed afterwards)
nx run api:db-stop       # docker compose down
```

## Traps

- Port 5434, not 5432: a native Postgres on 5432 is a different database.
- Cookies are shared across localhost ports, so the two SPAs share one session.
- The API needs `.env.local`; `api:env-init` creates it from `.env.example` on first run.
- Sign-up is off: a new account comes from `bootstrap-admin` (super admin) or `POST /platform/schools` (a school owner). The sign-in rate limit (5 a minute) is off locally; set `AUTH_RATE_LIMIT=true` to try it.

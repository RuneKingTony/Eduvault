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

Seed data (password for all: `password123`; bursars are teachers and the principal an admin until M1.1):

| Email                          | Schools and roles                                  | Sees        |
| ------------------------------ | -------------------------------------------------- | ----------- |
| `funmi@greenfield.test`        | Greenfield owner, Lekki and Ikeja                  | 28 students |
| `tunde.bakare@greenfield.test` | Greenfield admin, Lekki and Ikeja                  | 28          |
| `grace.nwosu@greenfield.test`  | Greenfield admin (principal), Lekki and Ikeja      | 28          |
| `chika.eze@greenfield.test`    | Greenfield teacher (bursar), Lekki                 | 23          |
| `yemi.alade@greenfield.test`   | Greenfield teacher (bursar), Ikeja                 | 5           |
| `emeka.obi@greenfield.test`    | Greenfield teacher, Lekki                          | 23          |
| `ayo.bassey@greenfield.test`   | Greenfield teacher, Lekki                          | 23          |
| `uche.nweke@greenfield.test`   | Greenfield teacher, Lekki                          | 23          |
| `claire.ade@greenfield.test`   | Greenfield teacher, Lekki and Ikeja                | 28          |
| `multi@eduvault.test`          | Greenfield teacher at Lekki, Hilltop admin at Main | 23, then 0  |
| `kola@hilltop.test`            | Hilltop Academy owner, Main                        | 0           |
| `principal@stbrendans.test`    | St Brendan's Schools owner, Main, Annex and Junior | 0           |

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

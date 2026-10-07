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
pnpm db:seed    # idempotent; prints "Already seeded; nothing to do." on re-run
```

Seed data (password for all: `password123`):

| Email                     | Schools and roles                                            |
| ------------------------- | ------------------------------------------------------------ |
| `owner@greenfield.test`   | Greenfield Academy owner, member of Main Campus and Annex    |
| `teacher@greenfield.test` | Greenfield teacher at Main Campus                            |
| `owner@riverside.test`    | Riverside School owner (one campus)                          |
| `multi@eduvault.test`     | Greenfield teacher at Main Campus and Annex, Riverside admin |

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
curl -s -b /tmp/cj localhost:3000/students         # only Main Campus students
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

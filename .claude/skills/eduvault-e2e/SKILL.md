---
name: eduvault-e2e
description: Opt-in end-to-end check of Eduvault against the local run-local stack. Decides from the diff whether any e2e is needed (e2e-gate.sh prints skip, api or browser), then drives the browser with the playwright-cli skill and the API with curl. Personas owner, admin, teacher, student and a foreign-school user are created through the real API by scripts/provision.sh with a created-record ledger that scripts/cleanup.sh reverses after a pass; screenshots go to tmp/e2e/<run>/step-NN-*.png; the run ends in a PASS, FAIL or BLOCKED report. Use when asked to verify, e2e-test or manually test a change in the running app, to check a role or school/campus isolation boundary over HTTP, or after a diff touches apps/web-admin, apps/web-portal, libs/ui or UI-visible API. Not for unit or integration tests (those are validate and api:test-integration), and not part of pnpm validate.
argument-hint: <prose goal> | gate | preflight | cleanup <ledger.json>
allowed-tools: Bash(bash .claude/skills/eduvault-e2e/scripts/*), Bash(playwright-cli:*), Bash(curl:*), Bash(jq:*), Read, Grep, Write, Edit
---

# eduvault-e2e

Gate, then preflight, then run, then report. Opt-in: nothing here is in `pnpm validate`, `validate:quick` or CI (ADR 0004). There is no spec project: this skill decides when to run, provisions personas, drives the browser through the `playwright-cli` skill and the API through `curl`, and writes the report.

Scripts (`scripts/`): `e2e-gate.sh` · `preflight.sh` · `provision.sh` · `cleanup.sh` · `stack-worktree.sh` · `session-name.sh` · `close-sessions.sh` · `report-check.sh` · `tests/run-tests.sh` (offline).
Docs (`references/`): [personas](references/personas.md) · [report](references/report.md) · [flows](references/flows.md) · [failure-modes](references/failure-modes.md).

## 1. Gate

```sh
bash .claude/skills/eduvault-e2e/scripts/e2e-gate.sh
```

It diffs against `origin/main` (plus untracked files) and prints one word:

| Word      | Meaning                                                                        | What to run                     |
| --------- | ------------------------------------------------------------------------------ | ------------------------------- |
| `skip`    | no UI-visible change (docs, tests, tooling, `.claude`)                         | nothing; say "e2e not required" |
| `api`     | touches `apps/api/src`, migrations, seed, `libs/api-contract` or `libs/policy` | API checks only (curl)          |
| `browser` | touches `apps/web-admin`, `apps/web-portal`, `libs/ui` or `libs/shared`        | API checks and browser steps    |

An explicit request to e2e a change overrides `skip`; say that you overrode it.

## 2. Preflight

```sh
bash .claude/skills/eduvault-e2e/scripts/preflight.sh api       # or: browser
```

Exit 3 means the stack is down: **BLOCKED, cause environment**. Start it with the `run-local` recipe (`.claude/skills/run-local/SKILL.md`: `pnpm db:up`, then `pnpm dev` with `run_in_background: true`), then preflight again. If it still cannot start, stop and report BLOCKED; never report a pass for a run that did not happen. The browser steps need `command -v playwright-cli` to succeed; if it does not, report BLOCKED, cause environment.

Read the `e2e: env=local api=... admin=... portal=...` line: the run hits exactly those URLs. Override with `E2E_API_URL`, `E2E_ADMIN_URL`, `E2E_PORTAL_URL`, which are also read from `var/eduvault-dev.env` when a launcher writes it. Local only; there is no staging or preview mode.

## 3. Run

```sh
RUN_DIR=$(bash .claude/skills/eduvault-e2e/scripts/provision.sh)   # tmp/e2e/<run>, holds personas.json and ledger.json
```

Provisioning goes through the real API (never SQL) and appends each school, campus and student to `$RUN_DIR/ledger.json` as it is created. Then run the flows in [flows](references/flows.md):

- **API checks:** `curl` with a persona's cookie jar (`$RUN_DIR/<key>.jar`) and an `origin` header; assert the exact status.
- **Browser steps:** the `playwright-cli` skill, one named session per persona (`-s="$(bash .claude/skills/eduvault-e2e/scripts/session-name.sh "$RUN_DIR" owner)"`, e.g. `ev-ow-x73o41`), signing in through the real form; take a screenshot after each state worth looking at into `$RUN_DIR/<project>/step-NN-<name>.png`.

Write `$RUN_DIR/result.txt` yourself, first line the verdict. When every step passed, reverse the ledger; when anything failed or was blocked, keep the records until you have looked, then reverse them:

```sh
bash .claude/skills/eduvault-e2e/scripts/cleanup.sh "$PWD/$RUN_DIR/ledger.json"
```

On a pass close this run's sessions with `bash .claude/skills/eduvault-e2e/scripts/close-sessions.sh --run="$RUN_DIR"`; on a fail leave them open and say so. Start a run with `close-sessions.sh --stale` to reclaim abandoned ones. Never `close-all` or `kill-all`: they close other runs' browsers. User accounts cannot be removed through the API and remain until `pnpm db:reset`; their emails are `e2e-<run>-<persona>@eduvault.test`, so they never collide with seed data.

## Running several e2e sessions at once

Runs are isolated by what they own, so any number can run side by side:

- **Per run:** `provision.sh` makes `tmp/e2e/<run>/` with its own personas, ledger, cookie jars and a random `sid`. Emails, school slugs and admission numbers carry the run id, so runs never collide. `cleanup.sh` reverses only that run's ledger. Browser sessions are `ev-<persona>-<sid>`, so `close-sessions.sh --run=` closes only that run's.
- **Per branch:** two branches must not share one API, so give each worktree its own stack:

```sh
S=.claude/skills/eduvault-e2e/scripts
bash $S/stack-worktree.sh up <worktree>          # own API, web-admin, web-portal and database, on free ports
eval "$(bash $S/stack-worktree.sh env <worktree>)"   # exports E2E_API_URL, E2E_ADMIN_URL, E2E_PORTAL_URL
bash $S/preflight.sh browser                     # its rows must name the worktree's ports, not :3000/:4200
# ... run, then in the same shell:
bash $S/stack-worktree.sh down <worktree>        # stops its processes and drops its database
```

The database is `eduvault_e2e_<worktree>` inside the shared Postgres container (:5434), migrated with the worktree's own migrations, so the shared `eduvault` database is never touched. Ports are the first free triple from api :3710, admin :4720, portal :4721. The worktree needs `pnpm install` first. Run `cleanup.sh` **before** `down` and in a shell where the `eval` ran, or it signs in on the wrong stack.

- **Shared on purpose:** cookies are host-scoped, so two stacks on `localhost` share cookies within one browser; separate playwright-cli sessions are separate browsers, so keep one session per persona and never reuse one across runs. Sign-up and sign-in on one API are not rate-limited locally, so concurrent runs on one stack are fine.

## 4. Write the report

Start from `result.txt`'s verdict, then add what a person needs: the goal, the personas used, one line per step with its screenshot, and for a FAIL the first failing step. The format and its three rules are in [report](references/report.md). Save it as `tmp/e2e/<run>/report.md` and validate it:

```sh
bash .claude/skills/eduvault-e2e/scripts/report-check.sh tmp/e2e/<run>/report.md
```

Screenshots are `tmp/e2e/<run>/<project>/step-NN-<name>.png`, numbered in the order the steps ran. Look at the ones for a failed step before explaining it.

## Verdicts

| Verdict   | When                                                                                       | Rule                                                                                  |
| --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `PASS`    | every test ran and passed, none skipped as blocked                                         | The words FAIL and BLOCKED must not appear in the report's first 15 lines.            |
| `FAIL`    | an assertion failed, or the run broke for a reason in the product or the spec              | Name the failing step and the expected and actual status or text.                     |
| `BLOCKED` | the run could not test what it was asked to: stack down, or a persona could not be created | Give `cause: environment\|persona\|product`. Never rounded up to PASS, never to FAIL. |

A test skipped because its persona is blocked is BLOCKED, not "skipped, so fine". Today admin, teacher and student cannot be created over HTTP (see [personas](references/personas.md)), so any run that includes them is BLOCKED until that is fixed; say so plainly and report the tests that did pass separately.

## Ground rules

- **Real API only.** Sign-up, school, campus and student creation go through Better Auth and the Nest routes. No SQL, no direct database writes, no test-only endpoints.
- **Ledger everything a run creates.** Records created outside `provision.sh` must be appended to the ledger so cleanup can reverse them ([flows](references/flows.md)).
- **Business rules stay true.** Eduvault never deletes money, results or students in the product. The e2e ledger deletes only rows this run created, in a throwaway local database, through the same API.
- **Never touch seed data.** Do not sign in as `owner@greenfield.test` and mutate its school; the e2e personas are separate.
- **Browser driving is `playwright-cli`.** Use the `playwright-cli` skill against the admin and portal URLs from preflight with a persona from `personas.json`. Do not add a spec project or vendor third-party skills.
- **Do not weaken an assertion to make a failure pass.** A flaky step is a FAIL with a note, or a wait on the real condition.
- Never commit, and never report a run you did not make.

---
name: eduvault-e2e
description: Opt-in end-to-end check of Eduvault against the local run-local stack. Decides from the diff whether any e2e is needed (e2e-gate.sh prints skip, api or browser), then runs the Playwright project apps/web-e2e. Personas owner, admin, teacher, student and a foreign-school user are created through the real API with a created-record ledger that is reversed after a pass; screenshots go to tmp/e2e/<run>/step-NN-*.png; the run ends in a PASS, FAIL or BLOCKED report. Use when asked to verify, e2e-test or manually test a change in the running app, to check a role or school/campus isolation boundary over HTTP, or after a diff touches apps/web-admin, apps/web-portal, libs/ui or UI-visible API. Not for unit or integration tests (those are validate and api:test-integration), and not part of pnpm validate.
argument-hint: <prose goal> | gate | preflight | cleanup <ledger.json>
allowed-tools: Bash(bash .claude/skills/eduvault-e2e/scripts/*), Bash(pnpm nx run web-e2e:*), Bash(pnpm --filter @eduvault/web-e2e:*), Bash(playwright-cli:*), Read, Grep, Write, Edit
---

# eduvault-e2e

Gate, then preflight, then run, then report. Opt-in: nothing here is in `pnpm validate`, `validate:quick` or CI (ADR 0004). The specs live in `apps/web-e2e`; this skill decides when to run them, drives the stack, and writes the report.

Scripts (`scripts/`): `e2e-gate.sh` · `preflight.sh` · `report-check.sh` · `tests/run-tests.sh` (offline).
Docs (`references/`): [personas](references/personas.md) · [report](references/report.md) · [flows](references/flows.md) · [failure-modes](references/failure-modes.md).

## 1. Gate

```sh
bash .claude/skills/eduvault-e2e/scripts/e2e-gate.sh
```

It diffs against `origin/main` (plus untracked files) and prints one word:

| Word      | Meaning                                                                        | What to run                     |
| --------- | ------------------------------------------------------------------------------ | ------------------------------- |
| `skip`    | no UI-visible change (docs, tests, tooling, `.claude`)                         | nothing; say "e2e not required" |
| `api`     | touches `apps/api/src`, migrations, seed, `libs/api-contract` or `libs/policy` | the `api` project only          |
| `browser` | touches `apps/web-admin`, `apps/web-portal`, `libs/ui` or `apps/web-e2e`       | all projects                    |

An explicit request to e2e a change overrides `skip`; say that you overrode it.

## 2. Preflight

```sh
bash .claude/skills/eduvault-e2e/scripts/preflight.sh api       # or: browser
```

Exit 3 means the stack is down: **BLOCKED, cause environment**. Start it with the `run-local` recipe (`.claude/skills/run-local/SKILL.md`: `pnpm db:up`, then `pnpm dev` with `run_in_background: true`), then preflight again. If it still cannot start, stop and report BLOCKED; never report a pass for a run that did not happen. The browser needs a one-time `pnpm --filter @eduvault/web-e2e exec playwright install chromium`.

Read the `e2e: env=local api=... admin=... portal=...` line: the run hits exactly those URLs. Override with `E2E_API_URL`, `E2E_ADMIN_URL`, `E2E_PORTAL_URL`. Local only; there is no staging or preview mode.

## 3. Run

```sh
pnpm nx run web-e2e:e2e                          # browser: every project
pnpm nx run web-e2e:e2e -- --project=api         # api: HTTP checks only
pnpm nx run web-e2e:e2e -- --project=web-admin   # one SPA
```

Global setup creates the personas through the real API (never SQL), recording each school, campus and student in `tmp/e2e/<run>/ledger.json`. The reporter then writes `tmp/e2e/<run>/result.txt` whose first line is the verdict, and **reverses the ledger only when nothing failed**. A failed run keeps its records; reverse them after you have looked:

```sh
pnpm --filter @eduvault/web-e2e cleanup <absolute path to ledger.json>
```

User accounts cannot be removed through the API and remain until `pnpm db:reset`; their emails are `e2e-<run>-<persona>@eduvault.test`, so they never collide with seed data.

The exit code is non-zero for FAIL and for BLOCKED. Still read `result.txt`: the exit code cannot tell you which.

## 4. Write the report

Copy `result.txt`'s verdict, then add what a person needs: the goal, the personas used, one line per step with its screenshot, and for a FAIL the first failing step. The format and its three rules are in [report](references/report.md). Save it as `tmp/e2e/<run>/report.md` and validate it:

```sh
bash .claude/skills/eduvault-e2e/scripts/report-check.sh tmp/e2e/<run>/report.md
```

Screenshots are `tmp/e2e/<run>/<project>/step-NN-<name>.png`, numbered in the order the spec took them. Look at the ones for a failed step before explaining it.

## Verdicts

| Verdict   | When                                                                                       | Rule                                                                                  |
| --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `PASS`    | every test ran and passed, none skipped as blocked                                         | The words FAIL and BLOCKED must not appear in the report's first 15 lines.            |
| `FAIL`    | an assertion failed, or the run broke for a reason in the product or the spec              | Name the failing step and the expected and actual status or text.                     |
| `BLOCKED` | the run could not test what it was asked to: stack down, or a persona could not be created | Give `cause: environment\|persona\|product`. Never rounded up to PASS, never to FAIL. |

A test skipped because its persona is blocked is BLOCKED, not "skipped, so fine". Today admin, teacher and student cannot be created over HTTP (see [personas](references/personas.md)), so any run that includes them is BLOCKED until that is fixed; say so plainly and report the tests that did pass separately.

## Ground rules

- **Real API only.** Sign-up, school, campus and student creation go through Better Auth and the Nest routes. No SQL, no direct database writes, no test-only endpoints.
- **Ledger everything a spec creates.** Records created in a spec must be added to the ledger so a pass can reverse them ([flows](references/flows.md)).
- **Business rules stay true.** Eduvault never deletes money, results or students in the product. The e2e ledger deletes only rows this run created, in a throwaway local database, through the same API.
- **Never touch seed data.** Do not sign in as `owner@greenfield.test` and mutate its school; the e2e personas are separate.
- **Interactive driving** (exploring a page, finding a selector): use `playwright-cli` only if `command -v playwright-cli` succeeds, against the same URLs and a persona from the latest `personas.json`. Turn what you learn into a spec in `apps/web-e2e/src/specs`; do not vendor or copy third-party skills. Without it, write the spec and run it.
- **Do not edit `playwright.config.ts` timeouts to make a failure pass.** A flaky step is a FAIL with a note, or a fixed wait on the real condition.
- Never commit, and never report a run you did not make.

---
name: eduvault-verify
description: End-to-end verification of Eduvault beyond one diff, as a person would click through it. Runs a checklist of checks per area (access and tenancy, school set-up, people, fees, payments and money, discounts and approvals, store, dashboard and portal, plus the known-problems baseline), or plans an ad-hoc area from its PRD, through the eduvault-e2e machinery. Walks each area as several roles (happy path, permissions, then edge cases), keeps screenshots per section, reports PASS, FAIL or BLOCKED per check, records every failure as a finding with endpoint, status, backend log and browser console, and can fix the findings and re-verify. Use when asked to verify the whole app or one area, walk through or demo-check an area, take a baseline before fixes, re-check after a fix, or fix the findings of an earlier verify run. For a single change use eduvault-e2e; not for unit or integration tests.
argument-hint: baseline | all | lint | area <checklist or goal> [--personas a,b] | recheck <run | check-id...> | fix <run>
allowed-tools: Bash(bash .claude/skills/eduvault-verify/scripts/*), Bash(bash .claude/skills/eduvault-e2e/scripts/*), Bash(bash .claude/skills/github-issues/scripts/*), Bash(playwright-cli:*), Bash(curl:*), Bash(jq:*), Read, Grep, Write, Edit
---

# eduvault-verify

Verifies the product, not one diff: "does this area work the way a person would use it, and what is broken". It adds a checklist, a per-check report and a findings ledger on top of [eduvault-e2e](../eduvault-e2e/SKILL.md), and reuses everything else from it: preflight, `provision.sh` personas and ledger, `stack-worktree.sh`, `playwright-cli` sessions, screenshots, `cleanup.sh`, `close-sessions.sh`. Read that skill's Run, Assertions and Ground rules sections first; they apply here unchanged. Do not copy its browser or persona logic into this skill.

The person using this still looks at the app, to judge whether it feels right and what is missing (a filter that should exist, copy that does not explain). This skill covers whether it works.

Checklists (`references/`): [known-problems](references/known-problems.md) · [access](references/checks-access.md) · [setup](references/checks-setup.md) · [people](references/checks-people.md) · [fees](references/checks-fees.md) · [money](references/checks-money.md) · [store-portal](references/checks-store-portal.md). What a check should cover: [coverage](references/coverage.md). Ledger format: [findings](references/findings.md).

## Check format

Every check is a block with a header `### ID · kind · persona`, then `Do:` and `Expect:` lines (and optionally `Known:` with the issue number). `kind` is `api` (curl, assert exact status and body) or `browser` (playwright-cli, screenshot per state). Checks assert the behaviour the product **should** have, so a known problem is a FAIL until it is fixed. Format rules are enforced by `scripts/checks-lint.sh`.

## Modes

| Argument          | Runs                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `lint`            | `checks-lint.sh` only; no stack needed                                                                          |
| `baseline`        | every check on the app as it is, before any fix; keep the report                                                |
| `area <name>`     | one checklist file (`access`, `setup`, `people`, `fees`, `money`, `store-portal`, `known-problems`)             |
| `area <goal>`     | a prose goal or an area with no checklist ("the store page"): plan it first, see "Area without a checklist"     |
| `recheck <id>...` | only the named checks, after a fix; the fix is done when they pass                                              |
| `recheck <run>`   | the failed checks of an earlier run; each inherited finding becomes `fixed` or `still failing`, none is dropped |
| `fix <run>`       | fix the open findings of a run one by one, recheck each, then ask before commit, push and PR                    |
| `all`             | every check, as a regression run                                                                                |

`--personas owner,bursar,teacher` narrows a run; the report lists the roles left out under Not verified. There is no deployed mode; the stack is local only.

## Steps

1. `bash .claude/skills/eduvault-verify/scripts/checks-lint.sh`. A lint failure stops the run.
2. Preflight and provision exactly as eduvault-e2e sections 2 and 3 (`preflight.sh browser`, then `RUN_DIR=$(bash .claude/skills/eduvault-e2e/scripts/provision.sh)`). On a branch use `stack-worktree.sh up` so the run never touches the shared database. Read the `e2e:` line. A flow's setup (a fee, an item, a class) is created through the real UI or API as a persona and appended to the ledger straight away (for example the 30 students for KP-09).
3. Run the selected checks. Inside an area: happy path first and get it right, then permissions (the same view as each role that should differ), then edge and non-happy paths. Do not start edges on a section whose happy path failed; record the finding and move on. Evidence per section is below.
4. Record each check as one line in `$RUN_DIR/checks.tsv`: `ID<TAB>PASS|FAIL|BLOCKED<TAB>note<TAB>screenshot`. A note is required for FAIL (expected vs actual) and BLOCKED (`cause: environment|persona|product`). Every FAIL also gets a finding.
5. `bash .claude/skills/eduvault-verify/scripts/summarize.sh "$RUN_DIR/checks.tsv"` prints the per-check table, the counts and the verdict. Write it into `$RUN_DIR/report.md` in the [eduvault-e2e report format](../eduvault-e2e/references/report.md), add the severity counts, a section table (section, passed, failed, blocked, screenshot folder) and **Not verified**, and validate it with `report-check.sh`. Add `$RUN_DIR/INDEX.md`: each section folder with one line per screenshot, so it reads in order without the app.
6. Clean up as eduvault-e2e does: `cleanup.sh` the ledger, then close sessions on a pass; on a fail leave them open and say so.

Report the verdict, the findings by severity and the path to the run folder. Do not paste the whole ledger into chat.

## Area without a checklist

Do not click first. Write `$RUN_DIR/PLAN.md`:

1. Read the PRD for the area in `docs/prd/` and its routes in `apps/web-admin/src/routes` (and `web-portal` if the portal is involved), so checks come from what was built.
2. Split the area into sections, one per screen or module; each becomes a folder `$RUN_DIR/<NN>-<section>/`.
3. List each section's checks with ids in the checklist style (`ST-01`), covering the kinds in [coverage](references/coverage.md), and say how each is **proven**: a screenshot, an HTTP status, a row read back through the API, a banner text in the snapshot. A check with no proof is not a check.
4. List personas per section from [personas](../eduvault-e2e/references/personas.md).

Then run steps 2 to 6. When the area is worth keeping, turn the plan into a checklist file under `references/` in the same change and run `lint`.

## Evidence per section

- One browser session per persona (`session-name.sh`), signing in through the real form. Screenshot after every state worth looking at: `step-NN-<state>.png`. Never photograph a password, temporary credential, token or cookie.
- After each action that should change something, assert the outcome, not only that nothing crashed: the banner or modal appeared, the right buttons are disabled or enabled, the row shows, and the API read-back agrees (`curl` with the persona's jar, exact status; out of scope 404, missing permission 403, no session 401).
- After each action capture `playwright-cli console` (errors, warnings) and `playwright-cli requests` (any 4xx or 5xx with status and path), and `tail` the API log since the last check (worktree stack: `var/e2e/stacks/<name>/api.log` under the main repo; shared stack: the `pnpm dev` background output). Keep the relevant excerpt as `step-NN-<state>.log`.
- `run-code` and `eval` exit 0 when the snippet throws, so grep for `### Error`; `get-session` answers 200 with `null` when signed out, so assert `user.id`.

## Findings

Every FAIL is written at once to `$RUN_DIR/findings.md` in the [findings](references/findings.md) format: id, severity, effort, section, persona, the check id, expected and actual, endpoint with status and excerpt, console and log excerpts, screenshot path, and the code location when the cause is verified. Enough that someone can fix it without reproducing it.

A finding is something broken or surprising. A missing filter, a better label or a new feature is an idea for the `## Ideas` list at the bottom and does not affect the verdict.

The ledger is local (`tmp/` is git-ignored). GitHub issues are only created when the person asks (`--issues`), through `github-issues` with `create-issue --body-file`, and only after showing the list, since an issue is outward-facing. A confirmed finding that is not fixed in the same change gets a check in `known-problems.md`.

## Fix

`fix <run>` works through the open findings in severity order. Per finding: read the evidence and the code it points to, write the failing test first when the fault is in `apps/api` or a pure function, fix it following `docs/conventions.md` and the tenancy rules, run `pnpm validate:one <project>` for the touched projects, then recheck that finding in the browser and update its status. A finding that needs a product decision stays open with the question written on it.

When the findings are fixed, run the `CLAUDE.md` "Definition of done" (including `api:test-integration` and `pnpm drift` when they apply, and `eduvault-e2e`), then **ask before committing, pushing or opening a PR**. Branches are `edu-<issue>-<slug>`, PRs are drafts, merging stays with a person. Use `/ship` when a finding is large enough to be its own issue.

## Verdict

PASS only when every selected check is PASS. Any FAIL makes the run FAIL; otherwise any BLOCKED makes it BLOCKED. A check that did not run is BLOCKED, never skipped. A `baseline` run is expected to FAIL on the known problems: that is its job, so report which known problems it caught and which it missed.

## Baseline coverage rule

The baseline must fail on every entry in [known-problems](references/known-problems.md). If a problem someone found by hand passes the baseline, the checklist is missing coverage: add or fix the check, rerun, and say so in the report.

## Extending

When a slice ships, add its checks to the matching area file in the same change (ID prefix = area, next free number), then run `lint`. A bug found by hand gets a check in `known-problems.md` first, then the fix.

## Ground rules

- The eduvault-e2e ground rules hold: no seeding or resetting a database, real API only, ledger everything created, never write to seed data, never weaken an assertion to pass a check, never report a run you did not make.
- Never delete money, results or students to make a check pass; money is voided, students archived.
- Evidence beats claims: a pass needs its proof (screenshot, status, read-back) saved in the run folder.
- Setup belongs to eduvault-e2e; if provisioning is missing something, fix it there.

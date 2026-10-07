# Stage notes: read the section for the stage you are about to run

`$W` is `ship/scripts`, `$D` the run's state dir. Models come from `effort.sh`, never from here.

**fetch.** `bash $W/state.sh fetch-ticket <KEY>` -> 0 writes `$D/ticket.json` and records `pass`; 1 halt
(gh); 2 halt (bad key). `bash $W/state.sh deps <KEY>` -> `{deps, unmet}` (text dependencies like "after #12"
and inward `blocked by` links; satisfied when the issue is closed or its PR merged): one line per dep; exit
1 under `--auto-decide`: halt naming `.unmet`, else ask. Under `/spike` this never fires. `bash $W/state.sh
guard <KEY>` -> 1 halt naming the PR; 2 halt (gh couldn't list PRs). Then `bash $W/issue-sync.sh <KEY>`.

**branch beside propose.** `bash $W/state.sh adopt <KEY>` -> 0: save `worktree_path` and `branch`, record
`branch` `pass`. Else `BRANCH=edu-<n>-<kebab summary, <= 50 chars>`; `state.sh set` `.branch` and
`.worktree_path` (`$ROOT/.claude/worktrees/$BRANCH`); `state.sh stage <KEY> branch running`; `bash
$W/state.sh fetch-main <KEY> $RUN_ID` (1 halt); subagent with the `effort.sh` model for `branch`, prompt
`prompt.sh <KEY> branch RUN_ID=$RUN_ID`. Meanwhile `state.sh stage <KEY> propose running` and: with
`--auto-decide`, a subagent with the `propose` model, `prompt.sh <KEY> propose`; without, `/propose <KEY>`
here. **Record nothing until both have returned**: the propose subagent writes `status.json` itself and a
`state.sh` write racing it can drop its fields. Then `verify.sh <KEY> branch` -> 0 `pass`; `verify.sh <KEY>
propose` -> 0 `pass`; 1 with `propose_verdict: not-shippable`: halt with `.propose_reason` (the issue text is
the user's to change). After `pass`, print one line each for design.md's `## Descoped` items and `## Soft
dependencies`. `bash $W/state.sh descopes <KEY>`: under `--auto-decide`, an unaccepted item that is in the
issue's title or acceptance criteria: halt naming it and the way on, `bash $W/state.sh accept-descope <KEY>
"<item>"`, then `/ship <KEY>`. Post-deploy and operator-only criteria are `## Human checks`, not descopes.
tasks.md's `## Human checks` go verbatim into the final report.

**implement.** Worker stage. After `pass`: `bash $W/e2e-gate.sh <KEY>`; unless `skip`, start `bash
$W/stack.sh up <KEY> $RUN_ID` in the background now so it is warm by e2e.

**security-gate.** `bash $W/gate.sh <KEY>` -> `{fires, reason}` (records `security-gate`, and `security:
skipped` when it doesn't fire). Fired: `state.sh stage <KEY> security running`, subagent with the `security`
model and `prompt.sh <KEY> security`, then dispatch `simplify` without waiting. Before deciding
`fix-blockers`, wait for it and verify.

**simplify.** A `failure_reason` that is only Docker-bound specs verifies as pass with `unrun_specs`. On
`verify.sh` exit 1 read `simplify.json`'s `failure_reason`: a pre-existing test the issue's own behaviour makes
wrong: `$R/test-drift.md`; anything else: halt.

**fix-blockers.** `review` blockers + `security` blockers (0 when skipped) == 0: `state.sh stage <KEY>
fix-blockers skipped`; else the worker stage.

**e2e (opt-in).** Runs only when `e2e-gate.sh` reports `browser` or `api`.

1. `e2e-gate.sh` `skip: true` (already recorded `skipped`): go to `push`; the PR body says why.
2. `state.sh stage <KEY> e2e running` (11 halt). A dead attempt's `created.json` ledger: reverse it with the
   eduvault-e2e cleanup first.
3. Wait for the background `stack.sh up` (it holds the `e2e-stack` mutex; ports are fixed, so e2e stages of
   parallel runs queue), then `bash $W/stack.sh ready <KEY>` (1 halt with its output).
4. Subagent with the `e2e` model, `prompt.sh <KEY> e2e`. A fresh `$D/e2e.question.json`: `$R/answering.md`.
5. `bash $W/stack.sh down <KEY> $RUN_ID`, whatever happened.
6. `verify.sh <KEY> e2e` -> 0 `pass`. BLOCKED with `cause: environment` (the local stack can't exercise the
   change): `bash $W/state.sh skip-e2e <KEY> "<cause line>"`, then `push` (the PR body states it). Anything
   else: halt with the reason. `e2e.json`'s `partial` is a pass the PR lists as "Not verified locally".

**push.** Worker stage: commit, local checks, `git push`. Then `verify.sh` -> `pass`.

**pr.** Worker stage (haiku): the draft PR. After verify: `state.sh set <KEY> '.pr_url = $u' --arg u <pr_url>`,
`state.sh stage <KEY> pr pass`, `bash $W/issue-sync.sh <KEY>` (label `in-review`; a failure is reported, not a
halt). The PR stays a draft.

**merge-gate.** `$R/merge-gate.md`.

**cleanup.** Each step idempotent: `bash $W/worker.sh close <KEY>`; `bash $W/stack.sh down <KEY> $RUN_ID`;
`bash $W/worktree.sh remove <KEY> $RUN_ID`. Exit 1 "not MERGED" is the normal outcome before the human
merges: do not record `cleanup pass`, and say that re-running `/ship <KEY>` after the merge removes the
worktree. Merged (`next` reported `pr_state: MERGED`): exit 0 -> `state.sh stage <KEY> cleanup pass`; exit 3
(gh/fetch failed): report, never force. Always release `$LOCK` before reporting. Final report: the PR URL,
`bash $W/report.sh <KEY>`'s `.line`, any `## Human checks`, and _"CI is green on the draft PR: mark it ready
and merge it, then close <KEY>. Re-run /ship <KEY> afterwards to remove the worktree."_

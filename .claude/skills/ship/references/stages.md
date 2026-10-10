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
`prompt.sh <KEY> branch RUN_ID=$RUN_ID`. Start only the stages `state.sh next` lists in `run`: `propose` is
in it only while propose isn't `pass`, so a resume never redoes a finished plan. Meanwhile `state.sh stage
<KEY> propose running` and: with `--auto-decide`, a subagent with the `propose` model, `prompt.sh <KEY>
propose`; without, `/propose <KEY>` here. `/propose` ends by printing a hand-off `/goal` line for a person to
run: that is not the end of this turn. Verify propose and go on to `implement`. **Record nothing until both have returned**: the propose subagent writes `status.json` itself and a
`state.sh` write racing it can drop its fields. Then `verify.sh <KEY> branch` -> 0 `pass`; `verify.sh <KEY>
propose` -> 0 `pass`; 1 with `propose_verdict: not-shippable`: halt with `.propose_reason` (the issue text is
the user's to change). After `pass`, print one line each for design.md's `## Descoped` items and `## Soft
dependencies`. `bash $W/state.sh descopes <KEY>`: an item that restates the issue's own exclusion text
(`via: "ticket"`) is already accepted. Under `--auto-decide`, an unaccepted item that is in the issue's title
or acceptance criteria: halt naming it and the way on, `bash $W/state.sh accept-descope <KEY> "<item>"`, then
`/ship <KEY>`. Every other unaccepted item (`gaps`) is a real gap: `bash $W/state.sh followup <KEY> "<item>"`
opens its follow-up issue and records the descope as accepted; exit 1: halt, a gap with no issue is lost.
Post-deploy and operator-only criteria are `## Human checks`, not descopes.
tasks.md's `## Human checks` go verbatim into the final report.

**implement.** Worker stage. After `pass`: `bash $W/e2e-gate.sh <KEY>`; unless `skip`, start `bash
$W/stack.sh up <KEY> $RUN_ID` in the background now (it returns once the stack is booted) so it is warm by e2e.

**security-gate.** `bash $W/gate.sh <KEY>` -> `{fires, reason}` (records `security-gate`, and `security:
skipped` when it doesn't fire). Then dispatch `simplify` alone: `security` reviews the tree simplify leaves,
never a half-edited one. Once simplify passes, `state.sh next` lists `security` beside `review` in `run`
when the gate fired: `state.sh stage <KEY> security running`, subagent with the `security` model and
`prompt.sh <KEY> security`, then dispatch `review` without waiting (both only read the tree). Before deciding
`fix-blockers`, wait for it and verify.

**simplify.** A `failure_reason` that is only Docker-bound specs verifies as pass with `unrun_specs`. On
`verify.sh` exit 1 read `simplify.json`'s `failure_reason`: a pre-existing test the issue's own behaviour makes
wrong: `$R/test-drift.md`; anything else: halt. `verify.sh` exit 2 that names deferred work ("too large"):
send it back once, `bash $W/worker.sh dispatch <KEY> simplify --note "<the deferred items, do them>"`; what
stays deferred on the second pass goes to the PR body. To rerun any stage with extra instructions, use `--note`
(`state.sh note <KEY> <stage> "<text>"` for a subagent stage); never edit a prompt template.

**fix-blockers.** `review` blockers + majors + minors + unmet criteria + `security` blockers, majors and minors
(0 when skipped) == 0: `state.sh stage <KEY> fix-blockers skipped`; else the worker stage, which fixes every
finding, minors included. Only a finding fix-blockers defers with a concrete reason (`deferred` in its handoff)
goes to the PR body under "Unresolved review findings"; a fixed finding never does.

**e2e (required).** Runs whenever `e2e-gate.sh` reports `browser`, which it does for every product-code change (ADR 0004, amended; D-051). Only a `skip` verdict (docs, tests, tooling, `.claude`) goes straight to `push`.

1. `e2e-gate.sh` `skip: true` (already recorded `skipped`): go to `push`; the PR body says why.
2. `state.sh stage <KEY> e2e running` (11 halt). A dead attempt's `created.json` ledger: reverse it with the
   eduvault-e2e cleanup first.
3. The background `stack.sh up` exits once the stack is booted, which wakes you: if it is still running,
   end your turn and wait for that; never wait on a command that does not exit. Then, in the foreground,
   `bash $W/stack.sh ready <KEY>`: it restarts the stack once if the branch gained a migration or the API
   bundle is older than its source, checks the API answers as Eduvault's and prints `{api, admin, portal}`.
   Exit 3: halt "no free e2e port set"; 1: halt with its output. Each run has its own ports and database,
   so e2e stages of parallel runs do not queue.
4. Subagent with the `e2e` model, `prompt.sh <KEY> e2e API=<api> ADMIN=<admin> PORTAL=<portal>` (the three
   URLs from step 3). A fresh `$D/e2e.question.json`: `$R/answering.md`.
5. `bash $W/stack.sh down <KEY> $RUN_ID`, whatever happened. Exit 4 (the run's browser session is still open
   and `e2e.json` is unwritten): `bash $ROOT/.claude/skills/eduvault-e2e/scripts/close-sessions.sh
--run=$(cat $D/e2e.run)`, then `down` again, or `down --force`.
6. `verify.sh <KEY> e2e` -> 0 `pass`. Anything else, BLOCKED with `cause: environment` included, halts with
   the reason: the run is required, so a change whose stack can't run never reaches `push`. Fix the
   environment and `/ship <KEY>` resumes at e2e. `state.sh skip-e2e` is for a person overriding by hand, never
   for this stage. `e2e.json`'s `partial` is a pass the PR lists as "Not verified locally".

**push.** Worker stage: commit, local checks, `git push`. Then `verify.sh` -> `pass`.

**pr.** Worker stage (haiku): the draft PR. After verify: `state.sh set <KEY> '.pr_url = $u' --arg u <pr_url>`,
`state.sh stage <KEY> pr pass`, `bash $W/issue-sync.sh <KEY>` (label `in-review`; a failure is reported, not a
halt). The PR stays a draft.

**merge-gate.** `$R/merge-gate.md`.

**finish** (`/ship <KEY> --finish`, where the human asks to merge and close, and automatically for an
`--auto-decide` run, which has no human gate: it runs right after the merge gate passes, in the same run).
`state.sh next` must report `next: cleanup` with `awaiting_merge: true`; anything earlier: halt "nothing to
finish: <KEY> is at <stage>". `bash $W/finish.sh <KEY>` prints the plan (mark ready, squash-merge at the gate's
head, close the issue); echo it in one line, then `bash $W/finish.sh <KEY> --yes`, adding `--via=auto-decide`
when the run is `--auto-decide` (it is only recorded in status.json). Exit 1: halt with its output, nothing is
forced; 2: the gate hasn't passed, run it; 21: PR not open; 23: held (`hold-merge`): not a halt, release
and report it, the ticket parks as `held` until the human lifts the label and merges. After exit 0
`state.sh next` reports `MERGED`: run **cleanup** as usual, and the final report says the PR is merged and
the issue closed.

**cleanup.** Each step idempotent: `bash $W/worker.sh close <KEY>`; `bash $W/stack.sh down <KEY> $RUN_ID` (exit 4: as in e2e step 5);
`bash $W/worktree.sh remove <KEY> $RUN_ID`. Exit 1 "not MERGED" is the normal outcome before the human
merges (a run that is not `--auto-decide`, or one held by `hold-merge`): do not record `cleanup pass`, and say
that re-running `/ship <KEY>` after the merge removes the worktree. Merged (`next` reported `pr_state: MERGED`): exit 0 -> `state.sh stage <KEY> cleanup pass`; exit 3
(gh/fetch failed): report, never force. Always release `$LOCK` before reporting. Final report: the PR URL,
`bash $W/report.sh <KEY>`'s `.line`, any `## Human checks`, and _"CI is green on the draft PR: mark it ready
and merge it, then close <KEY>. Re-run /ship <KEY> afterwards to remove the worktree."_

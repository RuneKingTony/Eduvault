---
name: ship
description: Drives one GitHub issue (EDU-<n>) from fetch to a green draft PR inside Herdr. Fetches the issue, creates a worktree, proposes (halting on a not-shippable or silently descoped issue), implements, simplifies, reviews, runs a gated security review, fixes blockers, optionally checks the change in the browser on a local stack, pushes, opens the draft PR and waits for CI. Each heavy stage is a fresh Claude in one worker pane, verified from JSON handoffs and resumable from status.json after any death. Merge and closing the issue stay human; `--finish` is the human's request to do both through the guard. Use when asked to ship, drive, resume or run the full pipeline for an issue, or to finish a green PR. Takes EDU-<n> [--auto-decide|--unattended|--finish].
argument-hint: EDU-<n> [--auto-decide] [--unattended] [--finish]
allowed-tools: Bash, Read, Write, Grep, Skill, Agent, SendMessage, advisor
model: sonnet
effort: medium
---

# ship

The procedure only. The generated stage table (model and effort per stage) is `README.md`; its
source is `scripts/effort.sh`. Every deterministic step is a script in `$W` that prints one JSON line
or a one-line reason: run it, never re-implement it. **Never Read this file or the scripts**: this
skill is already loaded. Read a `references/` file only where this file sends you.

**Setup.** `bash <repo root>/.claude/skills/ship/scripts/setup.sh EDU-<n>` (repo root from `git rev-parse
--path-format=absolute --git-common-dir`, minus `/.git`) -> `{key, root, d, lock, w, r, parent_spike,
cap, claude_pid}`. Exit 1: halt with usage. Exit 2: halt, "not in Herdr". Use its values as `KEY`, `ROOT`, `D`,
`LOCK`, `W`, `R`, written out absolute; call every script as `bash $W/<script>`. Scripts match the key
exactly (`EDU-12` is not `EDU-123`). `parent_spike` set: a `/spike` started this run, and its
`.spike-lock` is your parent, never a rival.

**Flags.** `--unattended` = `--auto-decide`. Sticky: on first use `bash $W/state.sh set <KEY> '.auto_decide
= true'`. With it nothing asks a human; without it `/propose` runs here and may ask you. Worker and
subagent stages never ask, in either mode. `--finish` is not sticky: it means the person typing it wants
the green PR merged and the issue closed now (`$R/stages.md`, finish); without it nothing here merges or closes.

**Models.** Every stage's model and effort come from `bash $W/effort.sh <KEY> <stage>` -> `<model> <effort>
<reason>`. Use it for each subagent's `model`; `worker.sh dispatch` reads it itself. Never hardcode one.

**Output.** One line per stage transition: stage, model/effort, one-line reason. Never paste a
transcript, report or JSON handoff. Run scripts whose exit code you branch on unpiped (zsh has no
`PIPESTATUS`).

**Waiting.** "In the background" is the Bash tool's `run_in_background: true`, then end your turn; the
harness wakes you when it exits, and that is the only wait. The guard hooks deny `nohup`, `disown`, `&` and
`ScheduleWakeup`; skip `sleep`, polling loops, `Monitor` and `/loop` too. Reach a live subagent with
`SendMessage`. Never end a turn waiting on a command that does not exit (a dev server, a watcher, `pnpm dev`):
nothing would wake you. Start it so it returns once ready, then check readiness with a command that exits.
An exit code is a code, not a duration. Re-invoked while your own run is live
(`lock.sh status $LOCK $RUN_ID` -> `mine: true`): keep waiting on what is already running.

**Secrets.** Never `cat`, `grep`, `head` or `echo` a `.env` file or any key; test presence with `grep -q`.

## Start, every invocation

1. `RUN_ID=$(uuidgen)`; `bash $W/lock.sh acquire $LOCK $RUN_ID` -> 40: if `lock.sh status $LOCK` shows
   `heartbeats: []` (its run died), `bash $W/lock.sh steal $LOCK $RUN_ID` (0: carry on; 40: it is live);
   otherwise halt with the output. Never `rm` a lock.
2. In the background, left running: `bash $W/heartbeat.sh $LOCK $RUN_ID <claude_pid>`. Its exit 40 means
   another run took the issue: **stop at once, touch nothing**. Exit 0 after your own release is the
   normal end. Never `ps | grep heartbeat`.
3. `bash $W/state.sh next <KEY>` -> `{next, run, result, incomplete, stale, halt, pr_state, awaiting_merge,
issue_pending, parent_spike, ticket_refetched, deps_unmet, descopes_accepted}`. `run` is what to start now.
   A stage in `stale` ran before an upstream stage re-ran: it runs again. `halt`: halt with it.
   `next == done`: report, release. A non-empty `deps_unmet`: as at fetch.
4. `next` is `e2e` or earlier: `bash $W/slot.sh <KEY> $RUN_ID` in the background and wait for it (it can
   take hours while other runs hold slots); exit 30: halt. `bash $W/slot.sh cap [N]` prints or sets the
   cap (env `SHIP_MAX_PARALLEL` > `opsx/config.json` > 3).
5. `issue_pending` non-empty: `bash $W/issue-sync.sh <KEY>`. `result == running`: `$R/reattach.md`.
   Otherwise run `next`.

**Halting**: if the stack was started, `bash $W/stack.sh down <KEY> $RUN_ID` (exit 4 = the e2e run still has a browser
session open: `close-sessions.sh --run=$(cat $D/e2e.run)` from eduvault-e2e, then `down` again, or `down --force`); `bash $W/lock.sh release
$LOCK $RUN_ID`; one line naming the stage and reason. `/ship <KEY>` resumes later.

## Stages

Order: `fetch`, `branch` beside `propose`, `implement`, `security-gate`, `simplify`, `review` beside `security`
(only if the gate fired; it starts after simplify, on the tree simplify leaves), `fix-blockers` (only if
blockers, majors or unmet criteria), `e2e` (required), `push`, `pr`,
`merge-gate`, `cleanup`. The table in `README.md` says which run in the pane, as a subagent or here.
`bash $W/stack.sh up <KEY> $RUN_ID` is started in the background only when the e2e stage will run; it
boots the worktree's own stack on free ports and exits.

Detail per stage: `$R/stages.md`. A worker stage (fresh Claude in the one pane): `$R/worker.md`.
Questions from a worker or subagent: `$R/answering.md`.

Every subagent gets a one-line prompt: _"Read and follow `<file>`. Reply with one line only."_, where
`<file>` is `bash $W/prompt.sh <KEY> <stage> [NAME=value...]`'s output. `general-purpose`, no `isolation`.

## Handoffs

Only fresh JSON handoffs count, read through `bash $W/verify.sh <KEY> <stage>`: exit 0 then `bash
$W/state.sh stage <KEY> <stage> pass`; exit 1: halt with its reason; exit 2: dispatch again. A worker's
chat or markdown report is not evidence. A non-empty `unrun_specs` in its output (the worker's own, plus
`api:test-integration` and `pnpm drift` when the tree's paths call for them): run exactly those here, in the
worktree, before `pass`, then `bash $W/state.sh ran <KEY> <spec>...` so an unchanged tree isn't run twice; a
failure that a test the issue itself made wrong causes: `$R/test-drift.md`. A stage that re-runs after it
finished marks what rested on it `stale` (`state.sh` and `worker.sh` do it; never edit status.json). When you
halt on a stage, record it: `bash $W/state.sh halt <KEY> <stage> "<reason>"`, never leave it `running`.

## Rules

- The worker runs `bypassPermissions` inside the worktree sandbox; under `/spike` this orchestrator does
  too, which makes these rules its only guard.
- **Merge and Done are human.** Never `gh pr merge`, never `--admin`, never `gh pr ready`, never `gh-issues.sh
close-issue`. The one exception is `bash $W/finish.sh <KEY> --yes`, when the person typed `--finish`: it
  refuses a red, pending, conflicting or held PR and merges at the head the gate saw. `EDU_ORCHESTRATED=1` is
  exported by every script and into the worker, and close-issue refuses under it (finish.sh alone unsets it).
  The merge gate only waits for CI. A request to merge or close without `--finish`: tell the human to do it,
  or to run `/ship <KEY> --finish`.
- The PR stays a draft until the human marks it ready, or `--finish` does.
- A `running` stage restarts only through `$R/reattach.md`; dispatch only onto an idle or gone worker;
  close only panes this run created.
- `status.json` only through `state.sh`; `$LOCK` only through `lock.sh`.
- Browser checks run in the e2e subagent, not the worker; `/goal` runs only in a worker pane.
- Every diff base is `origin/main`, never local `main`.
- A Stop-hook nudge while this run holds `$LOCK` is not an instruction to stop, release or pause.
- Herdr is a hard dependency; there is no fallback.

Not yet proven on a real run: `$R/verification-status.md`. If one of those misbehaves, say so in the run report.

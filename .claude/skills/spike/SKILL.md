---
name: spike
description: Epic-level orchestrator for GitHub issues. Walks a GitHub epic's sub-issues (EDU-<n>) in dependency order, critical path first, and runs /ship on up to N at once, each in its own vertical pane of one Herdr tab, refilling slots as PRs merge. Dependencies come from sub-issues, blocked-by links and ordering written in ticket text (after, depends on, blocked by, needs, before). A halted or dead ticket freezes only its connected component; a green PR waiting for your merge or a hold-merge label freezes nothing. Writes a progress board with a Mermaid graph. Use when asked to ship, drive or spike a whole epic, find the next tickets to pick up in an epic, or show where an epic run stands. Takes EDU-<epic> [--concurrency N] [--only [+]K,K|N-M] [--max-tickets N] [--auto-decide] [--dry-run|--status].
argument-hint: EDU-<epic> [--concurrency N] [--only [+]K,K|N-M] [--max-tickets N] [--auto-decide] [--dry-run] | EDU-<epic> --status
allowed-tools: Bash, Read, Write
model: sonnet
effort: medium
metadata:
  author: Jude Okafor
  version: '1.1'
  ported-from: fogado spike 1.4
---

# spike

Ship a whole epic: one `/ship EDU-<n>` per ticket, in DAG order, up to N at a time. Every deterministic
step is a script in `$SP`: run it, never re-implement it, never Read the scripts. `/ship` owns each ticket
end to end; spike only picks tickets, starts them and watches ship's files.

**Setup.** `<EPIC>` = `EDU-<n>`, uppercased. Missing or malformed: halt with usage.
`ROOT=$(git rev-parse --show-toplevel)` (the checkout you run from), `SP=$ROOT/.claude/skills/spike/scripts`,
`W=$ROOT/.claude/skills/ship/scripts`, `D=$ROOT/.claude/opsx/epic-<EPIC>`. Write them out absolute in
every command, never `cd … &&`. **Dispatching needs `HERDR_ENV=1`.** If it is unset and the run is not
`--status` or `--dry-run`, halt before anything else with: "spike dispatches into Herdr panes; start Claude from a Herdr pane."
Every dispatch script exits 13 with that message on its own. `--status` and `--dry-run` need no Herdr.

**Waiting.** "In the background" means the Bash tool's `run_in_background: true`, then end your turn. That is
the only wait (the guard hook denies `nohup`, `disown`, `&`). One `wait.sh` at a time, left to exit on its
own; no `sleep` or polling loops. A script that may run minutes (`dispatch.sh`) runs in the background too.

**Secrets.** Never print a `.env` file or a key.

## Flags

| Flag              | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--status`        | `bash $SP/walk.sh <EPIC> --status`, then stop: `spike loop: live\|not running`, **Needs you**, **In flight**, the board. Writes nothing, dispatches nothing. Fetches the graph once if none is cached                                                                                                                                                                                                                                          |
| `--dry-run`       | `init.sh <EPIC> <flags…> --dry-run`, `graph.sh <EPIC> --fresh`, `walk.sh <EPIC> --dry-run`: the order and what would dispatch now, then stop. Stores no flags, starts nothing                                                                                                                                                                                                                                                                  |
| `--concurrency N` | tickets running at once. Default 3, hard cap 10 (a larger N is clamped)                                                                                                                                                                                                                                                                                                                                                                        |
| `--only SPEC`     | dispatch only these tickets; the rest still gate through their edges. SPEC is a comma list of keys, bare numbers and ranges: `EDU-401,EDU-404`, `401-432`, `401-410,415,420-425`. Ranges expand and dedupe. A ticket that is not a child of the epic halts the run (walk exits 3 with `ERROR: --only EDU-411 is not a child of EDU-400`); a malformed or reversed range halts at `init.sh` (exit 2). `--only +SPEC` appends to the stored list |
| `--max-tickets N` | stop dispatching after N tickets have started **in this run**                                                                                                                                                                                                                                                                                                                                                                                  |
| `--auto-decide`   | forwarded to every `/ship`: no questions, and each green PR is merged and its issue closed by ship (no human gate)                                                                                                                                                                                                                                                                                                                             |

Flags are **sticky**: `init.sh` stores them in `$D/status.json`; a resume without flags keeps them (losing
`.only` would widen the run to the whole epic), a flag passed again overrides.

**Concurrency cap** = min(`--concurrency`, 10). `dag.mjs` applies it (`cap`), and `dispatch.sh` starts every
ticket pane with `SHIP_MAX_PARALLEL=<cap>` so ship's `slot.sh` admits the same number. `slot.sh` counts
**every** live `/ship`, including ones outside this epic, so a ticket can still wait there. Above about
4-5 your machine and model rate limits bind first. Merges are human, so open PRs pile up behind the dependency gate, not behind a merge queue.

## Start: every invocation except `--status`

1. `mkdir -p $D`. `RUN_ID=$(uuidgen)`. `bash $W/lock.sh acquire $D/.spike-lock $RUN_ID` -> 40 means another
   spike owns this epic. Then `bash $W/lock.sh status $D/.spike-lock`: `heartbeats` empty and `age` over 180 is a
   dead owner (a killed session), so `bash $W/lock.sh steal $D/.spike-lock $RUN_ID` and carry on; anything else
   halts with acquire's output. Never `rm` the lock. The file is `.spike-lock`, never `.lock`, because `slot.sh`
   counts every `.lock` as a running ship.
2. `echo $PPID` in the foreground, then leave `bash $W/heartbeat.sh $D/.spike-lock $RUN_ID <pid>` running in
   the background. Exit 40 means another session took the epic: **stop at once**.
3. `bash $SP/init.sh <EPIC> <flags…>` -> `{cap, budget_left, only, run_started, auto_decide, …}`. Print one line
   with cap and budget (`ship_max_parallel` always equals `cap`). `auto_decide` false: say so in that line, since
   each ticket's `/propose` then runs inside its ship pane and waits for a person. It marks the cached graph
   stale, so the first walk refetches GitHub.
   Under `--dry-run` skip steps 1-2 (and never needs Herdr).

## The loop

1. **Graph.** `bash $SP/graph.sh <EPIC> --max-age 900` -> `{nodes, edges, hash, changed, soft_edges}`. Exit 1 is
   a hard halt (gh-issues.sh failure, a link or text reference that doesn't resolve, a cycle): print its
   lines and let the user fix the issues. Soft edges (ticket text says "after/depends on/blocked by/needs EDU-n"
   with no link) gate like links, the same parser ship halts on. A changed edge on a ticket already in flight
   doesn't stop it; the user can `withdraw.sh` it.
2. **Walk.** `bash $SP/walk.sh <EPIC>` -> `{complete, stalled, held_done, budget_done, cap, slots, dispatch,
auto_resume, eligible, inflight, done, halted, held, frozen, blocked, errors, …}`; it rewrites
   `$D/progress.md`, renames the tab and notifies on transitions. Rules: [references/dag-walk.md](references/dag-walk.md).
   Then `bash $SP/reap.sh <EPIC>` and print each `closed pane` line.
3. **Stop?** `errors` non-empty (walk exits 3) -> halt with it. `complete` -> final report. `held_done`
   (only held tickets, and what waits behind them, remain) -> report _complete except held_. `budget_done`
   -> stop report. `stalled` (nothing running, nothing can start, no pane waiting on the user) -> stop report.
4. **Dispatch.** First each `auto_resume` key (a `died` ticket, resumed once per run):
   `bash $SP/dispatch.sh <EPIC> <KEY> --auto-resume` (17 = refused, log it). Then each key in `dispatch`, in
   order: `bash $SP/dispatch.sh <EPIC> <KEY>` -> `<KEY> -> pane <pane>`. `dispatch.sh` reads `auto_decide` from
   `$D/status.json` on every call (a flag passed once is stored), so no dispatch or resume ever drops it.
   Never exceed `slots`. Dispatches that overlap queue on a mutex, so background them freely. Exits: 12 already
   live, skip; 13 Herdr is broken, halt the run; 14/15 log it, `observe.sh` reports it; 16 pane start failed,
   nothing recorded, the next walk retries; 18 the mutex was held 10 minutes, retry on the next walk.
   Each ticket's `/ship` starts in `bypassPermissions` (`dispatch.sh`), so `blocked-ui` is a real question or a
   startup dialog. A ticket pane belongs to ship: the only typing into it is `relay.sh --answer` with the
   user's own words. Answering yourself would approve an action in the user's name.
5. **Wait.** `bash $SP/wait.sh <EPIC>` in the background. Exit 0: a ticket changed state; print its line (each
   starts with its key) plus stage moves and reap lines, then go to step 1. Exit 30: nothing moved in 90
   minutes; print the `--status` board and go to step 1 anyway.

One output line per event: dispatched, auto-resumed, merged, halted, died, blocked-ui, waiting-user, held,
graph changed. Report from the board and events, not a pane's transcript.

## User-approved operations

Only on the user's explicit ask in this session:

- **Re-run** a `halted`, `died` or lifted-`held` ticket: `dispatch.sh <EPIC> <KEY> [--auto-decide] --resume`.
- **Withdraw** an in-flight ticket: `withdraw.sh <EPIC> <KEY> [--close]` (frees the slot, never stops ship).
- **Widen** the run: `init.sh <EPIC> --only +SPEC`.
- **Relay** a pane's question: `relay.sh <EPIC> <KEY> --show`, ask with AskUserQuestion using its options,
  then `relay.sh <EPIC> <KEY> --answer "<their exact words or option number>"`.
- **Link** a soft edge on GitHub: `$ROOT/.claude/skills/github-issues/scripts/gh-issues.sh create-link <n> blocked-by <m>`
  (dry-run unless `--yes`), then confirm with `list-links <n>`.
- **Diagnose**: `diagnose.sh <EPIC> <KEY>` (read-only: ship's stage and lock, panes, the e2e stack's ports and
  who holds them). Run it on the first `waiting-user` for a ticket and on any in-flight line labelled
  "waiting on a background task", before telling the user anything about why it is idle.
- **Close issues**: spike never does. Under `--auto-decide` ship's `finish.sh` closes the issue it merged; otherwise closing is the human's, one ticket at a time.

## Outcomes, from ship's files only

`observe.sh` reads `.claude/opsx/<KEY>/` (`status.json`, `.lock`) and confirms merges with `gh pr view`.
Never judge a ticket by its pane's chat.

| state                 | meaning                                                                                                    | spike does                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `done`                | merge-gate `pass` and the PR is `MERGED`                                                                   | dependents become eligible                                                                                                 |
| `running`             | ship's lock heartbeat < 10 min old and its process alive (or dispatched < 15 min ago)                      | waits. An idle pane waiting on a background task (stack still listening) stays here, labelled on the board                 |
| `blocked-ui`          | the pane waits on a permission prompt or question                                                          | reports it; freezes its component                                                                                          |
| `waiting-user`        | live lock, pane idle > 20 min and its last message asks something (no question: idle > 60 min)             | reports it with the pane's last lines; holds its slot, freezes nothing                                                     |
| `held`                | no live lock, PR not merged: merge-gate recorded `held` (`hold-merge`), or `pass` with the PR still open   | not a halt: freezes nothing, frees its slot, keeps its pane; dependents stay blocked. Ends a run as _complete except held_ |
| `halted`              | ship stopped and released its lock, not merged                                                             | freezes its component; never re-dispatched                                                                                 |
| `died`                | a ship lock is still on disk and its heartbeat is over 3 min old with no heartbeat process, or over 10 min | auto-resumed once per run; a second death freezes like `halted`                                                            |
| `withdrawn`           | the user withdrew it                                                                                       | frees its slot                                                                                                             |
| `merged-outside-ship` | PR `MERGED` but merge-gate never passed                                                                    | counts as `done`, flagged on the board                                                                                     |
| `none`                | not started (partial ship state is adopted; `/ship` resumes)                                               | eligible when its blockers are done                                                                                        |

Without `--auto-decide`, merging is human: a run parks every finished ticket at `held` until you merge its PR;
its dependents start on the next walk after the merge. Merge, then `/ship <KEY>` in its pane runs cleanup. With
`--auto-decide` each `/ship` merges and closes its own green PR (ship's `finish.sh`), so tickets go straight to
`done` and dependents start as soon as it merges; `held` then means a `hold-merge` label (or a red PR ship halted on).

## Panes

Each ticket is a vertical column in one unfocused `spike · <EPIC>` tab; ship splits its worker below.
`reap.sh` closes a column only after the merge is confirmed, ship's `cleanup` passed, its lock is released
and the pane is idle. Halted, `held` and `blocked-ui` panes stay open. Details: [references/layout.md](references/layout.md).

## Stop report

First sentence: _complete_, _complete except held tickets_, _stalled_, or _stopped at --max-tickets_. Then:
panes closed or kept (`reap.sh <EPIC> --all-done`); the board and the path to `$D/progress.md`; each `held`
ticket with its PR and "merge it, then `/ship <KEY>`"; each halted ticket with its stage and "fix with
`/ship <KEY>`, then re-run `/spike <EPIC>`"; each died-again ticket with `dispatch.sh … --resume`; each
`waiting-user` pane with its last line; each stalled blocker and exactly which keys it waits on; wall-clock
since `.started`. Merged issues stay open unless the run was `--auto-decide` (ship closes those): closing them is yours otherwise. Then `bash $W/lock.sh release $D/.spike-lock $RUN_ID`.

## Rules

- Spike never touches git, PRs or issue state itself. `/ship` does all of it.
- Dispatch only what `walk.sh` lists in `auto_resume` and `dispatch`, within `slots`.
- `halted` and `held` tickets wait for the user. A `died` ticket is resumed once per run; a second death waits too.
  Ticket panes close only through `reap.sh`, or `withdraw.sh --close` on the user's ask.
- A halt freezes only its weakly connected component. A hold freezes nothing.
- No file-overlap gate: one monorepo would force concurrency to 1. Ship's merge-gate and merge-sync handle collisions.
- Test after any change to the scripts: `bash $SP/test-dag.sh` (no Herdr, no network; every line must say PASS).

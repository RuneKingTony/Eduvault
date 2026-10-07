# Pane layout and reaping

How `dispatch.sh` places ticket panes and when `reap.sh` closes them. Read when a pane is in the
wrong place, won't close, or closed too early. The scripts implement all of this. Never do it by
hand.

## One tab per spike run, one column per ticket

The session where `/spike` runs is never split. On the first dispatch, `dispatch.sh` opens one
unfocused tab `spike · <EPIC>` (`.spike_tab`, root pane `.spike_tab_root`). Every ticket is a
full-height vertical pane in that tab.

```
Tab "spike · EDU-329"
┌────────────────┬────────────────┬────────────────┐
│ EDU-265 /ship  │ EDU-273 /ship  │ EDU-301 /ship  │ ← 1st ticket: the tab's root pane
│                │                │                │   next: rightmost live column split RIGHT
├────────────────┼────────────────┼────────────────┤
│ ship worker    │ ship worker    │ ship worker    │ ← ship's own split DOWN (worker.sh, ratio 0.65)
└────────────────┴────────────────┴────────────────┘
```

- **Equal widths.** With N = the cap (`dag.mjs` `cap`, also passed to every pane as `SHIP_MAX_PARALLEL`) and k−1 columns open, the k-th split keeps
  `1/(N−k+2)` of the rightmost column on its left, so every column is W/N wide. Past N, it halves.
- **Refill.** The root pane is reused only when no live, un-withdrawn `.dispatched` entry holds it
  **and** Herdr reports no agent in it (`herdr pane get` → no `.agent`). A root pane still holding
  an idle Claude (its ticket was re-dispatched elsewhere) is not free: `herdr agent start` needs a
  shell prompt. Otherwise the rightmost top-row pane of the tab is split (any pane, recorded or not).
- **Rebalance.** Split ratios drift once panes close (Herdr gives a closed pane's width to its tree
  neighbour), so `rebalance.sh <TAB>` runs after every dispatch and at the end of every `reap.sh`,
  moving each top-row boundary back to W/N. Run it by hand to even out a tab.
- **Tab lifetime.** When `reap.sh` closes the tab's last pane, it closes the tab and clears
  `.spike_tab`. The next dispatch opens a new tab. A tab the user closed is also re-created.
- **Env.** Every ticket pane gets `HERDR_ENV=1`, `SHIP_MAX_PARALLEL=<cap>` and `SPIKE_EPIC=<EPIC>`
  (ship reads the last to know it runs under this epic's `.spike-lock`). A reused pane's shell
  predates the dispatch, so `dispatch.sh` also `export`s them there before starting Claude.
- `.dispatched[KEY]` records `tab`, `pane`, `anchor`, `direction` (`root`, `right`, `resume`),
  `agent`, `epoch`, `attempts`, `panes` (every pane/agent it ever ran in, oldest first; `pane` and
  `agent` are always the current one) and, once reaped, `closed_at`; `withdrawn_at` once withdrawn.
  It is written the moment Claude starts, so every started ticket is recorded. A re-dispatch clears
  `closed_at` and `withdrawn_at`. `dispatch.sh` also refuses (12) any ticket whose ship lock is live,
  recorded or not (a ticket started by hand).

## dispatch.sh exits

| exit    | meaning                                                                                                      | orchestrator                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0       | started: `{key, pane, anchor, direction, agent, attempts}`                                                   | —                                                                                                                                                                                    |
| 12      | already live (its agent is working/blocked, or ship's lock is live)                                          | skip it                                                                                                                                                                              |
| 13      | Herdr is broken (not in Herdr, tab create or pane split failed)                                              | halt the run                                                                                                                                                                         |
| 14 / 15 | Claude on a startup dialog / `/ship` didn't start (recorded)                                                 | log it; observe reports it. Ready means `idle`, or `done` with `interactive_ready` and the prompt showing (`ship/scripts/ready.sh`): a reused pane's fresh Claude can inherit `done` |
| 16      | `herdr agent start` failed in the chosen pane; nothing recorded, a split pane was closed, a reused pane kept | log it; it is retried on the next walk                                                                                                                                               |

## Resume, withdraw, diagnose

- `dispatch.sh <EPIC> <KEY> --resume` — only with the user's OK, for a `halted` or `died` ticket.
  Refuses (12) while ship's lock is live. If the recorded pane still exists with no agent, or with
  an idle Claude (which is `/exit`ed first), `/ship` starts there with a fresh Claude; if the pane
  is gone or its Claude is busy, a new column opens. `attempts` goes up and the pane joins `panes`.
- `withdraw.sh <EPIC> <KEY> [--close]` — takes a dispatched ticket out of the run (e.g. a Blocks link
  added mid-run now gates it). Sets `withdrawn_at`, so its slot frees on the next walk; it is
  `withdrawn` while ship's lock stays live, then `none` (eligible once its blockers are done). It
  never stops ship: only when the user asks, stop ship through its own lock. `--close` closes the
  pane only when ship's lock is no longer live and its Claude isn't working/blocked. A pane the user
  already closed is marked `closed_at`.
- `diagnose.sh <EPIC> <KEY> [lines=10]` — read-only one-screen summary: ship's current stage,
  attempt and handoff reason, lock age (live / stale = died / none), spike pane + agent status,
  ship's worker, PR state, the pane's last lines. Use it instead of reading ship's files.

## When a ticket pane closes

`reap.sh` runs after every walk and on every `wait.sh` tick. It closes a pane (after `/exit`ing
its Claude) only when **all** of these hold:

1. the merge is confirmed (`.merged[KEY]`, from `gh pr view` → `MERGED`)
2. ship's `cleanup` stage is `pass`. Cleanup closes ship's worker pane and worktree, and closing
   the column earlier would kill it.
3. ship's lock is no longer live (heartbeat ≥ 10 min, or released)
4. the pane's Claude is not `working` or `blocked`

| ticket                                             | its pane                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| merged and cleaned up                              | closed by the next `reap.sh`                                                                                      |
| running, or merged while ship is still cleaning up | kept                                                                                                              |
| `halted` / `died` / `blocked-ui` / `waiting-user`  | kept, for the user to read or answer; reaped once the ticket merges                                               |
| `held` (merge-gate hold)                           | kept: the operator resumes `/ship <KEY>` in it after merging by hand; reaped once the ticket merges and cleans up |
| withdrawn                                          | kept until it merges, or `withdraw.sh --close` once ship has stopped                                              |
| `merged-outside-ship`                              | kept: ship never ran `cleanup`, so the user closes it                                                             |
| Claude failed to start in it                       | a split pane is closed by `dispatch.sh` at once (exit 16); a reused pane is kept                                  |

A pane the user already closed counts as closed. `reap.sh <EPIC> --all-done` also prints each
kept pane and why.

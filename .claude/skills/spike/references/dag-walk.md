# The DAG walk (`dag.mjs next`)

Read when a dispatch order looks wrong. Everything here is computed fresh on every walk. Nothing
is trusted from a previous one.

## Graph (`graph.sh`)

- Children: `gh-issues.sh list-children <n>` (the epic's GitHub sub-issues).
- Edges: `list-links` per child. A child's `blocked_by` and any `blocks` pointing at it are normalised to
  `blocked_by` as the **union**, so a link reported from either end is the same edge. A child blocking an issue
  outside the epic is dropped.
- A blocker that isn't a child of the epic becomes an `external` node with its own state. It is never dispatched,
  and it satisfies an edge only when it is closed (or `state.sh dep-status` finds it merged, when ship has that script).
- Hard halt (exit 1): a gh-issues.sh failure, a link or text reference to a key that doesn't resolve, or a cycle
  (a cycle would deadlock forever).
- `hash` covers the edge set. `changed` means links were edited on GitHub since the last walk. `graph.sh` appends
  the `<iso> graph changed: old->new (+A->B, -C->D)` line to `log.md` itself.
- Cache: `--max-age S` reuses `graph.json` while younger than S; `--fresh` always refetches. `init.sh` ages the
  cache on every real invocation, so a run's first graph always comes from GitHub.
- **Soft dependencies.** Each child's body goes through `soft-refs.jq` (_do after / after / depends on / blocked by /
  needs EDU-n_, and _before EDU-n_ the other way; an issue URL counts as its key). Those that aren't already a
  blocked-by link become `soft_edges` (`{key, blocked_by, from, phrase, in_epic, satisfied}`). They gate, freeze and
  order exactly like links, count in the cycle and dangling-key checks, and draw dashed in the Mermaid graph.

## Satisfied

A blocker is satisfied if **either** of these holds:

- the issue is closed (shipped earlier, or by hand), or
- `observe.sh` says `done`: ship's merge-gate is `pass` **and** `gh pr view` says `MERGED`, or
- `observe.sh` says `merged-outside-ship`: `gh` says `MERGED` but ship's merge-gate never passed
  (someone merged by hand; checked only once ship's lock is no longer live). Flagged on the board.

You need both arms. Ship never closes an issue, so with only the closed arm the epic would
deadlock after its first merge. `In Review` alone never counts, because an open PR can still be
rejected.

## Eligible

A ticket is eligible when all of these hold: it's in scope (`--only`), not done, `observe` state
`none`, every blocker is satisfied, and its component isn't frozen.

`--only` is sticky and takes keys, bare numbers and ranges (`401-410,415,420-425`; `only.mjs` expands and dedupes
them, and every key must be a child of the epic or the walk halts with `errors`). `--only SPEC` replaces the stored
list; `--only +SPEC` appends to it (widening a
run mid-flight, e.g. "also dispatch 356 and 357" → `init.sh <EPIC> --only +356,357`). On a
run without `--only` (the whole epic) `+` changes nothing.

## Observed states

| state                         | slot      | component  | notes                                                                                                                                                                                                                       |
| ----------------------------- | --------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `running`                     | holds one | —          | live ship lock, or dispatched < 15 min ago                                                                                                                                                                                  |
| `blocked-ui`                  | holds one | frozen     | the pane's Claude is on a prompt                                                                                                                                                                                            |
| `waiting-user`                | holds one | not frozen | live lock, ticket pane idle, ship's worker not working, ship wrote no file for 20 min (`WAIT_USER`). Carries `pane_tail` (last 5 lines); not stalled                                                                        |
| `held`                        | free      | not frozen | ship's merge-gate recorded `held` (`hold-merge`, merge.sh exit 23), no live lock, PR not merged. Not done, so its dependents stay `blocked`; never eligible, never re-dispatched; holds no slot. Carries `reason`, `pr_url` |
| `halted`                      | free      | frozen     | dispatched, not merged, ship **released** its lock. Never re-dispatched                                                                                                                                                     |
| `died`                        | free      | frozen     | dispatched, not merged, ship's lock is **stale but still on disk** (the session was killed, not a ship halt). Never re-dispatched automatically; with the user's OK, `dispatch.sh <EPIC> <KEY> --resume`                    |
| `withdrawn`                   | free      | —          | `withdraw.sh` ran and ship still holds a live lock; not eligible until ship stops                                                                                                                                           |
| `none`                        | —         | —          | eligible once blockers are done. Includes a withdrawn ticket whose ship has stopped, and a ticket spike never dispatched that left partial ship state (ship resumes it)                                                     |
| `done`, `merged-outside-ship` | free      | —          | satisfy their dependents                                                                                                                                                                                                    |

`next` also returns `waiting_user` (`[{key, reason, pane_tail}]`), `held` (`[{key, reason, pr_url}]`),
`merged_outside`, `withdrawn` and `soft_edges`.

## Order: critical path first

`depth` is the longest chain of not-done dependents below the ticket. Sort by depth descending,
then by key ascending (numeric). The longest chain starts first, so it doesn't become the tail of
the run. `dispatch` is the head of that order, cut to `slots = cap − inflight − blocked-ui` (a `blocked-ui` ticket still holds a live ship lock, which ship's `slot.sh` counts; `cap` = min(`concurrency`, 10
e2e port sets)) and to the `--max-tickets` budget left. A spent budget with nothing
running is `budget_done`, a clean stop, not a stall.

The budget is per run: `init.sh` stamps `.run_started` on every real invocation with the epic's
`.spike-lock` `acquired_epoch` (so re-running `init.sh` inside the same `/spike`, e.g. `--only +K`,
keeps the budget; a new `/spike` takes a new lock), falling back to now, and only
`.dispatched` entries with `epoch >= run_started` count (a `--resume` re-stamps its entry's
`epoch`, so it counts). `init.sh` prints `{cap, budget_left, only, run_started, …}` up front.

## Components and halts

Weakly connected components are computed over the epic's tickets, ignoring edge direction. When
a ticket is `halted`, `died` or `blocked-ui`, every not-done ticket in its component is `frozen`: nothing
there dispatches, but other components carry on. There's no stored halt flag. Once the ticket is
fixed (`/ship <KEY>` merges it, or its lock is live again), the freeze lifts on the next walk.

## Held

`held` is observed from ship's own record: merge-gate `result: held` (written by `merge.sh` on exit 23), no live
lock, PR not merged. It is checked after the live-lock and merged-by-hand arms, so a hold merged by hand reads
`merged-outside-ship` (done) and a resumed ship reads `running`. It is not in `halted`, so it freezes nothing; an
unrelated ticket that shares a downstream node with it stays eligible, and the downstream node stays `blocked`
(`unmet` names the held key).

`held_done` means nothing is running or startable, nothing is halted, and every ticket still in scope is either
`held` or sits (transitively) behind one: a clean stop, reported as _complete except held_. `complete` stays
strictly "every in-scope ticket done". A held ticket never makes a run `stalled`, but a stall for another reason
(an external blocker, a halt) still is one.

## Stalled

`stalled` means not complete, not `held_done`, nothing eligible, nothing in flight, no `blocked-ui` or
`waiting-user` pane waiting on the user, and the `--max-tickets` budget not spent. The report names every
`blocked` ticket with its unmet keys, and every halted ticket with its reason. A halt (a ticket ran
and stopped) and a dependency wait (tickets that never got to run) are reported separately.

## Tests

`bash .claude/skills/spike/scripts/test-dag.sh` needs no Herdr and no network. It runs `dag.mjs` on hand-built
graphs (diamond, halted component, `blocked-ui`, external blocker, `--only`, the concurrency clamp to 10,
`--max-tickets`, withdrawn, `merged-outside-ship`, `waiting-user`, `died`, `held`, soft edges, cycle, dangling key),
`only.mjs` (ranges, dedupe, bad input), and `init.sh`/`graph.sh`/`walk.sh --dry-run` over `scripts/fixtures/<case>/`
through `GH_ISSUES_FIXTURE_DIR` (linear, diamond, cycle, external, soft, range). It also checks that every dispatch
path exits 13 with a message when `HERDR_ENV` is unset. Every case must print `PASS`.

---
name: Spike
description: Ship a whole GitHub epic (EDU) by running /ship on its sub-issues in dependency order, up to N at once, each in its own Herdr pane. Delegates to the spike skill. Takes EDU-<epic> [--concurrency N] [--only K,K|N-M] [--max-tickets N] [--auto-decide] [--dry-run|--status].
model: sonnet
effort: medium
argument-hint: EDU-<epic> [--concurrency N] [--only [+]K,K|N-M] [--max-tickets N] [--auto-decide] [--dry-run] | EDU-<epic> --status
allowed-tools: Skill
disable-model-invocation: false
---

Drive every sub-issue of an Eduvault epic through `/ship`, critical path first.

**Start it in a fresh session** inside Herdr (`HERDR_ENV=1`): `claude "/spike EDU-40"`, or `/clear` first.
Dispatching refuses to run outside Herdr. `--status` and `--dry-run` don't need it.

**Input** (`$ARGUMENTS`): an epic key is required, otherwise halt with usage:

```
/spike EDU-40
/spike EDU-40 --concurrency 2 --auto-decide
/spike EDU-40 --only 41-52 --max-tickets 4
/spike EDU-40 --only 41-45,48,50-52
/spike EDU-40 --dry-run
/spike EDU-40 --status
```

**Flags** (sticky: stored on first use, so a resume without flags keeps them):

- `--concurrency N`: tickets running at once. Default 3, capped at 10.
- `--only SPEC`: dispatch only these children. SPEC mixes keys, bare numbers and ranges (`41-52`); every ticket must be a child of the epic or the run halts. The rest still gate through their links. `--only +SPEC` appends.
- `--max-tickets N`: stop dispatching after N tickets have started.
- `--auto-decide`: forwarded to every `/ship`.
- `--dry-run`: print the dispatch order and stop. Stores nothing, dispatches nothing.
- `--status`: print the board from disk and stop.

The order comes from the epic's sub-issues, `blocked by` links, and ordering written in ticket text
(after, depends on, blocked by, needs, before). A cycle or an unresolved key halts the run. Each
ticket's `/ship` runs in `bypassPermissions` in its own column of one `spike · <EPIC>` tab. A ticket
that halts freezes only its connected component; fix it with `/ship <KEY>` and re-run `/spike <EPIC>`.
Merging PRs and closing issues stay with you.

Invoke the **`spike`** skill, passing `$ARGUMENTS` and all flags through verbatim. The skill owns the DAG walk,
dispatch, pane layout, reaping and flag semantics.

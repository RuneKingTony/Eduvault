---
name: Ship
description: Drive a GitHub issue (EDU-<n>) from fetch to a green draft PR inside Herdr, resumable after any death. Delegates to the ship skill. Takes EDU-<n> [--auto-decide|--unattended].
model: sonnet
effort: medium
argument-hint: EDU-<n> [--auto-decide] [--unattended]
allowed-tools: Skill
---

Run the Eduvault issue-to-PR pipeline. Merge and closing the issue stay with a human.

Start it in a fresh session (`claude "/ship EDU-12"`, or `/clear` first): the orchestrator re-reads its
whole context on every turn, so an earlier conversation is paid for each time.

`$ARGUMENTS` must start with an issue key; without one, halt with usage:

```
/ship EDU-12
/ship EDU-12 --auto-decide
/ship EDU-12 --unattended
```

- `--auto-decide`: `/propose` runs as a subagent and takes the recommended option for every decision.
- `--unattended`: alias of `--auto-decide`.

Needs Herdr (`HERDR_ENV` set); the skill halts without it. Invoke the **`ship`** skill, passing
`$ARGUMENTS` and all flags through verbatim. The skill owns the stage list, dispatch, resumability,
gates and flag semantics.

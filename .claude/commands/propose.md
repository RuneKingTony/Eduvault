---
name: Propose
description: Research a GitHub issue (EDU-<n>) or a described change end to end, grill the draft, write design.md/tasks.md, then hand off to implementation with a generated /goal line. Delegates to the propose skill.
model: opus
effort: high
argument-hint: <EDU-n|description> [--auto-decide]
allowed-tools: Skill
disable-model-invocation: false
---

Research and design a change: the `propose` stage of the Eduvault issue-to-PR pipeline, runnable standalone.

**Input** (`$ARGUMENTS`): an issue key or a short description is required:

```
/propose EDU-12
/propose EDU-12 --auto-decide
/propose add a void action for fee payments
```

If omitted, halt with usage.

**Flags**:

- `--auto-decide`: resolve design and grilling decisions by taking the recommended option instead of asking, and log each one to `.claude/soul/decisions.jsonl`.

Invoke the **`propose`** skill, passing `$ARGUMENTS` and all flags through verbatim. The skill owns the research, the decision-capture contract, and the `/goal` handoff.

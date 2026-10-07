---
name: Enrich
description: Reality-check a GitHub issue (EDU-<n>) against the current Eduvault code before any implementation. Delegates to the enrich-ticket skill.
model: sonnet
argument-hint: <EDU-n>
allowed-tools: Skill
disable-model-invocation: false
---

Enrich and scope an issue against the codebase. Read-only; it writes no code.

**Input** (`$ARGUMENTS`): an issue key, `EDU-<n>` or a bare `<n>`. If omitted, halt with usage:

```
/enrich EDU-12
```

Invoke the **`enrich-ticket`** skill with `$ARGUMENTS` passed through verbatim.

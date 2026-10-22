# Writing the report and findings

The reader is a person deciding what to fix, not a test log. Lead with what matters most, in words a non-engineer can follow. Mechanism, ids and file paths come last.

## Order

Sort findings by severity (critical, high, medium, low), then by how many people it hits. Show at most five in "Fix these first": every critical and high, then the worst medium. Everything else goes in a table, one line each. Passing checks appear only as counts.

## Words

- Title: what a person sees or can no longer do. "Bursar cannot save a payment: the Save button stays grey", not "disabled prop wrong on RecordPaymentSheet".
- Say who is affected (which role, which campus, how often) and what is at stake (wrong money, data shown to the wrong school, a flow that cannot finish, or only looks off).
- No jargon without a gloss: write "the school's cash account" and give the status code once, in the detail.
- One finding is one problem. If two things share a cause, say so in the cause line, not in the title.
- Say how sure you are: seen on screen and confirmed through the API, or seen once.

## report.md layout

Lines 1 to 15 must satisfy the eduvault-e2e report rules, so the opening is:

```
VERDICT: FAIL
failed: <the worst finding as one plain sentence>
artefacts: <abs path to the run folder>
goal: <area verified>
passed 48, failed 6, blocked 0 · critical 0 · high 1 · medium 2 · low 3
```

Below that:

1. `## Fix these first`: per finding, four short lines.
   - **What happens:** what the person sees.
   - **Who and why it matters:** role, campus, consequence.
   - **How to see it:** at most three steps.
   - **Detail:** finding id, check id, screenshot path.
2. `## Everything else`: table of id, severity, one-line plain title, check id.
3. `## What passed`: the section table of counts.
4. `## Not verified`: what was skipped and why. Never empty on a FAIL or BLOCKED run.

The same order is what you say in chat: the worst findings first in a few plain sentences, then the folder path. Do not open with counts or a section list.

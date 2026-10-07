# Prose rules

What to cut and what to leave untouched when rewording for density. Read during Step 6 of
`../SKILL.md`, which applies these to `SKILL.md` and to every reference file.

## Cut

- Preamble that restates the heading, and closing sentences that summarise what was just said.
- Hedges and filler: "please note", "it is important to", "in order to", "basically", "simply".
- The same instruction stated twice in different words — keep the more precise one.
- Motivation for a step whose purpose its own name already carries.

## Keep exactly as written

- Commands, paths, file names, flags, env var names, JSON keys.
- Any MUST / NEVER / ALWAYS and every halt condition — reword the sentence around it if you like,
  but never soften the force.
- Numbers, thresholds, and branch conditions.
- Repetition that is deliberate — a warning repeated at the point of danger stays.
- **Safety guards, whatever words they use.** Keep the sentence, and keep it in `SKILL.md`. Four
  categories, none of which need a MUST/NEVER to qualify:
  1. A confirmation before something outward-facing or irreversible — delete, push, force-push,
     merge, a comment or transition on a shared ticket, a message to a person, a change to shared
     infrastructure. "Needs an explicit ask", "show the dry run and let them confirm" and "not
     without `--yes`" all count.
  2. An anti-hallucination rule — "never invent", "never speculate", "report the path rather than
     substituting one", "read the file before claiming what it says".
  3. A scope limit on an autonomous action — a cap on subagents, cycles, retries or files touched;
     a rule against weakening a test, disabling a lint rule or bypassing a hook.
  4. A stated blast radius — which directory, branch, worktree or issue a command may act on.
     If you think one of these is redundant, report it in Step 9 and leave it in place.
- **Pointer lines** — "the rule lives in X", "do not restate it here". They read as filler and are
  not: they are this skill's own output format and the thing that stops the duplication returning.

## Style

Prefer the imperative: "Run X", not "You should now run X". Prefer a table or list to a paragraph
when the content is a set of cases. Follow ASD-STE100 Simplified Technical English.

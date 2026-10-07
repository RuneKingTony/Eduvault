# Redundancy rules

How to resolve a duplicate once the detectors and your own reading have found one. Read during
Step 4 of `../SKILL.md`, which reads every file under `references/` and runs `find-duplicates.sh`.
The script's output is a candidate list, not a verdict — read the bodies before cutting.

## Where to look first

**Start at the tail of `SKILL.md`.** A closing `Rules` / `Guardrails` / `Notes` list is where most
of the redundancy lives — it restates the steps in different words. Compare each bullet to the
steps: a bullet that restates a step keeps only its MUST/NEVER and loses the explanation.

## Resolve by kind

| Duplicate                                                                                 | Action                                                                                                |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Same rule in two reference files                                                          | Keep it in the file that owns the topic. In the other, one line: what the rule is and where it lives. |
| Reference restates a step already in `SKILL.md`                                           | Delete it from the reference. `SKILL.md` is the spine.                                                |
| `SKILL.md` restates detail that is now in a reference                                     | Cut to the one-line pointer.                                                                          |
| Same idea explained twice in one file — a rule, then a worked example, then a restatement | Keep the rule and the example. Delete the restatement.                                                |
| Two commands that do the same job                                                         | Keep the one the steps actually call. Delete the other.                                               |

## The one exception

Keep the repeat when it is a MUST / NEVER / halt condition placed at the point of danger, or when
deleting it leaves a reference file that no longer stands alone. Everything else goes.

## How the survivor is written

Each surviving statement is a direct instruction: one rule, one place, no second phrasing of it. Do
not add a paragraph that explains the rule again in other words.

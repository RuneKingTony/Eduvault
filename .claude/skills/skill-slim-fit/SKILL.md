---
name: skill-slim-fit
description: Slims a skill down — moves detail into references when SKILL.md exceeds 180 lines, removes explanations repeated between SKILL.md and its own references, corrects stale cross-references, tightens verbose prose without changing meaning, rewrites the frontmatter so the description matches the steps the skill actually performs and triggers reliably for model invocation, and verifies every link resolves. Use when a skill has grown unwieldy or bloated, when its references repeat each other, when a skill's description has drifted from what it does, when a skill needs an audit for length or duplication, or to sweep a whole family of skills at once. Accepts a skill name, a directory or file path, or a glob; `--audit` instead lists long lines maintained verbatim in more than one skill.
argument-hint: <skill-name | path | glob> | --audit
allowed-tools: Read Write Edit Glob Grep Bash AskUserQuestion
license: MIT
metadata:
  version: '2.5'
  compatibility: Requires bash + grep. Reads and edits .claude/skills/<name>/. Never commits.
---

# Skill slim fit

Slim the skill named in the invocation. `/skill-slim-fit <target>` routes here; invoked directly,
take the target from the request.

Two scripts do the mechanical checks — run them, never hand-roll their logic:
`references/check-links.sh` (Step 8) and `references/find-duplicates.sh` (Step 4).

**Scope:** one skill and its own `references/`. Duplication _between_ skills — the same block in
ten `SKILL.md` files — is out of scope by default: report it in Step 9, never fix it silently. A
subagent told to read one `SKILL.md` may depend on that copy, so consolidating it is an
architecture change, not a slimming edit. Do it only when the user explicitly asks: extract the
shared principle into one doc outside any single skill (`.claude/docs/<topic>.md`), keep each skill's own
layer-specific mechanics in place, and point every affected skill at the shared doc.

## Step 1: Resolve the targets

**`--audit` is a mode, not a target.** On it, skip the rest of this step and every step below: run
the Arsenal audit section, report what it found, and stop. It reads every skill, so there is no
target to resolve and nothing to slim.

Resolve the argument to one or more `SKILL.md` files. Accept a skill name, a directory, a direct
file path, or a glob. First hit wins:

```bash
ls .claude/skills/<name>/SKILL.md
ls ~/.claude/skills/<name>/SKILL.md
```

If nothing matches, list the near matches from `.claude/skills/` and ask which one. Do not guess.

Record each skill directory — its `references/` subdirectory is where extracted content goes.

**Batch mode** — for a glob or several names, list every resolved skill first, then run Steps 2–7
on each in turn. Run Step 8 **once at the end across all of them**, and give one combined Step 9
report. Never report a batch complete while a skill in it is unprocessed.

## Step 2: Measure

```bash
wc -l <skill-dir>/SKILL.md <skill-dir>/references/*.md
```

Report the line count. If `SKILL.md` is **180 or fewer**, skip Step 3 and go to Step 4. Every later
step runs whatever the count is — length gates extraction, nothing else.

## Step 3: Extract into references (only when over 180 lines)

Read the whole `SKILL.md` first. Then decide what leaves.

**Keep in SKILL.md** — needed on every run: the frontmatter (Step 7 rewrites it; here, touch it only
where a link moves); the trigger and scope; the step spine — each step's name, goal and decisive
command; everything that decides control flow — gates, halt conditions, branch points; and every
safety guard in the four categories listed under "Keep exactly as written" in
`references/prose-rules.md`. A guard moved into a reference is a guard a delegated subagent that
reads only `SKILL.md` will never see.

**Move to `references/<topic>.md`** — read only on demand: long worked examples, sample outputs and
transcripts; failure-mode catalogues and troubleshooting tables; schemas, field-by-field artefact
formats and long JSON/YAML blocks; background rationale and design history; any section a run
touches rarely or under one branch only.

Rules for the split:

- One topic per reference file. Name it for the topic (`failure-modes.md`), not for the step number.
- A reference file must stand alone — a reader who opens it cold gets enough context.
- Reuse existing `references/` files where the topic already has one. Do not create a near-duplicate.
- Replace the moved block with one line that says what is there and when to read it:
  `Failure modes and their fixes: **`references/<topic>.md`**. Read when a step fails.`
- Never move a control-flow decision out of `SKILL.md`. If a step can halt the run, the halt
  condition stays inline.

Re-measure after extraction. If still over 180 lines, extract again — but stop if the only
remaining candidates are control flow or step spine. Say so in the report rather than gutting it.

## Step 4: Remove redundancy across the reference set

Read **every** file under `references/`, not only the ones you touched. The duplicates that survive
a slimming pass are the ones inside reference files nobody re-opened.

Run the detectors — headings, repeated 40+ character lines (identical command blocks and rules), and
repeated bold bullet stems. They catch what reading alone misses:

```bash
bash .claude/skills/skill-slim-fit/references/find-duplicates.sh <skill-dir>
```

Where to look first, the action per duplicate kind, and the one case where a repeat stays:
**`references/redundancy-rules.md`**. Read it before cutting anything.

## Step 5: Check the cross-references are still true

A pointer rots silently. For every "see step N", "§X", and named section cited in `SKILL.md` or its
references, confirm the target exists **and still says what the citing sentence claims**. A claim
about another skill's behaviour goes stale first — check claims of _absence_ ("X needs adding",
"there is no field for Y") the same way as claims of presence: grep the named file for the missing
thing before trusting the sentence. A gap description that was fixed elsewhere and never updated
reads as a live TODO when it is not.

Fix what is wrong and list each fix in Step 9 as a **factual correction**, separate from the
tightening. This is the one sanctioned meaning change here: Step 6 forbids altering meaning, so
without this step an untrue sentence has nowhere to go. If a correction needs a decision you cannot
make from the files, leave the text and report it.

## Step 6: Tighten the prose

Reword for density, **never** for a different meaning — a sentence that is wrong belongs to Step 5.
Apply to `SKILL.md` and to every reference file.

What to cut, what to keep exactly as written, and the style rules:
**`references/prose-rules.md`**. Read it before rewording.

## Step 7: Realign the frontmatter with what the skill now does

The body is final at this point, so the frontmatter can be checked against it. A description drifts
whenever a step is added, removed or renamed and nobody rewrote the summary.

Field-by-field requirements, and the rules that make a description trigger:
**`references/frontmatter-contract.md`**. Read it before editing the frontmatter.

Re-derive the description from the step spine you just edited. For each clause in the current
`description:`, find the step that performs it:

| Finding                                             | Action                                                    |
| --------------------------------------------------- | --------------------------------------------------------- |
| Clause names work no step does                      | Delete the clause.                                        |
| A step does work no clause names                    | Add it, in the step's own words.                          |
| Clause is vaguer than the step ("cleans things up") | Restate it with the step's concrete object and threshold. |
| Numbers, paths or thresholds disagree with the body | The body wins. Correct the description.                   |

Then rewrite it against the trigger rules in the contract, and check every other field in the same
pass. NEVER leave a description that names work no step performs — that mis-fires the skill on every
later run.

Report every frontmatter edit in Step 9 as a **factual correction**, with the old and new
description side by side.

## Step 8: Verify the links — after the edits, not before

Run this **last**, once every edit is made. Steps 3–7 are what break links, so a check that runs
before them proves nothing.

```bash
bash .claude/skills/skill-slim-fit/references/check-links.sh <skill-dir> [<skill-dir>...]   # silent + exit 0 = clean
```

Never hand-roll this check. It resolves every path from the directory of **the file that contains
it**, then falls back to the workspace root and the skills root; resolving from the wrong directory
reports links that are fine, which trains you to ignore it.

- Fix every link you broke yourself, then re-run until it prints nothing and exits 0.
- Report a pre-existing broken link with a proposed fix rather than guessing the target.
- An orphaned reference is either a missing link or a file to delete — report it, never delete
  without asking.
- Confirm separately that no prose pointer names a heading Step 3 or 4 removed; the script sees
  markdown links and backticked paths only.

## Arsenal audit (`--audit`)

Steps 1-9 slim **one** skill. A rule maintained verbatim in several skills is invisible to each of
them, because each file is self-consistent:

```
bash .claude/skills/skill-slim-fit/references/arsenal-audit.sh
```

It lists long lines (110+ characters) that appear in two or more skills — one rule with several
owners, where fixing it in one leaves the rest stale. Deliberately cross-skill: `check-links.sh`
and `find-duplicates.sh` beside it are both scoped to a single skill directory.

**Candidates, not verdicts.** A repeated line is sometimes correct: a MUST or a halt condition is
deliberately restated at the point of danger. Read each before cutting, and consolidate only as
the Scope paragraph above allows.

## Step 9: Report

Give a short summary:

- Line count before → after, per file.
- Each reference file created or extended, with the topic that moved into it.
- Each redundancy removed: the topic, the files it appeared in, the file that now owns it.
- Each factual correction from Step 5, called out as a correction, not as tightening.
- The frontmatter edits from Step 7 — old and new `description` side by side, plus any other field
  fixed. Say "no drift" when the description already matched.
- Broken links found — fixed, or proposed fix if pre-existing.
- Orphaned reference files, awaiting the user's call.
- Cross-skill duplication noticed: consolidated (name the shared doc and every skill repointed to
  it) if the user asked, otherwise deliberately not touched (see Scope), for the user's call.
- Anything you chose not to cut, and why.

Do not commit. Leave the changes for the user to review.

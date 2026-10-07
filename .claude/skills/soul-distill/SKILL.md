---
name: soul-distill
description: Distills answered AskUserQuestion decisions from .claude/soul/decisions.jsonl into the Eduvault decision profile (SOUL). Weights each record by how much it reveals, adds evidence to existing policies, and queues new policies, confidence raises and rewrites as proposals for human review with /soul-review. Use on the Stop-hook nudge ("undistilled decisions"), after a batch of design decisions, or when asked to distill or update the soul or decision profile.
---

# soul-distill

Turns the decision log into evidence and proposals about how this engineer decides. Hooks and tools live in `.claude/hooks/soul/`; run `bash .claude/hooks/soul/soul.sh` with no arguments for the command list. Never edit the policy files, the log, the watermark or `proposals/` by hand.

```
.claude/soul/
├── seed/<slug>.md        reviewed policies (tracked in git)
├── decisions.jsonl       append-only log written by the capture hook (gitignored)
├── .last-distill         watermark {lines, last_id, at} (gitignored)
├── proposals/<id>.json   queued changes awaiting /soul-review (gitignored)
├── notes/<id>.md         amendment log per policy (gitignored)
└── rejected.md           proposals the engineer turned down, with reasons (gitignored)
```

Runtime state lives in the main checkout's `.claude/soul/`, shared by every worktree. Policies are read from the checkout you are in.

## What distill may do alone

| Change                   | How                                   | Review?                                            |
| ------------------------ | ------------------------------------- | -------------------------------------------------- |
| Add evidence to a policy | `soul.sh confirm`                     | no; it queues a raise when the score passes a rung |
| New policy               | `soul.sh propose -` with `op: create` | yes                                                |
| Reword a policy          | `soul.sh propose -` with `op: revise` | yes                                                |

A pending proposal is not policy: `soul.sh policy` refuses it and the session context never lists it. Confidence only rises through `/soul-review`.

## Steps

1. **Check the cursor.** `soul.sh check-watermark`. If it fails, the log was edited under the watermark: stop and tell the user.
2. **Read.** `soul.sh pending` prints `<log line><TAB><record>`. Note the last line number now; that is what you advance to in step 7, so records appended mid-run wait for the next run. Nothing pending: report "nothing to distill" and stop. Read `.claude/soul/rejected.md` (if it exists) and `soul.sh review`: never re-propose a rejected rule without new evidence, and extend a pending proposal instead of queueing a second one.
3. **Weigh each record.**

   | answer_kind   | weight | why                                                                       |
   | ------------- | ------ | ------------------------------------------------------------------------- |
   | `free_text`   | 3      | The human wrote the answer: the clearest statement of preference.         |
   | `option`      | 2      | Overrode the recommendation: a real preference against the agent's prior. |
   | `recommended` | 0.5    | Accepting a recommendation mostly shows the agent guessed well.           |
   | `none`        | 0      | Skip.                                                                     |

   Add 1 when `notes` is set. A record with `source: auto` was decided by an automated run, not a person: weight it 0.25 and never let it create a policy. Read the chosen and rejected `options[].description`: that is the trade-off the human accepted. `header_known: false` means map the header by reading the question.

4. **Find patterns.** Propose a policy when the same kind of choice recurs, or one free-text or override answer states an unambiguous general rule. Situational picks ("which of these files") are noise. Accepted recommendations alone never create a policy; they only confirm one that exists (via `policy_ids` or an obvious topic match).
5. **Act**, fetching only the bodies you need (`soul.sh policy <id>`):
   - **Confirmation:** `soul.sh confirm <id> <summed weight> <record-ids,...> "<one line>"`.
   - **Override of a cited policy:** a record whose `policy_ids` names a policy and whose `answer_kind` is `option` or `free_text` rejected it. One is a bound: propose a `revise` that states the limit. Two, or one free-text rejection, is a contradiction: propose a `create` with the new rule and a `revise` of the old one, and say so in the rationale. Never reuse or renumber an id.
   - **New pattern:** take an id from `soul.sh next-id <slug>`, then
     ```bash
     bash .claude/hooks/soul/soul.sh propose - <<'JSON'
     {"op":"create","id":"testing-003","statement":"...at most 300 chars...","why":"...at most 200 chars...",
      "score":5,"records":["a1b2c3d4e5","f6a7b8c9d0"],"rationale":"why distill thinks this is a rule"}
     JSON
     ```
     A new section also needs `"section_title"`. `confidence` defaults from `score`.
   - **Revise:** `{"op":"revise","id":"...","statement":"...","rationale":"...","records":[...]}`.

   `propose` validates on write and prints why it refused; fix and retry. One pending proposal per id: proposing again replaces it, so merge rather than overwrite.

6. **Headers.** Note any `header_known: false` you mapped by hand: each is a candidate alias for `.claude/hooks/soul/headers.json`.
7. **Finish.** `soul.sh validate` and fix every error, then `soul.sh advance <line from step 2>`. Watermark last, so a failed run leaves it untouched.
8. **Report** in a few lines: records distilled by `answer_kind`, policies confirmed, proposals queued by op, and when any are pending, a line suggesting `/soul-review`.

## Policy block

```
- `[testing-003]` <statement: the rule and its bounds, one line, at most 300 chars>
  - why: <one line, at most 200 chars>
  - evidence: score 7.5 · 5 decisions · last confirmed 2026-10-07 · confidence: high
```

`validate` and `propose` enforce the format and budgets. No tickets, dates, quotes or examples in a body.

## Confidence

| confidence | score    |
| ---------- | -------- |
| `low`      | below 3  |
| `medium`   | 3 to 6   |
| `high`     | 6 and up |

Seeded policies start at score 0 and `high`; the ladder never lowers anything. Lowering confidence or retiring a policy is a human edit made through a `revise` proposal or a direct commit; this port has no automatic decay.

## Boundaries

- SOUL records how the engineer decides. What the codebase is (domain terms, architecture) belongs in `CONTEXT.md` and `docs/adr/`. Never write into `docs/` from here and never turn a domain fact into a policy.
- Never distill secrets, student data or issue content into a policy.
- The log is append-only and the watermark is the only cursor: never edit `decisions.jsonl`, never re-read below the watermark, never advance past what you processed.
- Distill and `/soul-review` do not commit. Accepted policies change files under `.claude/soul/seed/`; the engineer commits them.

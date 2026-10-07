---
description: Review pending SOUL policy proposals; accept, reject or reword what distill proposed
---

# /soul-review

Distill never changes what the profile trusts on its own: it queues creates, revisions and confidence raises as proposals. This command is where the engineer rules on them. Tools are in `.claude/hooks/soul/`; from a worktree use that worktree's own copy, which shares the runtime state with the main checkout.

## Steps

1. `bash .claude/hooks/soul/soul.sh validate`. If it fails, say which line and stop; fixing it is distill's job.
2. `bash .claude/hooks/soul/soul.sh review`. Nothing pending: say so and stop.
3. Ask about the numbered items four per AskUserQuestion call (one question per item), always with header `Soul review`. The capture hook skips that header, so these answers never feed back into the profile they judge.
   - `question`: one line with the op, the id and the gist, e.g. `Create testing-003 (medium): "Prefer integration tests for guarded routes"?`
   - options: `Accept` and `Reject`. Put the item's full `review` block (the `+` and `-` lines, rationale and records) in the `Accept` option's `preview`. No "(Recommended)": the reviewer judges the agent's proposal, so the agent gets no vote.
   - Tell the engineer once, before the first call: typing into **Other** rewords the proposal (the text becomes the new statement), and `reject: <reason>` rejects with that reason.
4. Apply each answer:
   - **Accept**: `soul.sh accept <id>`.
   - **Reject**: `soul.sh reject <id> "<reason>"`. Use the engineer's notes as the reason; otherwise ask for one line in chat. The reason is what stops distill re-proposing the same rule.
   - **Other starting `reject:`**: reject with the rest as the reason.
   - **Other, anything else**: a reword. For `create` and `revise`, re-propose with the new statement (same id) via `soul.sh propose -`, then accept it. For `raise`, accept it, then propose and accept a `revise` with the new statement. Keep statements at most 300 characters; if the text is ambiguous, ask in chat rather than guess.
5. `soul.sh validate`, then report in a few lines: accepted, rejected, reworded, and `soul.sh status`. Remind the engineer that accepted policies are edits to `.claude/soul/seed/` to commit; do not commit them yourself.

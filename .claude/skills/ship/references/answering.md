# Answering: read when a worker or subagent asks a question

Ship never asks a human mid-stage, in any mode, and never uses `AskUserQuestion`. The orchestrator
answers. `$W` is `ship/scripts`.

1. The question: `bash $W/worker.sh read <KEY> 40` (pane) or the question file (`$D/<stage>.question.json`,
   `$D/e2e.question.json`).
2. Decide from the question's recommended option, else from `$ROOT/CLAUDE.md`, `$ROOT/CONTEXT.md` and
   `$ROOT/docs/adr/`. No recommendation and nothing in those: pick the smaller, reversible option.
3. `advisor` with the question and your answer; take its correction.
4. Deliver: pane -> `bash $W/worker.sh say <KEY> "<answer>"`; question file -> rename it
   `<name>.answered-<epoch>.json` and `SendMessage` the subagent. One output line: question -> answer.

A folder-trust dialog for this run's own worktree is mechanical: `herdr agent send-keys`, no deliberation.

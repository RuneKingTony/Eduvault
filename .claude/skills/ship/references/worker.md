# Worker stages: read when a stage runs in the pane

A fresh Claude process in the worktree per stage, in the one worker **pane** below the orchestrator
(65/35). The scripts render every prompt; dispatch sends it. Type nothing else into the pane:
`/model`, `/effort` and `/clear` rewrite the user's global settings.

1. `bash $W/worker.sh dispatch <KEY> <stage>` -> 0 `{agent, pane, model, effort, attempts, stray_patch,
replaced_pane}` (dispatch marks the stage `running`; never do it yourself first). 11/12: halt. 13: halt
   (it already answered the known exit dialogs and replaced a stuck pane). 14 (startup dialog, pane
   printed): a question, answer it (`$R/answering.md`), else halt. 15 (turn didn't start):
   `worker.sh read <KEY>`, answer any dialog, step 2, **never re-send**. A non-null `stray_patch`: one line
   naming it (a failed attempt's edits, saved and reverted).
2. Background `bash $W/wait-worker.sh <KEY> <limit>` (5400 for implement and fix-blockers, else 1200; it
   extends itself once while the worker is still working) -> 0 step 3; 10 answer (`$R/answering.md`),
   repeat; 20 step 1; 25 (idle, no handoff) once `bash $W/worker.sh nudge <KEY>` and step 2 again, a second
   25 step 1; 30 halt, leave it `running`.
3. `bash $W/verify.sh <KEY> <stage>`: see "Handoffs" in SKILL.md.

One worker process on the worktree at a time. `simplify` beside the read-only `security` subagent is the
only overlap: security may see simplify's edits half-done, its findings still stand, and `review` runs
after simplify on the final tree.

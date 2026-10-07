# Reattach: only on a resume whose next stage is `running`

A `running` stage was in flight when the last run died. Never restart it blind:

- **Pane stage** (implement, simplify, review, fix-blockers, push, pr, merge-sync): `bash $W/worker.sh
status <KEY>` -> `working`/`blocked`: wait (worker.md step 2); `idle`/`done`: verify (step 3); `gone`:
  dispatch (step 1; counts as an attempt).
- **Subagent or this-session stage** (`fetch`, `branch`, `propose`, `security`, `e2e`, `merge-gate`,
  `cleanup`): run it again, each is safe to repeat. A subagent never survives the orchestrator, so a
  `running` `branch` or `security` listed in `incomplete` is relaunched too.
- Past `implement` with e2e not skipped, before `e2e`, and the stack not up: relaunch `bash $W/stack.sh up
<KEY> $RUN_ID` in the background.

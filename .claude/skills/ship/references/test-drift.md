# Test drift: read when a stage refuses over a test the issue itself made wrong

Applies when `simplify`'s `failure_reason` names a **pre-existing test whose assertion the issue's own new
behaviour makes wrong**, or an orchestrator-run `unrun_specs` spec fails. Not an unrelated bug or a design
ambiguity: simplify is right to refuse those, and the run halts.

The gap is undone `implement` work, not a human escalation:

1. Append one unchecked task to `$D/tasks.md` with the exact fix: file, line, old vs. new expectation.
2. `bash $W/worker.sh dispatch <KEY> implement` (it marks the stage `running` and bumps `attempts`), wait,
   `bash $W/verify.sh <KEY> implement` -> `pass`.
3. Dispatch the refusing stage again as a fresh attempt, never a retry of the failed one.

Halt instead if this loop repeats for the same attempt of the refusing stage.

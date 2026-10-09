# Verification status: read when a script misbehaves, or before the run report

Name any unverified item that misbehaved in the run report. Move an item to verified once a real run has
exercised it.

**Verified offline (`scripts/test-ship.sh`, `scripts/test-security-gate.sh`):** effort.sh and the generated
stage table and README; state.sh stage transitions, `next` (including `run`, `stale` and the propose skip),
stale propagation, `halt`, `note`, `ran`, `skip-e2e`, `accept-descope`, restated-descope detection,
`followup`, `fetch-ticket` against gh-issues fixtures; verify.sh stale, fresh and failing handoffs, the
review count check, the review fan-out handoffs, simplify deferral and the required-specs list; lock.sh
`steal`; security-gate.sh path scoping; prompt.sh note rendering; finish.sh refusals and its dry run; the
Herdr guard on setup.sh, worker.sh, ready.sh and wait-worker.sh; the ScheduleWakeup guard.

**Verified in real runs (EDU-18 and EDU-19 under `/spike`, 2026-10-09):** the pane worker for implement,
simplify, review, push and pr; the `--auto-decide` propose and security subagents; gate.sh against the real
security-gate.sh; `accept-descope` (the three EDU-19 descopes); the `/goal` stop condition (it returned
`met:false` on a spec change, then `met:true`); auto-resume of a died ticket (the 12:08Z host kill); heartbeat
against a live Claude pid; issue-sync.sh against GitHub; merge-gate.sh and wait-checks.sh against a real PR
with CI (PR #45); worktree.sh remove after a human merge; e2e-gate.sh mode output; the rendered worker
prompts and the bypassPermissions worker. Seen to misbehave, now fixed in the scripts but not yet re-run:
`stack.sh up` never exited and left orphans, a re-run stage left its dependents `pass`, propose ran again on
resume.

**Unverified (never run against real Herdr, gh or a remote):** `worker.sh dispatch --note`; `finish.sh --yes`
against GitHub; `lock.sh steal` against a real dead run; slot.sh with several runs; wait-worker.sh's
`blocked` exit and limit extension; ready.sh's startup-dialog path; `worker.sh nudge`; the review fan-out
handoffs from a real review worker; `state.sh followup` creating a real issue.

**Untested since e2e became required (D-051):** a BLOCKED e2e now halts the run instead of pushing. Under `/spike`, a busy port or a stopped Docker can stall every ticket at e2e; no run has exercised that yet.

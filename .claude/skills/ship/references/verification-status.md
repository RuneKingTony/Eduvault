# Verification status: read when a script misbehaves, or before the run report

Name any unverified item that misbehaved in the run report. Move an item to verified once a real run has
exercised it.

**Verified offline (`scripts/test-ship.sh`, `scripts/test-ship-guard.sh`):** effort.sh and the generated
stage table and README; state.sh stage transitions, `next`, `skip-e2e`, `accept-descope`, `fetch-ticket`
against gh-issues fixtures; verify.sh stale, fresh and failing handoffs; the Herdr guard on setup.sh,
worker.sh, ready.sh and wait-worker.sh; the ScheduleWakeup guard.

**Unverified (never run against real Herdr, gh or a remote):** every worker.sh subcommand that talks to
Herdr; wait-worker.sh; ready.sh; heartbeat.sh against a live Claude pid; slot.sh with several runs;
issue-sync.sh against GitHub (needs the `in-progress`, `in-review`, `hold-merge` labels); merge-gate.sh
and wait-checks.sh (no remote or CI exists yet); worktree.sh remove; stack.sh up/ready/down; e2e-gate.sh
mode output; the propose subagent's `--auto-decide`; gate.sh against the real security-gate.sh;
worker prompts as rendered; bypassPermissions worker with the worktree write allowlist.

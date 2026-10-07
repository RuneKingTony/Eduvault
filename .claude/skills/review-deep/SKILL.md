---
name: review-deep
description: Deep multi-dimension review of the current branch against origin/main. Fans out 9 parallel subagents (tenancy isolation, authz/policy, money correctness, migration safety, contract drift, PII/student data, TypeScript idioms, performance, error handling), has an advisor validate the findings, and reports them ranked by severity. Use before merging a PR, or when asked for a thorough or staff-level review of a branch.
---

# review-deep

Fans out 9 review agents over the branch diff against `origin/main`, validates their findings with the advisor, and reports them ranked by severity. Review only; it changes no files.

## Model allocation

| Role               | Model    | Reason                                                  |
| ------------------ | -------- | ------------------------------------------------------- |
| Orchestrator (you) | `opus`   | Synthesis, ranking, final report                        |
| Tenancy isolation  | `sonnet` | Needs to trace org and campus scope through query paths |
| Authz / policy     | `sonnet` | Guard and statement reasoning across files              |
| Money correctness  | `sonnet` | Invariants span service, schema and tests               |
| Migration safety   | `sonnet` | Production risk reasoning                               |
| Contract drift     | `sonnet` | Consumer impact across libs and apps                    |
| PII / student data | `sonnet` | Telling sensitive fields from benign ones is judgement  |
| Error handling     | `sonnet` | Separating intentional fire-and-forget from bugs        |
| TypeScript idioms  | `haiku`  | Known anti-pattern matching                             |
| Performance        | `haiku`  | Recognising N+1 and unbounded queries                   |

## Steps

### 1. Capture the diff

```bash
git fetch origin main
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
git log origin/main..HEAD --oneline
```

Never diff against local `main`; it can lag origin. If `origin/main` does not resolve, stop and say so. If the diff is empty, stop and say: "No changes detected against origin/main. Nothing to review."

Drop generated files from the diff text you pass on (`apps/api/src/db/db-types.ts`, `apps/api/db/schema.sql`, `apps/api/db/auth-schema.snapshot.sql`, `routeTree.gen.ts`, lockfiles, snapshots). Keep them in the `--stat`. If the remaining diff exceeds roughly 3000 lines, give each agent the `--stat` plus only the files its dimension cares about (paths are listed in its reference file).

Read `CLAUDE.md`, and `CONTEXT.md` plus `docs/adr/0005-tenancy.md` for the tenancy, money and PII agents.

### 2. Fan out

Spawn all 9 agents in one message so they run in parallel. Use `subagent_type: "general-purpose"` and set `model` per the table. Each prompt is the shared template in `references/common-prompt.md` with the dimension's block from the reference file below, the diff pasted inline, and the context documents. Agents must not re-run git to get the diff.

| #   | Dimension          | Reference                         |
| --- | ------------------ | --------------------------------- |
| 1   | Tenancy isolation  | `references/tenancy-isolation.md` |
| 2   | Authz / policy     | `references/authz-policy.md`      |
| 3   | Money correctness  | `references/money-correctness.md` |
| 4   | Migration safety   | `references/migration-safety.md`  |
| 5   | Contract drift     | `references/contract-drift.md`    |
| 6   | PII / student data | `references/pii-student-data.md`  |
| 7   | TypeScript idioms  | `references/typescript-idioms.md` |
| 8   | Performance        | `references/performance.md`       |
| 9   | Error handling     | `references/error-handling.md`    |

A dimension with nothing in the diff to review (for example migration safety with no SQL changed) still runs, and answers with its "nothing to review" line.

### 3. Synthesize

When all agents return, merge their findings into an internal draft. Drop exact duplicates; when two dimensions report the same root cause, keep the one with the higher severity and name both. Group by severity, then file path.

### 4. Validate with the advisor

Call `advisor()`. It sees the diff, every agent output and your draft. Ask it to:

- mark false positives and findings that misread the diff
- downgrade CRITICAL or HIGH findings that do not hold up
- name genuine issues no agent reported, especially cross-school data access and money paths
- confirm the ranking

Apply its feedback: remove confirmed false positives, adjust severities, add what it surfaced. Do not show the unvalidated draft.

### 5. Report

```
# Deep Review Report

## Summary
Total findings: X (CRITICAL: N, HIGH: N, MEDIUM: N, LOW: N)

## Critical and High
[grouped by file, each tagged with its dimension]

## Medium
## Low
## Clean dimensions
[dimensions with no findings]

_review-deep against `git diff origin/main...HEAD`_
```

Each finding keeps the agent's `FILE`, `FINDING` and `DETAIL`. Sort by file path within a severity.

- CRITICAL + HIGH is 0: add "**No blockers found. This diff looks mergeable.**"
- Any CRITICAL: add "**CRITICAL issues must be resolved before merge.**"

Any tenancy-isolation or money finding at HIGH or above is a blocker regardless of count.

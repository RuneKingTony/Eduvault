---
name: Start Branch
description: Create a git worktree for a new branch off origin/main with dependencies installed.
model: haiku
allowed-tools: Bash, Read, Grep
---

# Start Branch

Branch name: `$ARGUMENTS`

## 1. Validate

Empty `$ARGUMENTS`: print `Usage: /start-branch <branch-name>` with the example `/start-branch edu-12-add-fee-schedule-crud` and stop.

`$ARGUMENTS` may be a pasted `git checkout -b <name>`: take the last token as **BRANCH_NAME**. Otherwise use the trimmed string. Reject a name containing spaces. Branch names follow `edu-<issue-number>-<slug>`.

## 2. Fetch

```bash
git fetch origin main
```

On failure show the error and stop. Never branch from local `main`, and never `git checkout main`.

## 3. Check for conflicts

- `git worktree list`: if `.claude/worktrees/<BRANCH_NAME>` exists, print `cd <absolute path> && claude` and stop.
- `git branch --list <BRANCH_NAME>`: if it exists locally, check it out instead of creating it.

## 4. Create

Worktree path: `<repo root from git rev-parse --show-toplevel>/.claude/worktrees/<BRANCH_NAME>` (gitignored).

```bash
git worktree add --no-track -b <BRANCH_NAME> <WORKTREE_PATH> origin/main
```

Existing local branch: `git worktree add <WORKTREE_PATH> <BRANCH_NAME>`. On failure show the error and stop.

## 5. Install

```bash
cd <WORKTREE_PATH> && pnpm install --frozen-lockfile
```

A failure is a warning, not a stop.

## 6. Report

Print the branch, the worktree path, and `cd <WORKTREE_PATH> && claude`.

---
name: Cleanup Worktrees
description: Remove worktrees whose PRs have merged on GitHub. Squash merges included. Optionally scoped to one branch.
model: haiku
allowed-tools: Bash
---

# Cleanup Worktrees

GitHub squash-merges, so `git branch --merged` and `git branch -d` call merged branches unmerged. Decide merged-ness from the PR state, never from git ancestry.

`$ARGUMENTS` (optional): one branch name. When given, touch only that worktree.

## 1. List

`git worktree list --porcelain`. Keep only entries under `.claude/worktrees/`. With `$ARGUMENTS`, keep the exact branch match; none means print `No worktree found for branch <ARGUMENTS>` and stop.

## 2. Classify

```bash
gh pr list --head <BRANCH> --state all --json number,state,url -q '.[0]'
```

| PR state          | Action                                                    |
| ----------------- | --------------------------------------------------------- |
| `MERGED`          | removable                                                 |
| `OPEN`            | keep                                                      |
| `CLOSED` unmerged | keep, report it                                           |
| none              | keep, and never infer merged from a missing remote branch |

## 3. Report and confirm

Print a table of path, branch and status. For each removable one show `git -C <path> status --short`. Nothing removable: `Nothing to clean up.` and stop. Otherwise wait for an explicit `y` or `yes`, unless the user already asked for this branch.

## 4. Remove

For each confirmed worktree:

1. Refuse if `git -C <path> status --short` shows anything beyond ignored build output. Report it and move on.
2. `git worktree remove <path>`.
3. Delete the local branch with `git branch -D <BRANCH>` only if its tip equals the merged PR's `headRefOid`, or is an ancestor of it. Otherwise keep the branch and say commits were added after the merge.

Never touch the main worktree or a remote branch, and never use `--force` by hand.

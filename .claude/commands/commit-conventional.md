---
name: Commit Conventional
description: Group staged changes by scope and create atomic conventional commits.
model: haiku
allowed-tools: Bash, Read, Grep
---

# Commit Conventional

## 1. Inspect

Run `git status` and `git diff --cached --name-only`. Nothing staged: say so and stop. Warn about unstaged changes but leave them alone.

## 2. Group by scope

| Path                                                    | Scope            |
| ------------------------------------------------------- | ---------------- |
| `apps/api/db/`, migrations, generated db types          | `db`             |
| `apps/api/`                                             | `api`            |
| `apps/web-admin/`                                       | `web-admin`      |
| `apps/web-portal/`                                      | `web-portal`     |
| `libs/api-contract/`                                    | `api-contract`   |
| `libs/policy/`                                          | `policy`         |
| `libs/shared/`                                          | `shared`         |
| `libs/ui/`                                              | `ui`             |
| `libs/testcontainers/`                                  | `testcontainers` |
| `.github/`, `.husky/`                                   | `ci`             |
| `.claude/`, `CLAUDE.md`                                 | `claude`         |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | `deps`           |
| `docs/`, `*.md` at the root                             | `docs`           |

A change that spans packages for one reason is one commit under the primary scope, with the others named in the body.

## 3. Type

`feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, `ci`, `chore`, `revert`. Docs-only is `docs`, tests-only is `test`; mixed with code takes the code type. Breaking change: `!` after the scope plus a `BREAKING CHANGE:` footer.

## 4. Message

`<type>(<scope>): <subject>`. Imperative, lowercase, no trailing period, at most 72 characters. Add a short body only when the why isn't obvious.

Never add a `Co-Authored-By` trailer or any tool attribution.

## 5. Execute

Show the plan (files and message per commit), then run it without asking: `git reset`, then for each group `git add <files>` and `git commit -m "<message>"`.

The Husky pre-commit hook runs prettier and `nx affected -t lint typecheck`. If it rejects a commit, fix what it reports and commit again. Never use `--no-verify`, `-n` or `HUSKY=0`; the PreToolUse guard blocks them.

---
name: Create Pull Request
description: Run the local PR checks, rebase on origin/main, and open a draft pull request.
model: haiku
allowed-tools: Bash, Read, Grep
---

# Create PR

Needs a GitHub remote named `origin`. If `git remote get-url origin` fails, stop and say so.

## 1. Branch and issue

`git branch --show-current`. Extract the issue number from `edu-<n>-<slug>`; the PR must link `#<n>`. On `main`, stop. If the branch has no issue number, stop and ask for one (or to create the issue); never open an unlinked PR.

## 2. Local checks (mirror `.github/workflows/validate-pr.yml`)

```bash
git fetch origin main
pnpm format:check || pnpm format && pnpm format:check
pnpm validate:quick
```

If `apps/api`, `libs/policy`, `libs/api-contract` or a migration changed, also run `nx run api:test-integration`. If the schema or Better Auth options changed, run `pnpm drift:fix` then `pnpm drift`. Fix failures and re-run. If one can't be fixed, report the error and stop; do not open the PR.

## 3. Rebase and push

```bash
git rebase origin/main
git push --force-with-lease -u origin HEAD
```

Resolve conflicts, then `git rebase --continue`. Never push to `main`.

## 4. Title and body

- Title: `EDU-<n>: <concise subject>`, at most 65 characters.
- Body: fill `.github/PULL_REQUEST_TEMPLATE.md`. Derive it from `git log origin/main..HEAD` and `git diff --stat origin/main...HEAD`. Say why, not just what, and list what was not verified.
- Link the issue in the body with `Refs #<n>`, always. Use `Closes #<n>` instead only when the human asked for it.

## 5. Open

```bash
gh pr create --base main --draft --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

Always `--draft`, no reviewers. The human marks it ready. Then confirm the link: `gh pr view <url> --json body --jq .body | grep -E '(Refs|Closes) #<n>'` must match, otherwise `gh pr edit` the body until it does. Print the PR URL. Do not wait on CI unless asked; if asked, use `gh pr checks <url> --watch`.

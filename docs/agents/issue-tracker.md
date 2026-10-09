# Issue tracker

Issues live in GitHub Issues for this repo, accessed with `gh`. Ticket keys are `EDU-<n>` in branch names and PR titles, where `<n>` is the GitHub issue number.

- Epic: a parent issue with sub-issues. Ordering between issues is expressed with "blocked by" links.
- Work in flight is marked by a label: `in-progress`, `in-review`, `hold-merge`. Done is the issue being closed, a human action, and a closed issue carries none of these labels (`close-issue` removes them; closing in the GitHub UI means removing them by hand).
- Branches: `edu-<n>-<slug>`. Commits: conventional, scope from `CLAUDE.md`.
- Every PR links its issue: the body carries `Refs #<n>` (or `Closes #<n>` when the human asked for it) and the title starts `EDU-<n>:`. A PR is never opened without that link.

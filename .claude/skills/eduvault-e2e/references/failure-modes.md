# Failure modes seen so far

Each row is a thing that went wrong while building this, with the cause and the fix. Add rows when you meet a new one.

| Symptom                                                                    | Cause                                                                                                    | Fix                                                                              |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `403 EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION` | `generateId: false` makes Better Auth require a verified email for invitations; no mail transport exists | BLOCKED, cause environment. See [personas](personas.md). Do not bypass with SQL. |
| `BLOCKED (environment): http://localhost:3000/health is not answering`     | Stack not running                                                                                        | `run-local` recipe, `preflight.sh`, run again                                    |
| `strict mode violation: getByLabel('Campus') resolved to 2 elements`       | The Students page has a "Campus" field next to the campus switcher                                       | Scope to `page.getByRole('banner')`                                              |
| `403 You are not allowed to delete this team` on `DELETE /campuses/:id`    | Seen when deleting a campus on its own as the owner                                                      | Delete the school; the campus goes with it                                       |

| `playwright-cli: command not found` | The CLI is not installed | BLOCKED, cause environment; install it, then run again |
| `403` or `INVALID_ORIGIN` from `curl` | The request had no `origin` header | Send `-H "origin: $E2E_ADMIN_URL"` |
| `cleanup.sh` prints `skip ...: sign-in 4xx` | It ran without the stack's `E2E_*_URL`, so it signed in on a different stack | `eval "$(bash .../stack-worktree.sh env <worktree>)"` first, then cleanup before `down` |
| `stack-worktree.sh up` from the main checkout rebuilds `apps/api/dist` | It builds in the tree it is given | Use a real worktree; do not point it at a checkout whose API is running |

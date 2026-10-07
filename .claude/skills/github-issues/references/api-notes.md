# REST endpoints behind the verbs

`{owner}/{repo}` is filled in by `gh api` from the current repo's remote.

| Verb                     | Call                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| get-issue                | `gh issue view N --json number,title,state,labels,body`, plus the link calls below                      |
| list-links blocked_by    | `GET repos/{owner}/{repo}/issues/N/dependencies/blocked_by`                                             |
| list-links blocks        | `GET repos/{owner}/{repo}/issues/N/dependencies/blocking`                                               |
| children / list-children | `GET repos/{owner}/{repo}/issues/N/sub_issues`                                                          |
| parent                   | `GET repos/{owner}/{repo}/issues/N/parent` (404 means none, reported as `null`)                         |
| create-link              | `POST .../issues/N/dependencies/blocked_by` with `issue_id` (the blocker's database id, not its number) |
| create-issue --parent    | `gh issue create`, then `POST .../issues/P/sub_issues` with `sub_issue_id` (database id)                |
| transition               | `gh issue edit N --add-label <state> --remove-label <the other two>`                                    |
| search                   | `gh issue list --search "<query>" --state all --limit 100`                                              |

The status labels (`in-progress`, `in-review`, `hold-merge`) must exist in the repo before `transition` works. Create them once with `gh label create`.

The real-`gh` paths need a GitHub remote and `gh auth`; the fixture tests do not cover them.

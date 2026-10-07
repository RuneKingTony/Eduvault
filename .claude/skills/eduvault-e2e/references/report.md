# Report format

Save as `tmp/e2e/<run>/report.md`, then run `scripts/report-check.sh` on it. `result.txt` (written by the reporter) already satisfies the format; the report adds the human parts.

## Line 1 and the rules

Line 1 is exactly `VERDICT: PASS`, `VERDICT: FAIL` or `VERDICT: BLOCKED`.

| Verdict   | First 15 lines must contain                                                                     | Must not contain              |
| --------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| `PASS`    | the goal, `artefacts:` path, counts                                                             | the words `FAIL` or `BLOCKED` |
| `FAIL`    | `failed: <step> expected <x>, got <y>` (or `error: <message>`)                                  |                               |
| `BLOCKED` | `cause: environment`, `cause: persona` or `cause: product`, then one `blocked:` line per reason |                               |

If a run passed some tests and others were blocked, the verdict is BLOCKED. Put the passed tests below line 15, never in a PASS report.

## Body (below the rules)

```
VERDICT: BLOCKED
cause: environment
artefacts: /abs/path/tmp/e2e/<run>
goal: owner signs in on both SPAs; role matrix over HTTP
blocked: teacher, admin, student could not be created over HTTP (invitation needs a verified email)
passed 5, failed 0, blocked 3

## Steps
1. web-admin sign in as owner: ok, web-admin/step-02-signed-in.png
2. ...

## Not verified
- Role matrix (covered by api:test-integration only)

## Ledger
deleted 2 students, 2 schools; user accounts remain until pnpm db:reset
```

- Cite screenshots by path.
- Name what was **not** verified. An empty "Not verified" section on a BLOCKED run is wrong.
- For BLOCKED with `cause: environment`, say what was missing (api not answering, port, Docker down) and the command that would unblock it. Do not retry in a loop.

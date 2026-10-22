# Findings ledger

`$RUN_DIR/findings.md`, written as checks fail; each finding names the failed check id. Local only (`tmp/` is git-ignored). One block per finding.

```
# Findings: <area> (run <run>)

Open 3 · fixed 1 · still failing 0

## F-01 · high · small · Reject leaves the journey on "waiting for reviewer"
status: open
section: 03-approvals
persona: owner
check: <check id>, after rejecting a write-off the row shows Rejected
expected: row status Rejected and the pending badge count drops by one
actual: row still shows Pending until a manual reload
endpoint: POST /approvals/42/decide -> 200 {"status":"rejected"}
evidence: 03-approvals/step-07-after-reject.png
console: none
api log: none
cause: the approvals query is not invalidated after the decision (apps/web-admin/src/components/approvals/approval-dialogs.tsx)
```

## Fields

| Field    | Content                                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id       | `F-NN`, never reused or renumbered                                                                                                                                                                                                  |
| severity | `critical` data loss, wrong money, a role seeing another school or campus; `high` the flow cannot be completed or a permission is wrong; `medium` works with a visible defect (missing success signal, wrong state); `low` cosmetic |
| effort   | `small`, `medium`, `large`: your estimate of the fix, so findings can be batched                                                                                                                                                    |
| status   | `open`, `fixed`, `still failing`, `needs decision` (with the question)                                                                                                                                                              |
| endpoint | method, path, status and a short response excerpt when an API call is involved                                                                                                                                                      |
| evidence | screenshot path; add `step-NN-*.log` paths for console or API log excerpts                                                                                                                                                          |
| cause    | only when verified in the code; otherwise leave it out. Never guess                                                                                                                                                                 |

Never put a password, token or cookie in a finding.

## Ideas

Below the findings, a plain list of things that work but could be better (a filter, clearer copy). They are not failures and do not affect the verdict.

## Recheck

A recheck run copies each earlier finding with its id and sets `fixed` or `still failing`, with the new evidence path. New failures get new ids.

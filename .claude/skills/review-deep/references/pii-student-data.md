# PII and student data (sonnet)

Also pass `CONTEXT.md`.

```
Dimension: personal and student data. Students are often minors; names, guardians' contacts, grades, results and fee status are sensitive, and one school must never see another's.

Look for:
- Student, guardian, staff or user names, emails, phone numbers, addresses, dates of birth, grades or fee balances written to logs at any level, error messages, exception payloads or analytics
- API responses that return more than the contract needs (whole database rows, password or token columns, account and session tables, other users' emails)
- Sensitive fields in URL path or query parameters, which land in access logs
- Student data in seed scripts, fixtures or tests that looks like real people rather than obviously fake data
- Lists and exports of student data without the tenancy and campus scope and without pagination
- Data sent to third parties (email, SMS, error trackers) without masking
- Sensitive values stored in localStorage, query-string state or the router URL in the web apps; student data left in client caches after sign-out or school switch
- Better Auth secrets, tokens, reset links or cookie settings exposed, logged or committed
- Hard deletes that remove an audit trail the school needs, or the opposite: no way to remove a person's data where the change adds new storage of it

Clean line: "No PII or student-data risks found."
```

# Error handling (sonnet)

Relevant: `apps/api/src/app/common/http/error.filter.ts`, services, web query and mutation handlers.

```
Dimension: error handling.

Look for:
- Promises not awaited, with no explicit fire-and-forget intent
- try/catch that swallows errors, or catches everything where only a database unique-violation or not-found was expected (a unique violation on a payment reference is a duplicate, not a 500)
- Errors rethrown as strings or generic Errors that lose the cause; thrown non-Error values
- Responses that leak internals (stack traces, SQL, constraint names) rather than going through the shared error filter and the contract's error shape
- Wrong status codes: 403 for out-of-scope rows (must be 404), 500 for validation or conflict errors, 200 for failures
- Multi-step writes that can fail halfway without a transaction or compensation
- Missing cleanup (connections, locks, temp files) on the failure path
- Web: mutations with no error state shown, optimistic updates not rolled back, errors reduced to console.log
- Inconsistent error shapes across endpoints

Clean line: "No error handling issues found."
```

# Performance (haiku)

```
Dimension: performance regressions.

Look for:
- N+1 patterns: a database call inside a loop or inside Promise.all over rows
- New query predicates (WHERE, JOIN, ORDER BY) with no supporting index, remembering that school-scoped tables are filtered by organization_id first
- List endpoints without LIMIT or pagination; queries that load whole rows when a few columns are enough
- Counting or summing money and results in application memory instead of in SQL
- Blocking or CPU-heavy work in a request handler
- Transactions held open across network calls
- Web: queries refetching on every render, missing staleTime, large lists without virtualization or pagination, re-created query keys, bundle-heavy imports in the shell
- Repeated identical lookups in one request that a single query could serve

Clean line: "No performance issues found."
```

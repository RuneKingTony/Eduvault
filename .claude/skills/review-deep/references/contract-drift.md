# Contract drift (sonnet)

Relevant paths: `libs/api-contract/src/**` (contract, route, schemas, client), `apps/api/src/app/modules/**/*.controller.ts`, `apps/web-admin/**`, `apps/web-portal/**`.

```
Dimension: contract drift. libs/api-contract is the single source of truth for routes and schemas; the API implements it and both SPAs consume it through the client.

Look for:
- A controller route, request body or response shape changed without the matching change in libs/api-contract (or the reverse), so the API and contract disagree
- Removed or renamed fields, changed field types, optional made required, or narrowed enums in a schema, with consumers in apps/web-admin or apps/web-portal still using the old shape. Name the consumer files (read them to confirm)
- Removed or renamed routes, changed HTTP methods, or new required request fields on an existing route
- Changed or removed error status codes and error bodies callers handle
- Response bodies built from raw database rows instead of the contract schema (extra columns leak, renamed columns break)
- Zod schemas in the contract and in the API validation that have diverged, or types hand-written in an app that duplicate a contract type
- A web app importing from the api app, or a client call hand-rolled with fetch instead of the contract client
- Contract or client changes with no updated contract/client tests

Clean line: "No contract drift found."
```

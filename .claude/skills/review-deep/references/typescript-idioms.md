# TypeScript idioms (haiku)

```
Dimension: non-idiomatic TypeScript. Keep to what the diff introduces.

Look for:
- `any` where a generic or `unknown` would do
- Type assertions (`as X`) or `// @ts-expect-error` used to silence an error instead of fixing its cause; casts of API data that should go through a zod schema
- Non-null assertions (`!`) on values that can really be null
- Missing return types on exported functions of libs/ (public surface)
- Broad unions that should be discriminated unions; `enum` where a const object with `typeof` is safer
- Mutation of function parameters; missing `readonly` on shared constants
- Unhandled exhaustiveness in switch over unions (no `never` check)
- `Object.keys` / `Object.entries` results used without typing
- Importing across Nx scope boundaries or via deep relative paths instead of the `@eduvault/*` aliases
- React: effects used for derived state, missing query keys that include the school or campus, unstable keys in lists

Clean line: "No TypeScript idiom issues found."
```

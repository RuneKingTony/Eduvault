# Use an Nx monorepo with pnpm catalogs and inferred targets

- Status: accepted
- Date: 2026-10-07

## Context

Two React SPAs, one NestJS API and five libraries share one contract. An agent changing any of them needs to know, quickly, which other projects it affected.

## Decision

Nx 22 with inferred targets (`@nx/vite`, `@nx/vitest`, `@nx/eslint`) and a handful of explicit ones where a tool has no plugin (`typecheck`, the `api:db-*` and `api:test-integration` targets). Dependencies are pinned once, in `pnpm-workspace.yaml` catalogs; each `package.json` says `catalog:<name>`.

- Module boundaries are Nx tags enforced by `@nx/enforce-module-boundaries` (see ADR 0004).
- `nx affected` drives `validate:quick` and the pre-commit hook.
- `@nx/nest`, `@nx/node`, `@nx/react` and `@nx/js` are installed for their generators and are not referenced by `nx.json`; knip ignores them on purpose.

## Alternatives considered

- **Plain pnpm workspaces**: no affected graph, no cache, every check runs everywhere.
- **Nx 23**: it is the current release. We stayed on 22.7 because it declares peer support for Vite 7 and Vitest 4, which is the combination we verified.
- **TypeScript project references** for `typecheck`: a second graph to maintain next to Nx's. A cached `tsc --noEmit` per project is enough.

## Consequences

- One place to bump a version, and no version drift between apps.
- Library source is consumed through `tsconfig.base.json` paths, with no build step per library. `typecheck` inputs include dependencies' sources, so a contract change invalidates its consumers' cache.

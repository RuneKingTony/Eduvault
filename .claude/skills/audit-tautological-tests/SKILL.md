---
name: audit-tautological-tests
description: Audit Eduvault tests for tautological, vacuous and change-detector tests, those that stay green when the code under test is wrong. Scans a module, directory or spec file in apps/api, apps/web-admin, apps/web-portal or libs/, reads the candidates, grades each with the "would a bug fail this?" question, checks whether an integration test covers the same rule, optionally proves a finding by hand-mutating the source, and reports what to delete, strengthen or keep. Use when asked to audit, review or check test quality, find tests that test the mock or the fake, find tests that cannot fail, review fakes or assertions, or before trusting a green suite on a module. Read-only unless asked to fix.
argument-hint: <path | module-name> [--mutate] [--fix]
allowed-tools: Bash, Read, Grep, Agent
model: sonnet
metadata:
  author: Jude Okafor
  version: '1.0'
---

# Audit tautological tests

A tautological test cannot fail when the code is wrong, because the expected value was put there by the test's own fake, mock or fixture and the code under test added nothing to it. A green run of such a test is false confidence.

The output is an audit report. Stay read-only: no edits, no commits. `--fix` applies the report's deletions and strengthenings afterwards, and only when the user passes it. `--mutate` runs the hand-mutation check in step 5.

## The one question

For every candidate: **if I introduced a bug in the code under test, which assertion would fail?** If none would, the test is tautological or vacuous. If it is the wrong assertion for the right reason, it is weak. Grade nothing on style.

| Grade               | Meaning                                                                                                           | Action                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Tautology**       | Asserted value comes from the test's own fake, mock, fixture or the production function under test                | Delete, or move to the layer that can fail |
| **Weak oracle**     | A real assertion that is too loose (`toBeDefined`, no message, no "nothing was written" check)                    | Strengthen                                 |
| **Change detector** | Pins copy, CSS classes, third-party class names or call choreography, so it fails on refactors and catches no bug | Delete or assert the behaviour instead     |
| **Legitimate**      | A bug in the code under test would fail it                                                                        | Keep                                       |

Grade a test by its worst assertion. A test with a real branch and one fake-owned assertion is half-tautological: keep the branch, delete the assertion, and say so. A legitimate test whose rule also has an integration twin stays Legitimate; note the twin and do not recommend deleting it.

A unit test whose title claims a scope ("outside the caller's campuses") but whose fake ignores the scope argument only proves the not-found branch. Grade it Weak oracle, recommend renaming it to say "not found", and look for the integration twin of the scope claim.

Tests that look suspicious but are fine, so do not flag them: a spy asserting the request a user's input produced (`assignTeacher` called with the typed role), a class-only `rejects.toBeInstanceOf(NotFoundException)` where the class is the whole contract (a 404 with no specific message), interaction tests of a coordination primitive (`with-school-lock`), arithmetic and filtering the service really does, guardrail pins that enforce a policy (`no student:delete`). A class-only check is Weak when a specific message is the contract.

## Workflow

### 1. Scope

Resolve the argument to paths. Check each path is the module meant: `store` also matches `acting-store.spec.ts` on the front end. A module name such as `dashboard` or `payment` means `apps/api/src/app/modules/<name>`. Its integration twins are not found by file name (`*store*` also matches the file-store specs and misses `portal.integration.spec.ts`); step 4 finds them by searching all of `apps/api/test`. Pick the layer: `apps/api`, `libs/policy`, `libs/shared` are backend ([references/backend.md](references/backend.md)); `apps/web-*`, `libs/ui`, `libs/auth-client` are front end ([references/frontend.md](references/frontend.md)). Read the matching reference before step 3.

### 2. Scan

```bash
python3 -I .claude/skills/audit-tautological-tests/scripts/scan.py <path>... --limit 20
```

Run it from the repo root. It uses `git ls-files`, so untracked specs are skipped, and it prints `file:line | title`. Flags: `no-expect`, `weak-only`, `spy-only`, `single-presence`, `pins-structure`, `echoes-fake`, `asserts-fake-state` (the actual side is a field of a fake; read the fake to see who wrote it), `class-only-error`, and `fake-ignores-scope` (a fake method whose scope or organization parameter is unused). All are candidates, not verdicts. A `no-expect` test may assert inside a helper (`rejects(...)` in `invoice-constraints`). The scanner reads one line or statement at a time, so it misses a literal that was put into a fake a few lines earlier, and `it.each` counts as one test.

### 3. Read and grade

Read each flagged spec and the fakes or test utilities it uses. For a module with many specs, give each spec to a general-purpose subagent (Explore only locates code, it does not audit) with this skill's table and the one question, and ask for file:line findings only. Look for what the scanner cannot:

- an assertion whose expected value is a literal or field set up a few lines earlier in a fake, with no transformation in between
- expected values computed by the production function under test (hashes, message builders)
- a fake that re-implements the rule the test then asserts (scope filter, retire-once, uniqueness)
- a fake whose rule differs from the real one: compare each uniqueness, scope or state rule in a fake with the constraint or index in `apps/api/db/schema.sql` and with the real repository
- assertions that survive deleting the line under test

### 4. Find the twin

For each tautology or fake-encoded rule, grep all of `apps/api/test` (backend) for its message constant, route or rule, or find an `eduvault-e2e` step (front end; references/frontend.md lists the fallback twins when none exists). A rule can live in a spec for another module (portal reads are in `portal.integration.spec.ts`). Record the file:line.

- **Twin exists:** the unit test is redundant and a maintenance cost. Recommend deletion.
- **No twin:** this is the real finding. A fake is the only thing proving the rule, and Postgres or the real API may disagree. Recommend an integration test first, then delete the unit test.

### 5. Prove it by hand (only with `--mutate`)

Pick at most two tautologies. Confirm `git status --short <file>` is empty, then make a one-line change that would be a real bug (drop a scope argument, skip a guard), run only that spec, and revert with `git checkout -- <file>`. Run `git status --short <file>` again and show it is clean. Never mutate a file with uncommitted changes.

```bash
pnpm exec nx run api:test src/app/modules/<module>/<name>.spec.ts   # path is relative to apps/api
```

A suite that stays green is the evidence. Do not run integration specs unless asked; they start Docker.

### 6. Report

```markdown
## Test audit: <path>

Scanned N tests in M specs (an `it.each` is one test). Tautologies a, weak b, change detectors c, legitimate d (sampled). Say which specs were read in full.

### Tautologies

| Where | Why it cannot fail | Twin | Action |

### Weak oracles

| Where | Missing | Better assertion |

### Change detectors

| Where | What it pins | Replace with |

### Fakes and test utilities

Fakes with rules in them, whether each has a contract or integration twin, and each place a fake's rule differs from the schema.

### Recommendations

Ordered: deletions with a twin first, then missing twins, then strengthening.
```

Cite `file:line`. Say what was not checked (integration specs not run, files not read). One PR for the deletions (mechanical); missing integration tests ship with the module they protect. These follow the repo's decision policies `process-003` and `tenancy-002`; read one with `bash .claude/hooks/soul/soul.sh policy <id>`.

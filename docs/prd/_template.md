# PRD: <module name>

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `<version>`
- Milestone and slice: `<M#.#>` (see [roadmap](README.md))
- Related: data model docs, permissions doc, [technical reference](../technical-reference.md) decisions `D-…`

## Summary

What the module is for, who it serves, and what changes for them. Two or three sentences.

## Who uses it

| Persona | Permission(s) | What they can do here |
| ------- | ------------- | --------------------- |

Scopes applied (campus, class, student/own). Out-of-scope rows answer 404; in scope without the permission answers 403 [tenancy-001].

## Screens

One subsection per screen, 1:1 with the prototype.

### <Screen title>

- Route, app, nav section and order, phase label, gate
- Layout: header (title, description, actions), cards and their order, tabs
- Each table: columns, sort, filters, row actions (with gate), pagination
- Each form or dialog: fields (type, required, default, validation and its message), buttons, what happens on submit (effect and toast copy)
- States: empty (copy), loading, error, denied (403), not found (404), read-only (acting super admin)
- Copy that matters, quoted as written

## Business rules

Numbered, testable rules. Cite data-model sections rather than restating tables.

## Data

Tables touched and new columns, linking to `docs/brainstorming/data-model-*.md`. Migrations this module needs.

## API

| Method | Path | Permission | Request | Response | Errors |
| ------ | ---- | ---------- | ------- | -------- | ------ |

Contract types live in `@eduvault/api-contract`.

## Acceptance criteria

Given / When / Then, one per rule and per screen state that matters.

## Tests

- Unit (`nx run <project>:test`)
- Integration (`api:test-integration`): an isolation test for each new table and route [tenancy-002], plus permission and money rules against real Postgres [testing-002]
- E2E (opt-in, `eduvault-e2e`): the flows worth driving in a browser

## Open decisions

| #   | Question | Recommendation | Confidence |
| --- | -------- | -------------- | ---------- |

## Prototype gaps noticed

Stubs, inconsistencies or missing states in the prototype that the build must decide.

## Dependencies

Other modules or foundation specs that must land first.

# Frontmatter contract

What a slimmed skill's YAML frontmatter must look like. Read during Step 7 of `../SKILL.md`, which
rewrites the frontmatter after the body is final.

## Why the description carries the most risk

For a model-invocable skill the `description:` is the only text the model reads when it decides
whether to load the skill. A description that drifted from the steps does not merely read badly — it
makes the skill fire on the wrong request, or never fire on the right one. A stale description is
worse than a long one.

## Making it trigger

- **What, then when.** One clause per real capability, then a `Use when …` clause carrying the
  phrases a user would actually type — including the informal ones ("bloated", "too long").
- Name the concrete nouns the skill acts on — file names, directory names, artefact names. They are
  what a request matches on.
- Third person, present tense. No first person and no "This skill …".
- State the accepted arguments in the last clause.
- Under 1024 characters.
- Never describe intent the steps do not implement. An aspirational description mis-fires the skill.

## The other fields

| Field                                               | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                              | Lowercase letters, digits and hyphens. Equal to the skill's directory name.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `allowed-tools`                                     | Space-separated, not a YAML list. Covers every tool the steps use and nothing more — grep the body for the tools it actually calls before trimming. **Never widen an existing entry.** A constrained pattern such as `Bash(<path>:*)` stays byte-for-byte; do not shorten it to `Bash`, do not merge two constrained patterns into a looser one, and do not add a tool the steps do not call. Narrowing is allowed; widening needs the user's say-so and goes in the Step 9 report. |
| `argument-hint`                                     | Present when the skill takes a target. Matches the argument forms Step 1 accepts.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `disable-model-invocation`                          | Set `true` only for a skill that must be invoked by hand. Setting it makes the description's trigger phrasing irrelevant.                                                                                                                                                                                                                                                                                                                                                           |
| `license`, `metadata`                               | Schema fields. Keep.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `compatibility`, `author`, `version`, anything else | Not schema fields. They live under `metadata:`, never at top level.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `metadata.version`                                  | Bump it when a slimming pass changed the description or the steps.                                                                                                                                                                                                                                                                                                                                                                                                                  |

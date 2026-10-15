# Keep the books in an append-only, balanced journal posted by reference

- Status: accepted
- Date: 2026-10-15

## Context

Money is the one place a quiet bug costs a school real naira, and a ledger that can be edited or left half-written cannot be audited. Several slices (fees, payments, the store, refunds) will post to the same books, from retried requests and queued jobs, so the same posting can arrive twice.

## Decision

- `journal_entry` and `journal_line` are append-only: a trigger refuses `UPDATE` and `DELETE`. A mistake is corrected by posting a reversing entry (`reverses_entry_id`), never by editing a row.
- Balance is a database rule, not only an application one. Deferred constraint triggers check at commit that every entry has lines and that its debits equal its credits, so a multi-statement post can pass through unbalanced states inside one transaction. `assertBalancedLines` refuses a bad entry earlier in code, and the triggers are the backstop.
- Every posting carries a `reference` unique per school. `LedgerPoster.post` inserts with `ON CONFLICT (organization_id, reference) DO NOTHING` and, when no row comes back, returns the earlier entry with `replayed: true` and adds no lines. Retries and concurrent posts of one reference post once.
- Amounts are integer minor units (`*_minor`), never floats.

## Alternatives considered

- **Mutable rows with an audit log**: simpler to correct, but a balance could silently change and the audit log would be the only truth.
- **Balance checked in the service only**: a second code path or a raw script could still write an unbalanced entry.
- **Idempotency keys in a separate table**: one more table to keep in step with the journal, where a unique reference on the entry itself cannot drift from it.

## Consequences

- Fixing an error takes a reversing entry and a new posting, so every correction stays visible.
- Tests and tooling that reset data must `TRUNCATE`, which fires no row trigger; a row delete in a test fails by design.
- Posting code must give every entry a stable reference, and a caller that reuses one for a different entry gets the first entry back and a `replayed` flag, so it must check the flag.
- A school cannot be deleted once it has a journal entry (D-206).

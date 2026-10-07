# Money correctness (sonnet)

Also pass `CONTEXT.md`. Relevant paths: anything touching `school_account`, `fee_schedule`, wallet, ledger, payment, fee code, and their migrations and tests.

```
Dimension: money correctness. Money is moved by a payment carrying a unique reference, applied at most once. Undoing a payment is a void: the row is kept and marked, and the reversal is a new movement. Payment, result and student records are never deleted.

Look for:
- A money-moving write with no idempotency reference, or one not enforced by a unique constraint (a check-then-insert without a constraint races under retry and double click)
- A retry that applies the movement twice, or returns an error instead of the original result when the reference already exists
- DELETE (or a soft-delete that hides it from totals) on payments, ledger entries, results or students. A void must keep the row and add a reversal
- Balance computed or updated outside a single transaction, or read-modify-write without a lock or a single atomic UPDATE
- Floats or JS number arithmetic on amounts; amounts must be integers in minor units or numeric with explicit rounding, with the currency handled consistently
- Negative, zero or overflow amounts accepted without validation; a void of an already voided payment; a void that does not reverse the same amount
- Fee schedule changes that rewrite history instead of applying to later periods
- Money totals that mix schools or campuses
- Tests missing for the duplicate-reference, void and concurrent-request cases

Clean line: "No money correctness issues found."
```

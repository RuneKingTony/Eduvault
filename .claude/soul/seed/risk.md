# Risk

- `[risk-001]` Never delete money, results or students. Void a payment (keep the row, mark it, reverse with a new movement), archive a student, and keep result history. Money movements are idempotent by reference.
  - why: These records are the school's legal and financial history; deletion cannot be undone and breaks audits.
  - evidence: score 0 · 0 decisions · last confirmed 2026-10-07 · confidence: high

- `[risk-002]` Never bypass hooks or guards: no --no-verify, no HUSKY=0, no hooksPath change, no nohup or background &. Fix the failing check instead; use run_in_background for long commands.
  - why: A bypassed gate ships the failure it exists to catch, and detached processes outlive the session.
  - evidence: score 0 · 0 decisions · last confirmed 2026-10-07 · confidence: high

import { createHash } from 'node:crypto';
import type { RecordPayment } from '@eduvault/api-contract';

type HashedFields = Omit<RecordPayment, 'reference'>;

/** Order- and whitespace-insensitive. The proof and provider reference are left out so a retry that re-uploads the proof still replays. */
export function paymentRequestHash(input: HashedFields): string {
  const canonical = {
    payerGuardianId: input.payerGuardianId ?? null,
    payerName: input.payerName?.trim() ?? null,
    moneyAccountId: input.moneyAccountId,
    method: input.method,
    amountMinor: input.amountMinor,
    paidOn: input.paidOn,
    allocations: input.allocations
      .map((row) => [row.studentId, row.amountMinor] as const)
      .toSorted(([a], [b]) => a.localeCompare(b)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

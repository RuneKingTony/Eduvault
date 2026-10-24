import type { RecordPayment } from '@eduvault/api-contract';
import { hashCanonical, sortedByFirst } from '../references/request-hash';

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
    allocations: sortedByFirst(
      input.allocations.map((row) => [row.studentId, row.amountMinor] as const)
    ),
  };
  return hashCanonical(canonical);
}

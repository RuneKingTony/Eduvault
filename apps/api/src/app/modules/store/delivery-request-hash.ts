import { createHash } from 'node:crypto';
import type { RecordDelivery } from '@eduvault/api-contract';

type HashedFields = Omit<RecordDelivery, 'reference'>;

const squash = (text: string): string => text.trim().replaceAll(/\s+/g, ' ');

/** Hashes the request as sent, so a retry that left the date to default tomorrow still replays. */
export function deliveryRequestHash(input: HashedFields): string {
  const canonical = {
    campusId: input.campusId,
    supplierName: squash(input.supplierName),
    moneyAccountId: input.moneyAccountId ?? null,
    isOpening: input.isOpening ?? false,
    receivedOn: input.receivedOn ?? null,
    lines: input.lines
      .map((line) => [line.itemId, line.quantity, line.unitCostMinor] as const)
      .toSorted(([a], [b]) => a.localeCompare(b)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

import type { RecordDelivery } from '@eduvault/api-contract';
import {
  hashCanonical,
  sortedByFirst,
} from '../../common/references/request-hash';

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
    lines: sortedByFirst(
      input.lines.map(
        (line) => [line.itemId, line.quantity, line.unitCostMinor] as const
      )
    ),
  };
  return hashCanonical(canonical);
}

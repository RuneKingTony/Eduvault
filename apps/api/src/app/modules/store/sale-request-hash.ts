import type { PaymentMethod } from '@eduvault/api-contract';
import {
  hashCanonical,
  sortedByFirst,
} from '../../common/references/request-hash';

interface HashedSale {
  studentId: string;
  method: PaymentMethod;
  moneyAccountId: string;
  lines: readonly { itemId: string; quantity: number }[];
}

/** Order-insensitive. The proof is left out so a retry that re-uploads the slip still replays. */
export function saleRequestHash(input: HashedSale): string {
  const canonical = {
    studentId: input.studentId,
    method: input.method,
    moneyAccountId: input.moneyAccountId,
    lines: sortedByFirst(
      input.lines.map((line) => [line.itemId, line.quantity] as const)
    ),
  };
  return hashCanonical(canonical);
}

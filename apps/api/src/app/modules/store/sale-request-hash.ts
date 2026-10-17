import { createHash } from 'node:crypto';
import type { PaymentMethod } from '@eduvault/api-contract';

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
    lines: input.lines
      .map((line) => [line.itemId, line.quantity] as const)
      .toSorted(([a], [b]) => a.localeCompare(b)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

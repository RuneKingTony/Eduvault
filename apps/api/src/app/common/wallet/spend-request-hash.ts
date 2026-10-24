import type { SpendWallet } from '@eduvault/api-contract';
import { hashCanonical, sortedByFirst } from '../references/request-hash';

export function spendRequestHash(
  walletId: string,
  input: Omit<SpendWallet, 'reference'>
): string {
  return hashCanonical({
    walletId,
    lines: sortedByFirst(
      input.lines.map((line) => [line.studentId, line.amountMinor] as const)
    ),
  });
}

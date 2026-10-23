import { createHash } from 'node:crypto';
import type { SpendWallet, TopUpWallet } from '@eduvault/api-contract';

const sha256 = (canonical: unknown): string =>
  createHash('sha256').update(JSON.stringify(canonical)).digest('hex');

/** Order- and whitespace-insensitive. The receipt file is left out so a retry that re-uploads it still replays. */
export function topUpRequestHash(
  walletId: string,
  input: Omit<TopUpWallet, 'reference' | 'proofFileId'>
): string {
  return sha256({
    walletId,
    moneyAccountId: input.moneyAccountId,
    method: input.method,
    amountMinor: input.amountMinor,
    receivedOn: input.receivedOn,
    depositorName: input.depositorName?.trim() ?? null,
  });
}

export function spendRequestHash(
  walletId: string,
  input: Omit<SpendWallet, 'reference'>
): string {
  return sha256({
    walletId,
    lines: input.lines
      .map((line) => [line.studentId, line.amountMinor] as const)
      .toSorted(([a], [b]) => a.localeCompare(b)),
  });
}

import type { TopUpWallet } from '@eduvault/api-contract';
import { hashCanonical } from '../../common/references/request-hash';

/** The receipt file is left out so a retry that re-uploads it still replays. */
export function topUpRequestHash(
  walletId: string,
  input: Omit<TopUpWallet, 'reference' | 'proofFileId'>
): string {
  return hashCanonical({
    walletId,
    moneyAccountId: input.moneyAccountId,
    method: input.method,
    amountMinor: input.amountMinor,
    receivedOn: input.receivedOn,
    depositorName: input.depositorName?.trim() ?? null,
  });
}

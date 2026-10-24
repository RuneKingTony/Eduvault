import type { Wallet } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { ReservedAccountService } from '../gateway/reserved-account.service';
import { WalletReservedAccountService } from './wallet-reserved-account.service';
import type { WalletService } from './wallet.service';

const ctx = { organizationId: 'school-a' } as OrgContext;

describe('WalletReservedAccountService.create', () => {
  it('makes the account first, then answers with the wallet that now holds it', async () => {
    const events: string[] = [];
    const reservedAccounts = {
      ensureForWallet: (_ctx: OrgContext, walletId: string) => {
        events.push(`ensure:${walletId}`);
        return Promise.resolve();
      },
    } as unknown as ReservedAccountService;
    const wallet = { id: 'wallet-1' } as Wallet;
    const wallets = {
      get: () => {
        events.push('get');
        return Promise.resolve(wallet);
      },
    } as unknown as WalletService;

    const answer = await new WalletReservedAccountService(
      reservedAccounts,
      wallets
    ).create(ctx, 'wallet-1');

    expect(answer).toBe(wallet);
    expect(events).toEqual(['ensure:wallet-1', 'get']);
  });
});

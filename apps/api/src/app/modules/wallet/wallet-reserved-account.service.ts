import { Injectable } from '@nestjs/common';
import type { Wallet } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { ReservedAccountService } from '../gateway/reserved-account.service';
import { WalletService } from './wallet.service';

@Injectable()
export class WalletReservedAccountService {
  constructor(
    private readonly reservedAccounts: ReservedAccountService,
    private readonly wallets: WalletService
  ) {}

  async create(ctx: OrgContext, walletId: string): Promise<Wallet> {
    await this.reservedAccounts.ensureForWallet(ctx, walletId);
    return this.wallets.get(ctx, walletId);
  }
}

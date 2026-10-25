import { Injectable } from '@nestjs/common';
import type {
  WalletRequestList,
  WalletRequestListQuery,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { orgScopeOf } from '../../common/scope';
import { WalletRepository } from './wallet.repository';

@Injectable()
export class WalletRequestService {
  constructor(private readonly wallets: WalletRepository) {}

  async list(
    ctx: OrgContext,
    query: WalletRequestListQuery
  ): Promise<WalletRequestList> {
    const [currency, page] = await Promise.all([
      this.wallets.currency(ctx.organizationId),
      this.wallets.listRequests(orgScopeOf(ctx), query),
    ]);
    return { currency, ...page };
  }
}

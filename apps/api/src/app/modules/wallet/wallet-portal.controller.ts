import { Body, Controller, Get, Post, UseInterceptors } from '@nestjs/common';
import {
  contract,
  type Earmark,
  type RouteOutput,
  type SpendWallet,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { ReplayStatusInterceptor } from '../../common/http/replay-status.interceptor';
import { zod } from '../../common/http/zod.pipe';
import { WalletPortalService } from './wallet-portal.service';

const routes = contract.portalWallet;

@Controller('portal/wallet')
export class WalletPortalController {
  constructor(private readonly wallet: WalletPortalService) {}

  @Get()
  @OrganizationAuth('wallet', 'readOwn')
  get(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.get>> {
    return this.wallet.mine(org);
  }

  @Post('spend')
  @OrganizationAuth('wallet', 'spend')
  @UseInterceptors(ReplayStatusInterceptor)
  spend(
    @Org() org: OrgContext,
    @Body(zod(routes.spend.body)) body: SpendWallet
  ): Promise<RouteOutput<typeof routes.spend>> {
    return this.wallet.spend(org, body);
  }

  @Post('earmarks')
  @OrganizationAuth('wallet', 'spend')
  @UseInterceptors(ReplayStatusInterceptor)
  setAside(
    @Org() org: OrgContext,
    @Body(zod(routes.setAside.body)) body: Earmark
  ): Promise<RouteOutput<typeof routes.setAside>> {
    return this.wallet.setAside(org, body);
  }

  @Post('earmarks/release')
  @OrganizationAuth('wallet', 'spend')
  @UseInterceptors(ReplayStatusInterceptor)
  release(
    @Org() org: OrgContext,
    @Body(zod(routes.release.body)) body: Earmark
  ): Promise<RouteOutput<typeof routes.release>> {
    return this.wallet.release(org, body);
  }
}

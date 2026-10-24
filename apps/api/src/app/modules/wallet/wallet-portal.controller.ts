import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  contract,
  type Earmark,
  type RouteOutput,
  type SetAutoPay,
  type SpendWallet,
  type WalletMovementQuery,
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

  @Get('movements')
  @OrganizationAuth('wallet', 'readOwn')
  movements(
    @Org() org: OrgContext,
    @Query(zod(routes.movements.query)) query: WalletMovementQuery
  ): Promise<RouteOutput<typeof routes.movements>> {
    return this.wallet.movements(org, query);
  }

  @Put('auto-pay')
  @OrganizationAuth('wallet', 'spend')
  setAutoPay(
    @Org() org: OrgContext,
    @Body(zod(routes.setAutoPay.body)) body: SetAutoPay
  ): Promise<RouteOutput<typeof routes.setAutoPay>> {
    return this.wallet.setAutoPay(org, body);
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

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  contract,
  type RouteOutput,
  type TopUpWallet,
  type WalletListQuery,
  type WalletMovementQuery,
  type WalletParams,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { ReplayStatusInterceptor } from '../../common/http/replay-status.interceptor';
import { zod } from '../../common/http/zod.pipe';
import { WalletReservedAccountService } from './wallet-reserved-account.service';
import { WalletService } from './wallet.service';

const routes = contract.wallets;

@Controller('finance/wallets')
export class WalletController {
  constructor(
    private readonly wallets: WalletService,
    private readonly reservedAccounts: WalletReservedAccountService
  ) {}

  @Get()
  @OrganizationAuth('wallet', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query)) query: WalletListQuery
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.wallets.list(org, query);
  }

  @Get('top-up-options')
  @OrganizationAuth('wallet', 'topUp')
  topUpOptions(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.topUpOptions>> {
    return this.wallets.topUpOptions(org);
  }

  @Get('refund-options')
  @OrganizationAuth('wallet', 'requestRefund')
  refundOptions(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.refundOptions>> {
    return this.wallets.refundOptions(org);
  }

  @Get(':walletId')
  @OrganizationAuth('wallet', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: WalletParams
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.wallets.get(org, params.walletId);
  }

  @Get(':walletId/movements')
  @OrganizationAuth('wallet', 'read')
  movements(
    @Org() org: OrgContext,
    @Param(zod(routes.movements.params)) params: WalletParams,
    @Query(zod(routes.movements.query)) query: WalletMovementQuery
  ): Promise<RouteOutput<typeof routes.movements>> {
    return this.wallets.movements(org, params.walletId, query);
  }

  @Post(':walletId/top-ups')
  @OrganizationAuth('wallet', 'topUp')
  @UseInterceptors(ReplayStatusInterceptor)
  topUp(
    @Org() org: OrgContext,
    @Param(zod(routes.topUp.params)) params: WalletParams,
    @Body(zod(routes.topUp.body)) body: TopUpWallet
  ): Promise<RouteOutput<typeof routes.topUp>> {
    return this.wallets.topUp(org, params.walletId, body);
  }

  @Post(':walletId/reserved-account')
  @HttpCode(200)
  @OrganizationAuth('wallet', 'topUp')
  reservedAccount(
    @Org() org: OrgContext,
    @Param(zod(routes.reservedAccount.params)) params: WalletParams
  ): Promise<RouteOutput<typeof routes.reservedAccount>> {
    return this.reservedAccounts.create(org, params.walletId);
  }
}

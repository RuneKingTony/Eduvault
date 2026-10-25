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
  type ApproveWalletRefundInput,
  type RequestWalletCancellation,
  type RequestWalletRefund,
  type RouteOutput,
  type WalletParams,
  type WalletRequestListQuery,
  type WalletTopUpParams,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { ReplayStatusInterceptor } from '../../common/http/replay-status.interceptor';
import { zod } from '../../common/http/zod.pipe';
import { WalletRefundService } from './wallet-refund.service';
import { WalletRequestService } from './wallet-request.service';
import { WalletTopUpCancellationService } from './wallet-topup-cancellation.service';

const asking = contract.wallets;

@Controller('finance/wallets')
export class WalletAskController {
  constructor(
    private readonly refunds: WalletRefundService,
    private readonly cancellations: WalletTopUpCancellationService
  ) {}

  @Post(':walletId/refunds')
  @OrganizationAuth('wallet', 'requestRefund')
  @UseInterceptors(ReplayStatusInterceptor)
  requestRefund(
    @Org() org: OrgContext,
    @Param(zod(asking.requestRefund.params)) params: WalletParams,
    @Body(zod(asking.requestRefund.body)) body: RequestWalletRefund
  ): Promise<RouteOutput<typeof asking.requestRefund>> {
    return this.refunds.request(org, params.walletId, body);
  }

  @Post(':walletId/top-ups/:topUpId/cancellations')
  @OrganizationAuth('wallet', 'requestRefund')
  @UseInterceptors(ReplayStatusInterceptor)
  requestCancellation(
    @Org() org: OrgContext,
    @Param(zod(asking.requestCancellation.params)) params: WalletTopUpParams,
    @Body(zod(asking.requestCancellation.body))
    body: RequestWalletCancellation
  ): Promise<RouteOutput<typeof asking.requestCancellation>> {
    return this.cancellations.request(org, params, body);
  }
}

@Controller('finance/wallet-requests')
export class WalletRequestController {
  constructor(private readonly requests: WalletRequestService) {}

  @Get()
  @OrganizationAuth('wallet', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(contract.walletRequests.list.query))
    query: WalletRequestListQuery
  ): Promise<RouteOutput<typeof contract.walletRequests.list>> {
    return this.requests.list(org, query);
  }
}

const refunds = contract.walletRefunds;

@Controller('finance/wallet-refunds')
export class WalletRefundController {
  constructor(private readonly service: WalletRefundService) {}

  @Post(':id/approve')
  @HttpCode(200)
  @OrganizationAuth('wallet', 'approveRefund')
  approve(
    @Org() org: OrgContext,
    @Param(zod(refunds.approve.params)) params: { id: string },
    @Body(zod(refunds.approve.body)) body: ApproveWalletRefundInput
  ): Promise<RouteOutput<typeof refunds.approve>> {
    return this.service.approve(org, params.id, body);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @OrganizationAuth('wallet', 'approveRefund')
  decline(
    @Org() org: OrgContext,
    @Param(zod(refunds.decline.params)) params: { id: string },
    @Body(zod(refunds.decline.body)) body: { reason: string }
  ): Promise<RouteOutput<typeof refunds.decline>> {
    return this.service.decline(org, params.id, body.reason);
  }
}

const cancellations = contract.walletTopUpCancellations;

@Controller('finance/wallet-topup-cancellations')
export class WalletTopUpCancellationController {
  constructor(private readonly service: WalletTopUpCancellationService) {}

  @Post(':id/approve')
  @HttpCode(200)
  @OrganizationAuth('wallet', 'approveRefund')
  approve(
    @Org() org: OrgContext,
    @Param(zod(cancellations.approve.params)) params: { id: string }
  ): Promise<RouteOutput<typeof cancellations.approve>> {
    return this.service.approve(org, params.id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @OrganizationAuth('wallet', 'approveRefund')
  decline(
    @Org() org: OrgContext,
    @Param(zod(cancellations.decline.params)) params: { id: string },
    @Body(zod(cancellations.decline.body)) body: { reason: string }
  ): Promise<RouteOutput<typeof cancellations.decline>> {
    return this.service.decline(org, params.id, body.reason);
  }
}

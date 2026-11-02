import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { ReplayStatusInterceptor } from '../../common/http/replay-status.interceptor';
import { zod } from '../../common/http/zod.pipe';
import { PaymentVoidService } from './payment-void.service';
import { PaymentService } from './payment.service';

const routes = contract.payments;

@Controller('finance/payments')
export class PaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly voids: PaymentVoidService
  ) {}

  @Get()
  @OrganizationAuth('payment', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<PaymentService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.payments.list(org, query);
  }

  @Get('recording-options')
  @OrganizationAuth('payment', 'record')
  recordingOptions(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.recordingOptions>> {
    return this.payments.recordingOptions(org);
  }

  @Get(':id')
  @OrganizationAuth('payment', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.payments.get(org, params.id);
  }

  @Post()
  @OrganizationAuth('payment', 'record')
  @UseInterceptors(ReplayStatusInterceptor)
  record(
    @Org() org: OrgContext,
    @Body(zod(routes.record.body))
    body: Parameters<PaymentService['record']>[1]
  ): Promise<RouteOutput<typeof routes.record>> {
    return this.payments.record(org, body);
  }

  @Post(':id/void-requests')
  @OrganizationAuth('payment', 'void')
  requestVoid(
    @Org() org: OrgContext,
    @Param(zod(routes.requestVoid.params)) params: { id: string },
    @Body(zod(routes.requestVoid.body))
    body: Parameters<PaymentVoidService['request']>[2]
  ): Promise<RouteOutput<typeof routes.requestVoid>> {
    return this.voids.request(org, params.id, body);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { PaymentVoidService } from './payment-void.service';

const routes = contract.paymentVoids;

@Controller('finance/payment-voids')
export class PaymentVoidController {
  constructor(private readonly voids: PaymentVoidService) {}

  @Get()
  @OrganizationAuth('adjustment', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<PaymentVoidService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.voids.list(org, query);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @OrganizationAuth('adjustment', 'approve')
  approve(
    @Org() org: OrgContext,
    @Param(zod(routes.approve.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.approve>> {
    return this.voids.approve(org, params.id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @OrganizationAuth('adjustment', 'approve')
  decline(
    @Org() org: OrgContext,
    @Param(zod(routes.decline.params)) params: { id: string },
    @Body(zod(routes.decline.body)) body: { reason: string }
  ): Promise<RouteOutput<typeof routes.decline>> {
    return this.voids.decline(org, params.id, body.reason);
  }
}

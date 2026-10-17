import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { PaymentService } from './payment.service';

const routes = contract.payments;

@Controller('finance/payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

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
  async record(
    @Org() org: OrgContext,
    @Body(zod(routes.record.body))
    body: Parameters<PaymentService['record']>[1],
    @Res({ passthrough: true }) response: Response
  ): Promise<RouteOutput<typeof routes.record>> {
    const recorded = await this.payments.record(org, body);
    response.status(recorded.replayed ? 200 : 201);
    return recorded;
  }
}

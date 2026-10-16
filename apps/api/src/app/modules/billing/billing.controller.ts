import { Controller, Get, Param, Post, Query, Body } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { BillingService } from './billing.service';

const routes = contract.billingRuns;

@Controller('billing-runs')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @OrganizationAuth('invoice', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<BillingService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.billing.list(org, query);
  }

  @Get('terms')
  @OrganizationAuth('invoice', 'read')
  terms(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.terms>> {
    return this.billing.terms(org);
  }

  @Get(':id')
  @OrganizationAuth('invoice', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string },
    @Query(zod(routes.get.query))
    query: Parameters<BillingService['list']>[1]
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.billing.get(org, params.id, query);
  }

  @Post()
  @OrganizationAuth('invoice', 'bill')
  prepare(
    @Org() org: OrgContext,
    @Body(zod(routes.prepare.body))
    body: Parameters<BillingService['prepare']>[1]
  ): Promise<RouteOutput<typeof routes.prepare>> {
    return this.billing.prepare(org, body);
  }

  @Post(':id/issue')
  @OrganizationAuth('invoice', 'bill')
  issue(
    @Org() org: OrgContext,
    @Param(zod(routes.issue.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.issue>> {
    return this.billing.issue(org, params.id);
  }

  @Post(':id/cancel')
  @OrganizationAuth('invoice', 'bill')
  cancel(
    @Org() org: OrgContext,
    @Param(zod(routes.cancel.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.cancel>> {
    return this.billing.cancel(org, params.id);
  }
}

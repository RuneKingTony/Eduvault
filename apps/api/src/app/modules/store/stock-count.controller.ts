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
import { StockCountService } from './stock-count.service';

const routes = contract.stockCounts;

@Controller('store/counts')
export class StockCountController {
  constructor(private readonly counts: StockCountService) {}

  @Get()
  @OrganizationAuth('store', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<StockCountService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.counts.list(org, query);
  }

  @Get(':id')
  @OrganizationAuth(['store:read', 'adjustment:approve'])
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.counts.get(org, params.id);
  }

  @Post()
  @OrganizationAuth('store', 'count')
  submit(
    @Org() org: OrgContext,
    @Body(zod(routes.submit.body))
    body: Parameters<StockCountService['submit']>[1]
  ): Promise<RouteOutput<typeof routes.submit>> {
    return this.counts.submit(org, body);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @OrganizationAuth('adjustment', 'approve')
  approve(
    @Org() org: OrgContext,
    @Param(zod(routes.approve.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.approve>> {
    return this.counts.approve(org, params.id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @OrganizationAuth('adjustment', 'approve')
  decline(
    @Org() org: OrgContext,
    @Param(zod(routes.decline.params)) params: { id: string },
    @Body(zod(routes.decline.body)) body: { reason: string }
  ): Promise<RouteOutput<typeof routes.decline>> {
    return this.counts.decline(org, params.id, body.reason);
  }
}

import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { SaleService } from './sale.service';
import { StoreReadService } from './store-read.service';

const routes = contract.store;

@Controller('store')
export class SaleController {
  constructor(
    private readonly sales: SaleService,
    private readonly reads: StoreReadService
  ) {}

  @Get('sales')
  @OrganizationAuth('store', 'read')
  listSales(
    @Org() org: OrgContext,
    @Query(zod(routes.sales.query))
    query: Parameters<StoreReadService['saleList']>[1]
  ): Promise<RouteOutput<typeof routes.sales>> {
    return this.reads.saleList(org, query);
  }

  @Get('sales/options')
  @OrganizationAuth('store', 'issue')
  saleOptions(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.saleOptions>> {
    return this.reads.saleOptions(org);
  }

  @Get('sales/:id')
  @OrganizationAuth('store', 'read')
  getSale(
    @Org() org: OrgContext,
    @Param(zod(routes.sale.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.sale>> {
    return this.reads.sale(org, params.id);
  }

  @Post('sales')
  @OrganizationAuth('store', 'issue')
  async recordSale(
    @Org() org: OrgContext,
    @Body(zod(routes.recordSale.body))
    body: Parameters<SaleService['record']>[1],
    @Res({ passthrough: true }) response: Response
  ): Promise<RouteOutput<typeof routes.recordSale>> {
    const recorded = await this.sales.record(org, body);
    response.status(recorded.replayed ? 200 : 201);
    return recorded;
  }
}

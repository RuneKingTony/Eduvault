import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  contract,
  type RouteOutput,
  type SaleOptionsQuery,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { ReplayStatusInterceptor } from '../../common/http/replay-status.interceptor';
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
    @Org() org: OrgContext,
    @Query(zod(routes.saleOptions.query)) query: SaleOptionsQuery
  ): Promise<RouteOutput<typeof routes.saleOptions>> {
    return this.reads.saleOptions(org, query);
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
  @UseInterceptors(ReplayStatusInterceptor)
  recordSale(
    @Org() org: OrgContext,
    @Body(zod(routes.recordSale.body))
    body: Parameters<SaleService['record']>[1]
  ): Promise<RouteOutput<typeof routes.recordSale>> {
    return this.sales.record(org, body);
  }
}

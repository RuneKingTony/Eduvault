import { Controller, Get, Param, Query } from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { InvoiceService } from './invoice.service';

const routes = contract.invoices;

@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  @OrganizationAuth('invoice', 'read')
  list(
    @Org() org: OrgContext,
    @Query(zod(routes.list.query))
    query: Parameters<InvoiceService['list']>[1]
  ): Promise<RouteOutput<typeof routes.list>> {
    return this.invoices.list(org, query);
  }

  @Get(':id')
  @OrganizationAuth('invoice', 'read')
  get(
    @Org() org: OrgContext,
    @Param(zod(routes.get.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.get>> {
    return this.invoices.get(org, params.id);
  }
}

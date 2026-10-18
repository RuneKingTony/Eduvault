import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  @Post()
  @OrganizationAuth('invoice', 'charge')
  async create(
    @Org() org: OrgContext,
    @Body(zod(routes.create.body))
    body: Parameters<InvoiceService['create']>[1],
    @Res({ passthrough: true }) response: Response
  ): Promise<RouteOutput<typeof routes.create>> {
    const created = await this.invoices.create(org, body);
    response.status(created.replayed ? 200 : 201);
    return created;
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { DeliveryService } from './delivery.service';
import { ItemService } from './item.service';
import { StoreReadService } from './store-read.service';

const routes = contract.store;

@Controller('store')
export class StoreController {
  constructor(
    private readonly items: ItemService,
    private readonly deliveries: DeliveryService,
    private readonly reads: StoreReadService
  ) {}

  @Get('summary')
  @OrganizationAuth('store', 'read')
  summary(
    @Org() org: OrgContext,
    @Query(zod(routes.summary.query)) query: { campusId?: string }
  ): Promise<RouteOutput<typeof routes.summary>> {
    return this.reads.summary(org, query.campusId);
  }

  @Get('items')
  @OrganizationAuth('store', 'read')
  listItems(
    @Org() org: OrgContext,
    @Query(zod(routes.items.query))
    query: Parameters<ItemService['list']>[1]
  ): Promise<RouteOutput<typeof routes.items>> {
    return this.items.list(org, query);
  }

  @Post('items')
  @OrganizationAuth('store', 'receive')
  createItem(
    @Org() org: OrgContext,
    @Body(zod(routes.createItem.body))
    body: Parameters<ItemService['create']>[1]
  ): Promise<RouteOutput<typeof routes.createItem>> {
    return this.items.create(org, body);
  }

  @Patch('items/:id')
  @OrganizationAuth('store', 'receive')
  updateItem(
    @Org() org: OrgContext,
    @Param(zod(routes.updateItem.params)) params: { id: string },
    @Body(zod(routes.updateItem.body))
    body: Parameters<ItemService['update']>[2]
  ): Promise<RouteOutput<typeof routes.updateItem>> {
    return this.items.update(org, params.id, body);
  }

  @Get('deliveries')
  @OrganizationAuth('store', 'read')
  listDeliveries(
    @Org() org: OrgContext,
    @Query(zod(routes.deliveries.query))
    query: Parameters<StoreReadService['deliveries']>[1]
  ): Promise<RouteOutput<typeof routes.deliveries>> {
    return this.reads.deliveries(org, query);
  }

  @Get('deliveries/:id')
  @OrganizationAuth('store', 'read')
  getDelivery(
    @Org() org: OrgContext,
    @Param(zod(routes.delivery.params)) params: { id: string }
  ): Promise<RouteOutput<typeof routes.delivery>> {
    return this.reads.delivery(org, params.id);
  }

  @Post('deliveries')
  @OrganizationAuth('store', 'receive')
  async recordDelivery(
    @Org() org: OrgContext,
    @Body(zod(routes.recordDelivery.body))
    body: Parameters<DeliveryService['record']>[1],
    @Res({ passthrough: true }) response: Response
  ): Promise<RouteOutput<typeof routes.recordDelivery>> {
    const recorded = await this.deliveries.record(org, body);
    response.status(recorded.replayed ? 200 : 201);
    return recorded;
  }
}

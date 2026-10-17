import { Injectable } from '@nestjs/common';
import {
  DASHBOARD_LOW_STOCK_NAMES,
  type DashboardStore,
  type DeliveryDetail,
  type DeliveryList,
  type DeliveryListQuery,
  type StoreSummary,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  StoreRepository,
  type StockTotals,
  type StoreRef,
} from './store.repository';
import {
  deliveryInScope,
  isLow,
  scopeOf,
  stockTotalsOf,
  storesInView,
  withStock,
} from './store-view';

interface LowStock {
  count: number;
  names: string[];
}

const valueOf = (totals: readonly { valueMinor: number }[]): number =>
  totals.reduce((sum, row) => sum + row.valueMinor, 0);

@Injectable()
export class StoreReadService {
  constructor(private readonly store: StoreRepository) {}

  async summary(ctx: OrgContext, campusId?: string): Promise<StoreSummary> {
    const stores = await storesInView(this.store, ctx, campusId);
    const totals = await stockTotalsOf(this.store, ctx, stores);
    const low = await this.lowItems(ctx, stores, totals);
    return { stockValueMinor: valueOf(totals), lowCount: low.count };
  }

  async dashboardStore(ctx: OrgContext): Promise<DashboardStore> {
    const stores = await storesInView(this.store, ctx);
    return {
      stockValueMinor: valueOf(await stockTotalsOf(this.store, ctx, stores)),
    };
  }

  async lowStockTask(ctx: OrgContext): Promise<LowStock> {
    const stores = await storesInView(this.store, ctx);
    return this.lowItems(
      ctx,
      stores,
      await stockTotalsOf(this.store, ctx, stores)
    );
  }

  async deliveries(
    ctx: OrgContext,
    query: DeliveryListQuery
  ): Promise<DeliveryList> {
    await storesInView(this.store, ctx, query.campusId);
    return this.store.listDeliveries(scopeOf(ctx), query);
  }

  async delivery(ctx: OrgContext, id: string): Promise<DeliveryDetail> {
    return deliveryInScope(this.store, ctx, id);
  }

  private async lowItems(
    ctx: OrgContext,
    stores: readonly StoreRef[],
    totals: readonly StockTotals[]
  ): Promise<LowStock> {
    const records = await this.store.listItems(ctx.organizationId, {
      includeRetired: false,
    });
    const low = withStock(records, stores, totals).filter(isLow);
    return {
      count: low.length,
      names: low
        .slice(0, DASHBOARD_LOW_STOCK_NAMES)
        .map((item) => item.displayName),
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DASHBOARD_LOW_STOCK_NAMES,
  FINANCE_PAGE_SIZE,
  PAYMENT_STUDENT_NOT_FOUND_MESSAGE,
  STORE_SALE_NOT_FOUND_MESSAGE,
  type DashboardStore,
  type DeliveryDetail,
  type DeliveryList,
  type DeliveryListQuery,
  type PortalPriceList,
  type PortalPurchases,
  type Sale,
  type SaleList,
  type SaleListQuery,
  type SaleOptions,
  type StoreSummary,
} from '@eduvault/api-contract';
import { can } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { buildPriceList } from './price-list';
import { SaleRepository } from './sale.repository';
import {
  StoreRepository,
  type StockTotals,
  type StoreRef,
} from './store.repository';
import {
  deliveryInScope,
  isLow,
  stockTotalsOf,
  storesInView,
  withStock,
} from './store-view';
import { orgScopeOf } from '../../common/scope';

interface LowStock {
  count: number;
  names: string[];
}

const valueOf = (totals: readonly { valueMinor: number }[]): number =>
  totals.reduce((sum, row) => sum + row.valueMinor, 0);

@Injectable()
export class StoreReadService {
  constructor(
    private readonly store: StoreRepository,
    private readonly sales: SaleRepository,
    private readonly clock: Clock
  ) {}

  async summary(ctx: OrgContext, campusId?: string): Promise<StoreSummary> {
    const stores = await storesInView(this.store, ctx, campusId);
    const totals = await stockTotalsOf(this.store, ctx, stores);
    const [low, term] = await Promise.all([
      this.lowItems(ctx, stores, totals),
      this.sales.termFigures(orgScopeOf(ctx), campusId),
    ]);
    return { stockValueMinor: valueOf(totals), lowCount: low.count, ...term };
  }

  async dashboardStore(ctx: OrgContext): Promise<DashboardStore> {
    const stores = await storesInView(this.store, ctx);
    const [totals, term] = await Promise.all([
      stockTotalsOf(this.store, ctx, stores),
      this.sales.termFigures(orgScopeOf(ctx)),
    ]);
    return { stockValueMinor: valueOf(totals), ...term };
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
    return this.store.listDeliveries(orgScopeOf(ctx), query);
  }

  async delivery(ctx: OrgContext, id: string): Promise<DeliveryDetail> {
    return deliveryInScope(this.store, ctx, id);
  }

  async saleList(ctx: OrgContext, query: SaleListQuery): Promise<SaleList> {
    await storesInView(this.store, ctx, query.campusId);
    return this.sales.list(orgScopeOf(ctx), {
      ...query,
      pageSize: FINANCE_PAGE_SIZE,
    });
  }

  async sale(ctx: OrgContext, id: string): Promise<Sale> {
    const found = await this.sales.find(orgScopeOf(ctx), id);
    if (found === undefined) {
      throw new NotFoundException(STORE_SALE_NOT_FOUND_MESSAGE);
    }
    return found;
  }

  async saleOptions(ctx: OrgContext): Promise<SaleOptions> {
    const scope = orgScopeOf(ctx);
    const [students, methods, accounts] = await Promise.all([
      this.sales.optionStudents(scope, {
        today: this.clock.today(),
        withBalance: can(ctx.permissions, 'payment', 'read'),
      }),
      this.sales.paymentMethods(ctx.organizationId),
      this.sales.accounts(scope),
    ]);
    return {
      students,
      methods,
      accounts: accounts
        .filter((account) => !account.retired && account.kind !== 'gateway')
        .map(({ id, name, kind, campusId }) => ({ id, name, kind, campusId })),
    };
  }

  purchasesOf(ctx: OrgContext, studentId: string): Promise<PortalPurchases> {
    return this.sales.purchasesOf(ctx.organizationId, studentId);
  }

  async priceListFor(
    ctx: OrgContext,
    studentId: string
  ): Promise<PortalPriceList> {
    const placement = await this.sales.placementOf(
      ctx.organizationId,
      studentId
    );
    if (placement === undefined) {
      throw new NotFoundException(PAYMENT_STUDENT_NOT_FOUND_MESSAGE);
    }
    const stores = await this.store.storesInScope({
      organizationId: ctx.organizationId,
      campusScope: 'all',
    });
    const store = stores.find((row) => row.campusId === placement.campusId);
    const [items, totals, methods] = await Promise.all([
      this.store.listItems(ctx.organizationId, { includeRetired: false }),
      store === undefined
        ? []
        : this.store.stockTotals(ctx.organizationId, [store.id]),
      this.sales.paymentMethods(ctx.organizationId),
    ]);
    return buildPriceList({
      items,
      levelId: placement.levelId,
      levelName: placement.levelName,
      onHand: new Map(totals.map((row) => [row.itemId, row.onHand])),
      methods,
    });
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

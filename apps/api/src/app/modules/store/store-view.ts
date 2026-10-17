import { NotFoundException } from '@nestjs/common';
import {
  DELIVERY_NOT_FOUND_MESSAGE,
  STORE_CAMPUS_NOT_FOUND_MESSAGE,
  stockState,
  type DeliveryDetail,
  type Item,
  type StockRow,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { averageCost } from './stock-value';
import type {
  ItemRecord,
  StockTotals,
  StoreRef,
  StoreRepository,
  StoreScope,
} from './store.repository';

export const scopeOf = (ctx: OrgContext): StoreScope => ({
  organizationId: ctx.organizationId,
  campusScope: ctx.campusScope,
});

export async function storesInView(
  repository: StoreRepository,
  ctx: OrgContext,
  campusId?: string
): Promise<StoreRef[]> {
  const stores = await repository.storesInScope(scopeOf(ctx));
  if (campusId === undefined) {
    return stores;
  }
  const picked = stores.filter((store) => store.campusId === campusId);
  if (picked.length === 0) {
    throw new NotFoundException(STORE_CAMPUS_NOT_FOUND_MESSAGE);
  }
  return picked;
}

export function stockTotalsOf(
  repository: StoreRepository,
  ctx: OrgContext,
  stores: readonly StoreRef[]
): Promise<StockTotals[]> {
  return repository.stockTotals(
    ctx.organizationId,
    stores.map((store) => store.id)
  );
}

export async function deliveryInScope(
  repository: StoreRepository,
  ctx: OrgContext,
  id: string
): Promise<DeliveryDetail> {
  const found = await repository.findDelivery(scopeOf(ctx), id);
  if (found === undefined) {
    throw new NotFoundException(DELIVERY_NOT_FOUND_MESSAGE);
  }
  return found;
}

export async function storeInView(
  repository: StoreRepository,
  ctx: OrgContext,
  campusId: string
): Promise<StoreRef> {
  const [store] = await storesInView(repository, ctx, campusId);
  if (store === undefined) {
    throw new NotFoundException(STORE_CAMPUS_NOT_FOUND_MESSAGE);
  }
  return store;
}

function stockRows(
  item: ItemRecord,
  stores: readonly StoreRef[],
  totals: ReadonlyMap<string, StockTotals>
): StockRow[] {
  return stores.map((store) => {
    const found = totals.get(`${store.id}:${item.id}`);
    const onHand = found?.onHand ?? 0;
    const valueMinor = found?.valueMinor ?? 0;
    return {
      campusId: store.campusId,
      onHand,
      valueMinor,
      averageCostMinor: averageCost(valueMinor, onHand),
    };
  });
}

export function withStock(
  items: readonly ItemRecord[],
  stores: readonly StoreRef[],
  totals: readonly StockTotals[]
): Item[] {
  const byStoreItem = new Map(
    totals.map((row) => [`${row.storeId}:${row.itemId}`, row])
  );
  return items.map((item) => {
    const stock = stockRows(item, stores, byStoreItem);
    return { ...item, stock, state: stockState(stock, item.lowStockLevel) };
  });
}

export const isLow = (item: Item): boolean =>
  item.retiredAt === null && item.state !== 'in';

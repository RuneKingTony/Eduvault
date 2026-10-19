import { randomUUID } from 'node:crypto';
import { itemDisplayName, type DeliveryDetail } from '@eduvault/api-contract';
import type { UsableMoneyAccount } from '../../common/money-accounts';
import {
  StoreRepository,
  type DeliveryOutcome,
  type DeliveryPage,
  type DeliveryPageQuery,
  type ExistingDelivery,
  type ItemChange,
  type ItemFilter,
  type ItemInsertOutcome,
  type ItemRecord,
  type ItemUpdateOutcome,
  type NewDelivery,
  type NewItem,
  type StockTotals,
  type StoreRef,
  type StoreScope,
} from './store.repository';

export const storeItem = (overrides: Partial<ItemRecord> = {}): ItemRecord => {
  const item: ItemRecord = {
    id: randomUUID(),
    kind: 'uniform',
    name: 'School shirt',
    variant: 'Size 12',
    displayName: '',
    classLevel: null,
    costPriceMinor: 350_000,
    sellPriceMinor: 450_000,
    lowStockLevel: 5,
    retiredAt: null,
    ...overrides,
  };
  return { ...item, displayName: itemDisplayName(item) };
};

export const storeRef = (
  id: string,
  campusName: string,
  campusId = id
): StoreRef => ({
  id: `store-${id}`,
  campusId,
  campusName,
  name: `${campusName} campus store`,
});

const edited = (current: ItemRecord, change: ItemChange): ItemRecord => {
  const variant =
    change.variant === undefined ? current.variant : change.variant;
  const name = change.name ?? current.name;
  return {
    ...current,
    name,
    variant,
    displayName: itemDisplayName({ name, variant }),
    costPriceMinor: change.costPriceMinor ?? current.costPriceMinor,
    sellPriceMinor: change.sellPriceMinor ?? current.sellPriceMinor,
    lowStockLevel: change.lowStockLevel ?? current.lowStockLevel,
    retiredAt: change.retire ? '2026-10-07T09:00:00.000Z' : null,
  };
};

const priceDiffers = (before: ItemRecord, after: ItemRecord): boolean =>
  before.costPriceMinor !== after.costPriceMinor ||
  before.sellPriceMinor !== after.sellPriceMinor;

interface PriceChangeRecord {
  itemId: string;
  oldCostMinor: number;
  newCostMinor: number;
  oldPriceMinor: number;
  newPriceMinor: number;
}

export class FakeStoreRepository extends StoreRepository {
  levels = new Map<string, string>();
  items: ItemRecord[] = [];
  stores: StoreRef[] = [];
  totals: StockTotals[] = [];
  accounts = new Map<string, UsableMoneyAccount>();
  deliveries: DeliveryDetail[] = [];
  existing: ExistingDelivery | undefined;
  opening = false;
  outcome: DeliveryOutcome = { status: 'recorded', id: 'delivery-1' };
  inserted: NewDelivery[] = [];
  priceChanges: PriceChangeRecord[] = [];
  suppliers: string[] = [];

  classLevel(
    _organizationId: string,
    id: string
  ): Promise<{ id: string; name: string } | undefined> {
    const name = this.levels.get(id);
    return Promise.resolve(name === undefined ? undefined : { id, name });
  }

  listItems(
    _organizationId: string,
    filter: ItemFilter
  ): Promise<ItemRecord[]> {
    return Promise.resolve(
      this.items.filter(
        (item) =>
          (filter.includeRetired || item.retiredAt === null) &&
          (filter.kind === undefined || item.kind === filter.kind) &&
          (filter.q === undefined ||
            item.displayName.toLowerCase().includes(filter.q.toLowerCase()))
      )
    );
  }

  findItem(
    _organizationId: string,
    id: string
  ): Promise<ItemRecord | undefined> {
    return Promise.resolve(this.items.find((item) => item.id === id));
  }

  findItems(
    _organizationId: string,
    ids: readonly string[]
  ): Promise<ItemRecord[]> {
    return Promise.resolve(this.items.filter((item) => ids.includes(item.id)));
  }

  insertItem(input: NewItem): Promise<ItemInsertOutcome> {
    const name = itemDisplayName(input);
    const clash = this.items.some(
      (item) =>
        item.retiredAt === null &&
        item.kind === input.kind &&
        item.displayName === name &&
        item.classLevel?.id === (input.classLevelId ?? undefined)
    );
    if (clash) {
      return Promise.resolve({ status: 'duplicate' });
    }
    const item: ItemRecord = {
      id: randomUUID(),
      kind: input.kind,
      name: input.name,
      variant: input.variant,
      displayName: name,
      classLevel:
        input.classLevelId === null
          ? null
          : {
              id: input.classLevelId,
              name: this.levels.get(input.classLevelId) ?? '',
            },
      costPriceMinor: input.costPriceMinor,
      sellPriceMinor: input.sellPriceMinor,
      lowStockLevel: input.lowStockLevel,
      retiredAt: null,
    };
    this.items.push(item);
    return Promise.resolve({ status: 'created', item });
  }

  updateItem(change: ItemChange): Promise<ItemUpdateOutcome> {
    const index = this.items.findIndex((item) => item.id === change.itemId);
    const current = this.items[index];
    if (current === undefined) {
      return Promise.resolve({ status: 'missing' });
    }
    if (current.retiredAt !== null) {
      return Promise.resolve({ status: 'retired' });
    }
    const updated = edited(current, change);
    if (this.clashes(updated)) {
      return Promise.resolve({ status: 'duplicate' });
    }
    if (priceDiffers(current, updated)) {
      this.priceChanges.push({
        itemId: current.id,
        oldCostMinor: current.costPriceMinor,
        newCostMinor: updated.costPriceMinor,
        oldPriceMinor: current.sellPriceMinor,
        newPriceMinor: updated.sellPriceMinor,
      });
    }
    this.items[index] = updated;
    return Promise.resolve({ status: 'updated', item: updated });
  }

  private clashes(candidate: ItemRecord): boolean {
    return this.items.some(
      (item) =>
        item.id !== candidate.id &&
        item.retiredAt === null &&
        item.kind === candidate.kind &&
        item.displayName === candidate.displayName
    );
  }

  storesInScope(scope: StoreScope): Promise<StoreRef[]> {
    return Promise.resolve(
      this.stores.filter(
        (store) =>
          scope.campusScope === 'all' ||
          scope.campusScope.includes(store.campusId)
      )
    );
  }

  stockTotals(
    _organizationId: string,
    storeIds: readonly string[]
  ): Promise<StockTotals[]> {
    return Promise.resolve(
      this.totals.filter((row) => storeIds.includes(row.storeId))
    );
  }

  findDeliveryByReference(): Promise<ExistingDelivery | undefined> {
    return Promise.resolve(this.existing);
  }

  moneyAccount(
    _scope: StoreScope,
    moneyAccountId: string
  ): Promise<UsableMoneyAccount> {
    return Promise.resolve(
      this.accounts.get(moneyAccountId) ?? ({ status: 'missing' } as const)
    );
  }

  hasOpeningStock(): Promise<boolean> {
    return Promise.resolve(this.opening);
  }

  insertDelivery(input: NewDelivery): Promise<DeliveryOutcome> {
    this.inserted.push(input);
    return Promise.resolve(this.outcome);
  }

  listDeliveries(
    _scope: StoreScope,
    query: DeliveryPageQuery
  ): Promise<DeliveryPage> {
    const start = (query.page - 1) * query.pageSize;
    return Promise.resolve({
      items: this.deliveries.slice(start, start + query.pageSize),
      total: this.deliveries.length,
      suppliers: this.suppliers,
    });
  }

  findDelivery(
    _scope: StoreScope,
    id: string
  ): Promise<DeliveryDetail | undefined> {
    return Promise.resolve(
      this.deliveries.find((delivery) => delivery.id === id)
    );
  }
}

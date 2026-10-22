import { randomUUID } from 'node:crypto';
import { itemDisplayName, type DeliveryDetail } from '@eduvault/api-contract';
import type { UsableMoneyAccount } from '../../common/money-accounts';
import type { ActivityInput } from '../../common/activity';
import { receiveValue } from './stock-value';
import {
  StoreRepository,
  type DeliveryActivity,
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
} from './store.repository';
import type { OrgScope } from '../../common/scope';

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

// Mirrors the item_active_key unique index: kind, name, variant and class level among active items.
const sameActiveKey = (
  item: ItemRecord,
  key: Pick<ItemRecord, 'kind' | 'name' | 'variant'> & {
    classLevelId: string | null;
  }
): boolean =>
  item.retiredAt === null &&
  item.kind === key.kind &&
  item.name === key.name &&
  item.variant === key.variant &&
  (item.classLevel?.id ?? null) === key.classLevelId;

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
  /** The school each level, store and inserted item belongs to; anything not recorded here belongs to whichever school asks. */
  levelSchools = new Map<string, string>();
  storeSchools = new Map<string, string>();
  private readonly itemSchools = new Map<string, string>();
  items: ItemRecord[] = [];
  stores: StoreRef[] = [];
  totals: StockTotals[] = [];
  accounts = new Map<string, UsableMoneyAccount>();
  deliveries: DeliveryDetail[] = [];
  existing: ExistingDelivery | undefined;
  opening = false;
  outcome: DeliveryOutcome = { status: 'recorded', id: 'delivery-1' };
  inserted: NewDelivery[] = [];
  activity: ActivityInput[] = [];
  priceChanges: PriceChangeRecord[] = [];
  suppliers: string[] = [];

  private belongs(
    schools: Map<string, string>,
    id: string,
    organizationId: string
  ): boolean {
    return (schools.get(id) ?? organizationId) === organizationId;
  }

  private itemsOf(organizationId: string): ItemRecord[] {
    return this.items.filter((item) =>
      this.belongs(this.itemSchools, item.id, organizationId)
    );
  }

  classLevel(
    organizationId: string,
    id: string
  ): Promise<{ id: string; name: string } | undefined> {
    const name = this.levels.get(id);
    return Promise.resolve(
      name === undefined || !this.belongs(this.levelSchools, id, organizationId)
        ? undefined
        : { id, name }
    );
  }

  listItems(organizationId: string, filter: ItemFilter): Promise<ItemRecord[]> {
    const q = filter.q?.toLowerCase();
    return Promise.resolve(
      this.itemsOf(organizationId).filter(
        (item) =>
          (filter.includeRetired || item.retiredAt === null) &&
          (filter.kind === undefined || item.kind === filter.kind) &&
          (q === undefined ||
            [item.name, item.variant, item.classLevel?.name].some(
              (text) => text?.toLowerCase().includes(q) === true
            ))
      )
    );
  }

  findItem(
    organizationId: string,
    id: string
  ): Promise<ItemRecord | undefined> {
    return Promise.resolve(
      this.itemsOf(organizationId).find((item) => item.id === id)
    );
  }

  findItems(
    organizationId: string,
    ids: readonly string[]
  ): Promise<ItemRecord[]> {
    return Promise.resolve(
      this.itemsOf(organizationId).filter((item) => ids.includes(item.id))
    );
  }

  insertItem(input: NewItem): Promise<ItemInsertOutcome> {
    const name = itemDisplayName(input);
    const clash = this.itemsOf(input.organizationId).some((item) =>
      sameActiveKey(item, input)
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
    this.itemSchools.set(item.id, input.organizationId);
    return Promise.resolve({ status: 'created', item });
  }

  updateItem(change: ItemChange): Promise<ItemUpdateOutcome> {
    const index = this.items.findIndex((item) => item.id === change.itemId);
    const current = this.items[index];
    if (
      current === undefined ||
      !this.belongs(this.itemSchools, current.id, change.organizationId)
    ) {
      return Promise.resolve({ status: 'missing' });
    }
    if (current.retiredAt !== null) {
      return Promise.resolve({ status: 'retired' });
    }
    const updated = edited(current, change);
    if (this.clashes(updated, change.organizationId)) {
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

  private clashes(candidate: ItemRecord, organizationId: string): boolean {
    return this.itemsOf(organizationId).some(
      (item) =>
        item.id !== candidate.id &&
        sameActiveKey(item, {
          ...candidate,
          classLevelId: candidate.classLevel?.id ?? null,
        })
    );
  }

  storesInScope(scope: OrgScope): Promise<StoreRef[]> {
    return Promise.resolve(
      this.stores.filter(
        (store) =>
          this.belongs(this.storeSchools, store.id, scope.organizationId) &&
          (scope.campusScope === 'all' ||
            scope.campusScope.includes(store.campusId))
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
    _scope: OrgScope,
    moneyAccountId: string
  ): Promise<UsableMoneyAccount> {
    return Promise.resolve(
      this.accounts.get(moneyAccountId) ?? ({ status: 'missing' } as const)
    );
  }

  hasOpeningStock(): Promise<boolean> {
    return Promise.resolve(this.opening);
  }

  currency(): Promise<string> {
    return Promise.resolve('NGN');
  }

  insertDelivery(
    input: NewDelivery,
    activity: DeliveryActivity
  ): Promise<DeliveryOutcome> {
    this.inserted.push(input);
    if (this.outcome.status === 'recorded') {
      this.activity.push(
        ...activity({
          id: this.outcome.id,
          number: input.isOpening
            ? `OPEN-STORE-${input.store.campusId}`
            : 'DEL-2026-0001',
          totalMinor: input.lines.reduce(
            (sum, line) =>
              sum + receiveValue(line.quantity, line.unitCostMinor),
            0
          ),
        })
      );
    }
    return Promise.resolve(this.outcome);
  }

  listDeliveries(
    _scope: OrgScope,
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
    _scope: OrgScope,
    id: string
  ): Promise<DeliveryDetail | undefined> {
    return Promise.resolve(
      this.deliveries.find((delivery) => delivery.id === id)
    );
  }
}

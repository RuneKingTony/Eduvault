import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { DeliveryDetail } from '@eduvault/api-contract';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  usableMoneyAccount,
  type UsableMoneyAccount,
} from '../../common/money-accounts';
import { LedgerPoster } from '../../common/ledger';
import {
  findDelivery,
  listDeliveries,
} from './kysely-delivery-read.repository';
import {
  findDeliveryByReference,
  hasOpeningStock,
  insertDelivery,
} from './kysely-delivery-write.repository';
import {
  insertItem,
  listItemRecords,
  readItem,
  readItems,
  updateItem,
} from './kysely-item.repository';
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

const toStoreRef = (row: {
  id: string;
  campus_id: string;
  campus_name: string;
  name: string;
}): StoreRef => ({
  id: row.id,
  campusId: row.campus_id,
  campusName: row.campus_name,
  name: row.name,
});

const toStockTotals = (row: {
  store_id: string;
  item_id: string;
  on_hand: string;
  value_minor: string;
}): StockTotals => ({
  storeId: row.store_id,
  itemId: row.item_id,
  onHand: Number(row.on_hand),
  valueMinor: Number(row.value_minor),
});

@Injectable()
export class KyselyStoreRepository extends StoreRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster
  ) {
    super();
  }

  classLevel(
    organizationId: string,
    id: string
  ): Promise<{ id: string; name: string } | undefined> {
    return this.db
      .selectFrom('class_level')
      .select(['id', 'name'])
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  listItems(organizationId: string, filter: ItemFilter): Promise<ItemRecord[]> {
    return listItemRecords(this.db, organizationId, filter);
  }

  findItem(
    organizationId: string,
    id: string
  ): Promise<ItemRecord | undefined> {
    return readItem(this.db, organizationId, id);
  }

  findItems(
    organizationId: string,
    ids: readonly string[]
  ): Promise<ItemRecord[]> {
    return readItems(this.db, organizationId, ids);
  }

  insertItem(input: NewItem): Promise<ItemInsertOutcome> {
    return insertItem(this.db, input);
  }

  updateItem(change: ItemChange): Promise<ItemUpdateOutcome> {
    return updateItem(this.db, change);
  }

  async storesInScope(scope: StoreScope): Promise<StoreRef[]> {
    const rows = await this.db
      .selectFrom('store')
      .innerJoin('team', 'team.id', 'store.campus_id')
      .where('store.organization_id', '=', scope.organizationId)
      .where((eb) =>
        inCampusScope(eb, 'store.campus_id', { scope: scope.campusScope })
      )
      .select([
        'store.id',
        'store.campus_id',
        'store.name',
        'team.name as campus_name',
      ])
      .orderBy('team.name')
      .orderBy('store.id')
      .execute();
    return rows.map((row) => toStoreRef(row));
  }

  async stockTotals(
    organizationId: string,
    storeIds: readonly string[]
  ): Promise<StockTotals[]> {
    if (storeIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('stock_movement')
      .where('organization_id', '=', organizationId)
      .where('store_id', 'in', [...storeIds])
      .select([
        'store_id',
        'item_id',
        sql<string>`sum(quantity)`.as('on_hand'),
        sql<string>`sum(value_minor)`.as('value_minor'),
      ])
      .groupBy(['store_id', 'item_id'])
      .execute();
    return rows.map((row) => toStockTotals(row));
  }

  findDeliveryByReference(
    organizationId: string,
    reference: string
  ): Promise<ExistingDelivery | undefined> {
    return findDeliveryByReference(this.db, organizationId, reference);
  }

  moneyAccount(
    scope: StoreScope,
    moneyAccountId: string
  ): Promise<UsableMoneyAccount> {
    return usableMoneyAccount(this.db, scope, moneyAccountId);
  }

  hasOpeningStock(organizationId: string, storeId: string): Promise<boolean> {
    return hasOpeningStock(this.db, organizationId, storeId);
  }

  insertDelivery(input: NewDelivery): Promise<DeliveryOutcome> {
    return insertDelivery(this.db, this.poster, input);
  }

  listDeliveries(
    scope: StoreScope,
    query: DeliveryPageQuery
  ): Promise<DeliveryPage> {
    return listDeliveries(this.db, scope, query);
  }

  findDelivery(
    scope: StoreScope,
    id: string
  ): Promise<DeliveryDetail | undefined> {
    return findDelivery(this.db, scope, id);
  }
}

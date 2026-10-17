import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';
import { advisoryLock } from '../../common/db/advisory-lock';

interface LockedStock {
  onHand: number;
  valueMinor: number;
}

/** Locks each store-item pair in item id order, so two sales never wait on each other in a circle. */
export async function lockStock(
  trx: Kysely<DB>,
  lock: {
    organizationId: string;
    storeId: string;
    itemIds: readonly string[];
  }
): Promise<Map<string, LockedStock>> {
  const { organizationId, storeId } = lock;
  const sorted = lock.itemIds.toSorted((a, b) => a.localeCompare(b));
  for (const itemId of sorted) {
    await advisoryLock(trx, `stock:${organizationId}:${storeId}:${itemId}`);
  }
  const rows = await trx
    .selectFrom('stock_movement')
    .where('organization_id', '=', organizationId)
    .where('store_id', '=', storeId)
    .where('item_id', 'in', sorted)
    .select([
      'item_id',
      sql<string>`sum(quantity)`.as('on_hand'),
      sql<string>`sum(value_minor)`.as('value_minor'),
    ])
    .groupBy('item_id')
    .execute();
  return new Map(
    rows.map((row) => [
      row.item_id,
      { onHand: Number(row.on_hand), valueMinor: Number(row.value_minor) },
    ])
  );
}

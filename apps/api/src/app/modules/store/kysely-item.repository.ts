import { sql, type Kysely } from 'kysely';
import { itemDisplayName, itemKindSchema } from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import { escapeLike } from '../../common/db/escape-like';
import { isoOrNull } from '../../common/db/rows';
import { uniqueViolation } from '../../common/db/unique-violation';
import type {
  ItemChange,
  ItemFilter,
  ItemInsertOutcome,
  ItemRecord,
  ItemUpdateOutcome,
  NewItem,
} from './store.repository';

const ACTIVE_ITEM_KEY = 'item_active_key';

interface ItemRow {
  id: string;
  kind: string;
  name: string;
  variant: string | null;
  class_level_id: string | null;
  class_level_name: string | null;
  cost_price_minor: string;
  sell_price_minor: string;
  low_stock_level: number;
  retired_at: Date | null;
}

const toItem = (row: ItemRow): ItemRecord => ({
  id: row.id,
  kind: itemKindSchema.parse(row.kind),
  name: row.name,
  variant: row.variant,
  displayName: itemDisplayName(row),
  classLevel:
    row.class_level_id === null
      ? null
      : { id: row.class_level_id, name: row.class_level_name ?? '' },
  costPriceMinor: Number(row.cost_price_minor),
  sellPriceMinor: Number(row.sell_price_minor),
  lowStockLevel: row.low_stock_level,
  retiredAt: isoOrNull(row.retired_at),
});

function itemQuery(db: Kysely<DB>, organizationId: string) {
  return db
    .selectFrom('item')
    .leftJoin('class_level', (join) =>
      join
        .onRef('class_level.id', '=', 'item.class_level_id')
        .onRef('class_level.organization_id', '=', 'item.organization_id')
    )
    .where('item.organization_id', '=', organizationId)
    .select([
      'item.id',
      'item.kind',
      'item.name',
      'item.variant',
      'item.class_level_id',
      'class_level.name as class_level_name',
      'item.cost_price_minor',
      'item.sell_price_minor',
      'item.low_stock_level',
      'item.retired_at',
    ]);
}

export async function readItem(
  db: Kysely<DB>,
  organizationId: string,
  id: string
): Promise<ItemRecord | undefined> {
  const row = await itemQuery(db, organizationId)
    .where('item.id', '=', id)
    .executeTakeFirst();
  return row && toItem(row);
}

async function readItemOrThrow(
  db: Kysely<DB>,
  organizationId: string,
  id: string
): Promise<ItemRecord> {
  const item = await readItem(db, organizationId, id);
  if (item === undefined) {
    throw new Error('The item just written could not be read');
  }
  return item;
}

export async function readItems(
  db: Kysely<DB>,
  organizationId: string,
  ids: readonly string[]
): Promise<ItemRecord[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await itemQuery(db, organizationId)
    .where('item.id', 'in', [...ids])
    .execute();
  return rows.map((row) => toItem(row));
}

export async function listItemRecords(
  db: Kysely<DB>,
  organizationId: string,
  filter: ItemFilter
): Promise<ItemRecord[]> {
  const { q } = filter;
  const rows = await itemQuery(db, organizationId)
    .$if(filter.kind !== undefined, (qb) =>
      qb.where('item.kind', '=', filter.kind ?? '')
    )
    .$if(!filter.includeRetired, (qb) =>
      qb.where('item.retired_at', 'is', null)
    )
    .$if(q !== undefined && q !== '', (qb) => {
      const pattern = `%${escapeLike(q ?? '')}%`;
      return qb.where((eb) =>
        eb.or([
          eb('item.name', 'ilike', pattern),
          eb('item.variant', 'ilike', pattern),
          eb('class_level.name', 'ilike', pattern),
        ])
      );
    })
    .orderBy('item.kind', 'desc')
    .orderBy('item.name')
    .orderBy('class_level.sequence')
    .orderBy(sql`length(item.variant)`)
    .orderBy('item.variant')
    .orderBy('item.id')
    .execute();
  return rows.map((row) => toItem(row));
}

interface ItemIdentity {
  organizationId: string;
  kind: string;
  name: string;
  variant: string | null;
  classLevelId: string | null;
  exceptId?: string;
}

async function activeClash(
  db: Kysely<DB>,
  identity: ItemIdentity
): Promise<boolean> {
  const row = await db
    .selectFrom('item')
    .select('id')
    .where('organization_id', '=', identity.organizationId)
    .where('kind', '=', identity.kind)
    .where('name', '=', identity.name)
    .where(sql<boolean>`variant IS NOT DISTINCT FROM ${identity.variant}`)
    .where(
      sql<boolean>`class_level_id IS NOT DISTINCT FROM ${identity.classLevelId}`
    )
    .where('retired_at', 'is', null)
    .$if(identity.exceptId !== undefined, (qb) =>
      qb.where('id', '<>', identity.exceptId ?? '')
    )
    .executeTakeFirst();
  return row !== undefined;
}

async function createItem(
  trx: Kysely<DB>,
  input: NewItem
): Promise<ItemInsertOutcome> {
  if (await activeClash(trx, input)) {
    return { status: 'duplicate' };
  }
  const created = await trx
    .insertInto('item')
    .values({
      organization_id: input.organizationId,
      kind: input.kind,
      name: input.name,
      variant: input.variant,
      class_level_id: input.classLevelId,
      cost_price_minor: input.costPriceMinor,
      sell_price_minor: input.sellPriceMinor,
      low_stock_level: input.lowStockLevel,
      created_by: input.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return {
    status: 'created',
    item: await readItemOrThrow(trx, input.organizationId, created.id),
  };
}

export async function insertItem(
  db: Kysely<DB>,
  input: NewItem
): Promise<ItemInsertOutcome> {
  try {
    return await db.transaction().execute((trx) => createItem(trx, input));
  } catch (error) {
    if (uniqueViolation(error) === ACTIVE_ITEM_KEY) {
      return { status: 'duplicate' };
    }
    throw error;
  }
}

interface Current {
  kind: string;
  name: string;
  variant: string | null;
  class_level_id: string | null;
  cost_price_minor: string;
  sell_price_minor: string;
  low_stock_level: number;
  retired_at: Date | null;
}

interface Next {
  name: string;
  variant: string | null;
  cost: number;
  price: number;
}

const nextValues = (current: Current, change: ItemChange): Next => ({
  name: change.name ?? current.name,
  variant: change.variant === undefined ? current.variant : change.variant,
  cost: change.costPriceMinor ?? Number(current.cost_price_minor),
  price: change.sellPriceMinor ?? Number(current.sell_price_minor),
});

async function writeUpdate(
  trx: Kysely<DB>,
  change: ItemChange,
  edit: { current: Current; next: Next }
): Promise<void> {
  const { current, next } = edit;
  await trx
    .updateTable('item')
    .set({
      name: next.name,
      variant: next.variant,
      cost_price_minor: next.cost,
      sell_price_minor: next.price,
      low_stock_level: change.lowStockLevel ?? current.low_stock_level,
      updated_at: new Date(),
      ...(change.retire
        ? { retired_at: new Date(), retired_by: change.userId }
        : {}),
    })
    .where('organization_id', '=', change.organizationId)
    .where('id', '=', change.itemId)
    .execute();
}

async function recordPriceChange(
  trx: Kysely<DB>,
  change: ItemChange,
  edit: { current: Current; next: Next }
): Promise<void> {
  const { current, next } = edit;
  if (
    next.cost === Number(current.cost_price_minor) &&
    next.price === Number(current.sell_price_minor)
  ) {
    return;
  }
  await trx
    .insertInto('item_price_change')
    .values({
      organization_id: change.organizationId,
      item_id: change.itemId,
      old_cost_minor: current.cost_price_minor,
      new_cost_minor: next.cost,
      old_price_minor: current.sell_price_minor,
      new_price_minor: next.price,
      changed_by: change.userId,
    })
    .execute();
}

async function editItem(
  trx: Kysely<DB>,
  change: ItemChange
): Promise<ItemUpdateOutcome> {
  const { organizationId, itemId } = change;
  const current = await trx
    .selectFrom('item')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', itemId)
    .forUpdate()
    .executeTakeFirst();
  if (current === undefined) {
    return { status: 'missing' };
  }
  if (current.retired_at !== null) {
    return { status: 'retired' };
  }
  const next = nextValues(current, change);
  const clash = await activeClash(trx, {
    organizationId,
    kind: current.kind,
    name: next.name,
    variant: next.variant,
    classLevelId: current.class_level_id,
    exceptId: itemId,
  });
  if (clash) {
    return { status: 'duplicate' };
  }
  await writeUpdate(trx, change, { current, next });
  await recordPriceChange(trx, change, { current, next });
  return {
    status: 'updated',
    item: await readItemOrThrow(trx, organizationId, itemId),
  };
}

export async function updateItem(
  db: Kysely<DB>,
  change: ItemChange
): Promise<ItemUpdateOutcome> {
  try {
    return await db.transaction().execute((trx) => editItem(trx, change));
  } catch (error) {
    if (uniqueViolation(error) === ACTIVE_ITEM_KEY) {
      return { status: 'duplicate' };
    }
    throw error;
  }
}

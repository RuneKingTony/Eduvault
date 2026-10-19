import { sql, type RawBuilder } from 'kysely';
import {
  itemDisplayName,
  type Delivery,
  type DeliveryDetail,
  type DeliveryLine,
} from '@eduvault/api-contract';
import type { Database } from '../../common/db/tokens';
import { inScope } from '../../common/students';
import type { DeliveryPage, DeliveryPageQuery } from './store.repository';
import type { OrgScope } from '../../common/scope';

interface DeliveryRow {
  id: string;
  number: string;
  reference: string;
  campus_id: string;
  supplier_name: string;
  money_account_id: string | null;
  account_name: string | null;
  is_opening: boolean;
  received_on: string;
  received_by: string | null;
  total_minor: string;
  item_count: number;
  total_rows: number;
}

interface LineRow {
  item_id: string;
  name: string;
  variant: string | null;
  retired: boolean;
  quantity: number;
  unit_cost_minor: string;
  total_minor: string;
}

const toDelivery = (row: DeliveryRow): Delivery => ({
  id: row.id,
  number: row.number,
  reference: row.reference,
  campusId: row.campus_id,
  supplierName: row.supplier_name,
  moneyAccount:
    row.money_account_id === null
      ? null
      : { id: row.money_account_id, name: row.account_name ?? '' },
  isOpening: row.is_opening,
  receivedOn: row.received_on,
  receivedBy: row.received_by,
  totalMinor: Number(row.total_minor),
  itemCount: row.item_count,
});

const toDeliveryLine = (line: LineRow): DeliveryLine => ({
  itemId: line.item_id,
  itemName: line.name,
  displayName: itemDisplayName({ name: line.name, variant: line.variant }),
  retired: line.retired,
  quantity: line.quantity,
  unitCostMinor: Number(line.unit_cost_minor),
  totalMinor: Number(line.total_minor),
});

const SELECT = sql`
  SELECT d.id, d.number, d.reference, s.campus_id, d.supplier_name,
    d.money_account_id, ma.name AS account_name, d.is_opening,
    to_char(d.received_on, 'YYYY-MM-DD') AS received_on,
    u.name AS received_by, d.total_minor::text AS total_minor,
    (SELECT count(*) FROM stock_delivery_line l
      WHERE l.stock_delivery_id = d.id AND l.organization_id = d.organization_id)::int AS item_count,
    (count(*) OVER ())::int AS total_rows
  FROM stock_delivery d
  JOIN store s ON s.id = d.store_id AND s.organization_id = d.organization_id
  LEFT JOIN money_account ma
    ON ma.id = d.money_account_id AND ma.organization_id = d.organization_id
  LEFT JOIN "user" u ON u.id = d.received_by`;

function filters(
  scope: OrgScope,
  extra: RawBuilder<unknown>[]
): RawBuilder<unknown> {
  return sql.join(
    [
      sql`d.organization_id = ${scope.organizationId}`,
      inScope(sql.ref('s.campus_id'), scope.campusScope),
      ...extra,
    ],
    sql` AND `
  );
}

async function suppliersOf(db: Database, scope: OrgScope): Promise<string[]> {
  const { rows } = await sql<{ supplier_name: string }>`
    SELECT DISTINCT d.supplier_name
    FROM stock_delivery d
    JOIN store s ON s.id = d.store_id AND s.organization_id = d.organization_id
    WHERE ${filters(scope, [sql`NOT d.is_opening`])}
    ORDER BY d.supplier_name`.execute(db);
  return rows.map((row) => row.supplier_name);
}

export async function listDeliveries(
  db: Database,
  scope: OrgScope,
  query: DeliveryPageQuery
): Promise<DeliveryPage> {
  const extra =
    query.campusId === undefined ? [] : [sql`s.campus_id = ${query.campusId}`];
  const [{ rows }, suppliers] = await Promise.all([
    sql<DeliveryRow>`
    ${SELECT}
    WHERE ${filters(scope, extra)}
    ORDER BY d.received_on DESC, d.created_at DESC, d.id
    LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`.execute(
      db
    ),
    suppliersOf(db, scope),
  ]);
  return {
    items: rows.map((row) => toDelivery(row)),
    total: rows[0]?.total_rows ?? 0,
    suppliers,
  };
}

export async function findDelivery(
  db: Database,
  scope: OrgScope,
  id: string
): Promise<DeliveryDetail | undefined> {
  const byId = sql`d.id = ${id}`;
  const { rows } = await sql<DeliveryRow>`
    ${SELECT}
    WHERE ${filters(scope, [byId])}`.execute(db);
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  const lines = await sql<LineRow>`
    SELECT l.item_id, i.name, i.variant, (i.retired_at IS NOT NULL) AS retired,
      l.quantity, l.unit_cost_minor::text AS unit_cost_minor,
      (l.quantity::bigint * l.unit_cost_minor)::text AS total_minor
    FROM stock_delivery_line l
    JOIN item i ON i.id = l.item_id AND i.organization_id = l.organization_id
    WHERE l.stock_delivery_id = ${id} AND l.organization_id = ${scope.organizationId}
    ORDER BY i.kind DESC, i.name, length(i.variant), i.variant, l.id`.execute(
    db
  );
  return {
    ...toDelivery(row),
    lines: lines.rows.map((line) => toDeliveryLine(line)),
  };
}

import { sql } from 'kysely';
import {
  itemDisplayName,
  stockCountStatusSchema,
  type StockCount,
  type StockCountLine,
  type StockCountList,
  type StockCountListQuery,
} from '@eduvault/api-contract';
import {
  FORMER_MEMBER_NAME,
  type WaitingApproval,
} from '../../common/approvals';
import { iso } from '../../common/db/rows';
import type { Database } from '../../common/db/tokens';
import { inScope } from '../../common/students';
import {
  differenceValue,
  differencesSummary,
  lineDifference,
  netValue,
  NO_STOCK,
  type StockLevel,
} from './stock-count';
import type { OrgScope } from '../../common/scope';

interface CountRow {
  id: string;
  number: string;
  status: string;
  note: string | null;
  created_at: Date;
  store_id: string;
  campus_id: string;
  campus_name: string;
  created_by: string | null;
  created_by_name: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  rejection_reason: string | null;
  total_rows: number;
}

interface LineRow {
  stock_count_id: string;
  item_id: string;
  name: string;
  variant: string | null;
  cost_price_minor: string;
  expected_quantity: number;
  counted_quantity: number;
}

interface CountFilter {
  campusId?: string;
  id?: string;
  status?: 'submitted';
  page?: Pick<StockCountListQuery, 'page' | 'pageSize'>;
}

const COUNT_COLUMNS = sql`
  sc.id, sc.number, sc.status, sc.note, sc.created_at, sc.store_id,
  s.campus_id, t.name AS campus_name, sc.created_by, cu.name AS created_by_name,
  CASE sc.status WHEN 'approved' THEN sc.approved_by WHEN 'rejected' THEN sc.rejected_by END AS decided_by,
  du.name AS decided_by_name, sc.rejection_reason`;

const COUNT_JOINS = sql`
  FROM stock_count sc
  JOIN store s ON s.id = sc.store_id AND s.organization_id = sc.organization_id
  JOIN team t ON t.id = s.campus_id
  LEFT JOIN "user" cu ON cu.id = sc.created_by
  LEFT JOIN "user" du ON du.id = CASE sc.status WHEN 'approved' THEN sc.approved_by WHEN 'rejected' THEN sc.rejected_by END`;

export const STORE_CAMPUS = sql`s.campus_id`;

const visible = (scope: OrgScope) =>
  sql`sc.organization_id = ${scope.organizationId}
    AND ${inScope(STORE_CAMPUS, scope.campusScope)}`;

const filters = (filter: CountFilter) =>
  sql.join(
    [
      filter.campusId === undefined
        ? sql`TRUE`
        : sql`s.campus_id = ${filter.campusId}`,
      filter.id === undefined ? sql`TRUE` : sql`sc.id = ${filter.id}`,
      filter.status === undefined
        ? sql`TRUE`
        : sql`sc.status = ${filter.status}`,
    ],
    sql` AND `
  );

const keyOf = (...parts: string[]): string => parts.join(':');

export async function readLines(
  db: Database,
  scope: OrgScope,
  ids: readonly string[]
): Promise<Map<string, LineRow[]>> {
  const { rows } = await sql<LineRow>`
    SELECT l.stock_count_id, l.item_id, i.name, i.variant,
      i.cost_price_minor::text AS cost_price_minor,
      l.expected_quantity, l.counted_quantity
    FROM stock_count_line l
    JOIN item i ON i.id = l.item_id AND i.organization_id = l.organization_id
    WHERE l.organization_id = ${scope.organizationId}
      AND l.stock_count_id IN (${sql.join(ids)})
    ORDER BY i.name, i.variant NULLS FIRST, i.id`.execute(db);
  const byCount = new Map<string, LineRow[]>();
  for (const row of rows) {
    byCount.set(row.stock_count_id, [
      ...(byCount.get(row.stock_count_id) ?? []),
      row,
    ]);
  }
  return byCount;
}

async function readStock(
  db: Database,
  scope: OrgScope,
  counts: readonly CountRow[]
): Promise<Map<string, StockLevel>> {
  const storeIds = [...new Set(counts.map((count) => count.store_id))];
  const { rows } = await sql<{
    store_id: string;
    item_id: string;
    on_hand: string;
    value_minor: string;
  }>`
    SELECT store_id, item_id, sum(quantity)::text AS on_hand, sum(value_minor)::text AS value_minor
    FROM stock_movement
    WHERE organization_id = ${scope.organizationId}
      AND store_id IN (${sql.join(storeIds)})
    GROUP BY store_id, item_id`.execute(db);
  return new Map(
    rows.map((row) => [
      keyOf(row.store_id, row.item_id),
      { onHand: Number(row.on_hand), valueMinor: Number(row.value_minor) },
    ])
  );
}

async function readPosted(
  db: Database,
  scope: OrgScope,
  counts: readonly CountRow[]
): Promise<Map<string, number>> {
  const numbers = counts
    .filter((count) => count.status === 'approved')
    .map((count) => count.number);
  if (numbers.length === 0) {
    return new Map();
  }
  const { rows } = await sql<{
    reference: string;
    store_id: string;
    item_id: string;
    value_minor: string;
  }>`
    SELECT reference, store_id, item_id, value_minor::text AS value_minor
    FROM stock_movement
    WHERE organization_id = ${scope.organizationId} AND kind = 'count'
      AND reference IN (${sql.join(numbers)})`.execute(db);
  return new Map(
    rows.map((row) => [
      keyOf(row.reference, row.store_id, row.item_id),
      Number(row.value_minor),
    ])
  );
}

interface Valuation {
  stock: ReadonlyMap<string, StockLevel>;
  posted: ReadonlyMap<string, number>;
}

function lineOf(count: CountRow, line: LineRow, valuation: Valuation) {
  const difference = lineDifference({
    expectedQuantity: line.expected_quantity,
    countedQuantity: line.counted_quantity,
  });
  const key = keyOf(count.store_id, line.item_id);
  let valueMinor = 0;
  if (difference !== 0 && count.status === 'approved') {
    valueMinor = Math.abs(
      valuation.posted.get(keyOf(count.number, count.store_id, line.item_id)) ??
        0
    );
  } else if (difference !== 0) {
    valueMinor = differenceValue(
      difference,
      valuation.stock.get(key) ?? NO_STOCK,
      Number(line.cost_price_minor)
    );
  }
  const result: StockCountLine = {
    itemId: line.item_id,
    displayName: itemDisplayName(line),
    expectedQuantity: line.expected_quantity,
    countedQuantity: line.counted_quantity,
    difference,
    valueMinor,
  };
  return result;
}

function toCount(
  row: CountRow,
  lines: readonly LineRow[],
  valuation: Valuation
): StockCount {
  const counted = lines.map((line) => lineOf(row, line, valuation));
  return {
    id: row.id,
    number: row.number,
    campusId: row.campus_id,
    campusName: row.campus_name,
    status: stockCountStatusSchema.parse(row.status),
    note: row.note,
    createdAt: iso(row.created_at),
    countedBy: {
      id: row.created_by,
      name: row.created_by_name ?? FORMER_MEMBER_NAME,
    },
    decidedBy:
      row.decided_by === null
        ? null
        : {
            id: row.decided_by,
            name: row.decided_by_name ?? FORMER_MEMBER_NAME,
          },
    rejectionReason: row.rejection_reason,
    netValueMinor: netValue(counted),
    differences: differencesSummary(counted),
    lines: counted,
  };
}

async function totalOf(
  db: Database,
  scope: OrgScope,
  filter: CountFilter
): Promise<number> {
  const { rows } = await sql<{ total: number }>`
    SELECT count(*)::int AS total ${COUNT_JOINS}
    WHERE ${visible(scope)} AND ${filters(filter)}`.execute(db);
  return rows[0]?.total ?? 0;
}

async function readCounts(
  db: Database,
  scope: OrgScope,
  filter: CountFilter
): Promise<StockCountList> {
  const { page } = filter;
  const window =
    page === undefined
      ? sql``
      : sql`LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`;
  const { rows } = await sql<CountRow>`
    SELECT ${COUNT_COLUMNS}, count(*) OVER ()::int AS total_rows ${COUNT_JOINS}
    WHERE ${visible(scope)} AND ${filters(filter)}
    ORDER BY sc.created_at DESC, sc.id
    ${window}`.execute(db);
  if (rows.length === 0) {
    return {
      items: [],
      total:
        page !== undefined && page.page > 1
          ? await totalOf(db, scope, filter)
          : 0,
    };
  }
  const [lines, stock, posted] = await Promise.all([
    readLines(
      db,
      scope,
      rows.map((row) => row.id)
    ),
    readStock(db, scope, rows),
    readPosted(db, scope, rows),
  ]);
  return {
    items: rows.map((row) =>
      toCount(row, lines.get(row.id) ?? [], { stock, posted })
    ),
    total: rows[0]?.total_rows ?? 0,
  };
}

export const listStockCounts = (
  db: Database,
  scope: OrgScope,
  query: StockCountListQuery
): Promise<StockCountList> =>
  readCounts(db, scope, { campusId: query.campusId, page: query });

export async function findStockCount(
  db: Database,
  scope: OrgScope,
  id: string
): Promise<StockCount | undefined> {
  const { items } = await readCounts(db, scope, { id });
  return items[0];
}

export async function waitingStockCounts(
  db: Database,
  scope: OrgScope
): Promise<WaitingApproval[]> {
  const { items } = await readCounts(db, scope, { status: 'submitted' });
  return items.map((count) => ({
    kind: 'store_write_off',
    id: count.id,
    details: `${count.campusName} stock count: ${count.differences}`,
    amountMinor: count.netValueMinor,
    amountText: null,
    createdById: count.countedBy.id,
    createdByName: count.countedBy.name,
    createdAt: count.createdAt,
    campusId: count.campusId,
  }));
}

export async function waitingCountNumber(
  db: Database,
  scope: OrgScope,
  campusId: string
): Promise<string | undefined> {
  const { rows } = await sql<{ number: string }>`
    SELECT sc.number ${COUNT_JOINS}
    WHERE ${visible(scope)} AND s.campus_id = ${campusId} AND sc.status = 'submitted'`.execute(
    db
  );
  return rows[0]?.number;
}

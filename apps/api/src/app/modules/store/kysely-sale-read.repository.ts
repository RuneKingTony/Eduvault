import { sql, type RawBuilder } from 'kysely';
import {
  itemDisplayName,
  paymentMethodSchema,
  studentLifeSchema,
  type PortalPurchase,
  type PortalPurchases,
  type Sale,
  type SaleLine,
  type StoreTermFigures,
} from '@eduvault/api-contract';
import type { Database } from '../../common/db/tokens';
import { receivableBalanceSql } from '../../common/ledger';
import {
  currentCampusSql,
  payingGuardian,
  inScope,
  studentClassNameSql,
  visibleStudentsCte,
} from '../../common/students';
import type {
  OptionStudents,
  SalePage,
  SalePageQuery,
  SaleStudent,
  StudentPlacement,
} from './sale.repository';
import { averageCost } from './stock-value';
import type { OrgScope } from '../../common/scope';

interface SaleRow {
  id: string;
  number: string;
  reference: string;
  sold_on: string;
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  class_name: string | null;
  campus_id: string;
  campus_name: string;
  sold_by: string | null;
  invoice_id: string;
  charge_number: string;
  payment_id: string;
  receipt_number: string;
  method: string;
  proof_file_id: string | null;
  proof_name: string | null;
  total_rows: number;
}

interface LineRow {
  store_sale_id: string;
  item_id: string;
  name: string;
  variant: string | null;
  quantity: number;
  unit_price_minor: string;
  cost_minor: string;
}

const toLine = (row: LineRow): SaleLine => {
  const unitPriceMinor = Number(row.unit_price_minor);
  const costMinor = Number(row.cost_minor);
  return {
    itemId: row.item_id,
    displayName: itemDisplayName({ name: row.name, variant: row.variant }),
    quantity: row.quantity,
    unitPriceMinor,
    amountMinor: unitPriceMinor * row.quantity,
    costMinor,
    unitCostMinor: averageCost(costMinor, row.quantity),
  };
};

const sumOf = (lines: readonly SaleLine[], pick: (line: SaleLine) => number) =>
  lines.reduce((total, line) => total + pick(line), 0);

function toSale(row: SaleRow, lines: SaleLine[]): Sale {
  return {
    id: row.id,
    number: row.number,
    reference: row.reference,
    soldOn: row.sold_on,
    student: {
      id: row.student_id,
      name: `${row.first_name} ${row.last_name}`,
      admissionNumber: row.admission_number,
      className: row.class_name,
    },
    campusId: row.campus_id,
    campusName: row.campus_name,
    soldBy: row.sold_by,
    lines,
    totalMinor: sumOf(lines, (line) => line.amountMinor),
    costMinor: sumOf(lines, (line) => line.costMinor),
    chargeId: row.invoice_id,
    chargeNumber: row.charge_number,
    paymentId: row.payment_id,
    receiptNumber: row.receipt_number,
    method: paymentMethodSchema.parse(row.method),
    proof:
      row.proof_file_id === null || row.proof_name === null
        ? null
        : { fileId: row.proof_file_id, fileName: row.proof_name },
  };
}

const SELECT = sql`
  SELECT ss.id, ss.number, ss.reference,
    to_char(ss.sold_on, 'YYYY-MM-DD') AS sold_on,
    st.id AS student_id, st.first_name, st.last_name, st.admission_number,
    ${studentClassNameSql('st')} AS class_name,
    s.campus_id, camp.name AS campus_name, u.name AS sold_by,
    ss.invoice_id, inv.number AS charge_number,
    ss.payment_id, p.receipt_number, p.method,
    p.proof_file_id, fo.original_name AS proof_name,
    (count(*) OVER ())::int AS total_rows
  FROM store_sale ss
  JOIN store s ON s.id = ss.store_id AND s.organization_id = ss.organization_id
  JOIN team camp ON camp.id = s.campus_id
  JOIN student st ON st.id = ss.student_id AND st.organization_id = ss.organization_id
  JOIN invoice inv ON inv.id = ss.invoice_id AND inv.organization_id = ss.organization_id
  JOIN payment p ON p.id = ss.payment_id AND p.organization_id = ss.organization_id
  LEFT JOIN file_object fo
    ON fo.id = p.proof_file_id AND fo.organization_id = p.organization_id
  LEFT JOIN "user" u ON u.id = ss.sold_by`;

const NEWEST_FIRST = sql`ORDER BY ss.sold_on DESC, ss.created_at DESC, ss.id`;

async function linesOf(
  db: Database,
  request: { organizationId: string; saleIds: readonly string[] }
): Promise<Map<string, SaleLine[]>> {
  const grouped = new Map<string, SaleLine[]>();
  if (request.saleIds.length === 0) {
    return grouped;
  }
  const { rows } = await sql<LineRow>`
    SELECT l.store_sale_id, l.item_id, i.name, i.variant, l.quantity,
      l.unit_price_minor::text AS unit_price_minor, l.cost_minor::text AS cost_minor
    FROM store_sale_line l
    JOIN item i ON i.id = l.item_id AND i.organization_id = l.organization_id
    WHERE l.organization_id = ${request.organizationId}
      AND l.store_sale_id IN (${sql.join(request.saleIds)})
    ORDER BY i.kind DESC, i.name, length(i.variant), i.variant, l.id`.execute(
    db
  );
  for (const row of rows) {
    const list = grouped.get(row.store_sale_id) ?? [];
    list.push(toLine(row));
    grouped.set(row.store_sale_id, list);
  }
  return grouped;
}

async function withLines(
  db: Database,
  organizationId: string,
  rows: readonly SaleRow[]
): Promise<Sale[]> {
  const lines = await linesOf(db, {
    organizationId,
    saleIds: rows.map((row) => row.id),
  });
  return rows.map((row) => toSale(row, lines.get(row.id) ?? []));
}

function listFilters(
  scope: OrgScope,
  query: Pick<SalePageQuery, 'campusId' | 'studentId'>
): RawBuilder<unknown> {
  const parts = [
    sql`ss.organization_id = ${scope.organizationId}`,
    inScope(sql.ref('s.campus_id'), scope.campusScope),
  ];
  if (query.campusId !== undefined) {
    parts.push(sql`s.campus_id = ${query.campusId}`);
  }
  if (query.studentId !== undefined) {
    parts.push(sql`ss.student_id = ${query.studentId}`);
  }
  return sql.join(parts, sql` AND `);
}

export async function listSales(
  db: Database,
  scope: OrgScope,
  query: SalePageQuery
): Promise<SalePage> {
  const { rows } = await sql<SaleRow>`
    ${SELECT}
    WHERE ${listFilters(scope, query)}
    ${NEWEST_FIRST}
    LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`.execute(
    db
  );
  return {
    items: await withLines(db, scope.organizationId, rows),
    total: rows[0]?.total_rows ?? 0,
  };
}

export async function findSale(
  db: Database,
  scope: OrgScope,
  id: string
): Promise<Sale | undefined> {
  const { rows } = await sql<SaleRow>`
    ${SELECT}
    WHERE ${listFilters(scope, {})} AND ss.id = ${id}`.execute(db);
  const [sale] = await withLines(db, scope.organizationId, rows);
  return sale;
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  life: string;
  campus_id: string;
  campus_name: string;
  class_name: string | null;
}

export async function findSaleStudent(
  db: Database,
  scope: OrgScope,
  request: { studentId: string; today: string }
): Promise<SaleStudent | undefined> {
  const { rows } = await sql<StudentRow>`
    WITH ${visibleStudentsCte({
      organizationId: scope.organizationId,
      campusScope: scope.campusScope,
      classScope: 'all',
      today: request.today,
      studentId: request.studentId,
    })}
    SELECT v.id, v.first_name, v.last_name, v.admission_number, v.life,
      v.campus_id, camp.name AS campus_name,
      ${studentClassNameSql('v')} AS class_name
    FROM visible v
    JOIN team camp ON camp.id = v.campus_id`.execute(db);
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  const payer = await payingGuardian(db, {
    organizationId: scope.organizationId,
    studentId: request.studentId,
  });
  return {
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    admissionNumber: row.admission_number,
    life: studentLifeSchema.parse(row.life),
    campusId: row.campus_id,
    campusName: row.campus_name,
    className: row.class_name,
    payer:
      payer === undefined
        ? null
        : { guardianId: payer.id, name: payer.fullName },
  };
}

interface OptionRow {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  campus_id: string;
  campus_name: string;
  class_name: string | null;
  level_id: string | null;
  level_name: string | null;
  balance: string | null;
}

export async function optionStudents(
  db: Database,
  scope: OrgScope,
  request: { today: string; withBalance: boolean }
): Promise<OptionStudents> {
  const { rows } = await sql<OptionRow>`
    WITH ${visibleStudentsCte({
      organizationId: scope.organizationId,
      campusScope: scope.campusScope,
      classScope: 'all',
      today: request.today,
    })}
    SELECT v.id, v.first_name, v.last_name, v.admission_number,
      v.campus_id, camp.name AS campus_name,
      ${studentClassNameSql('v')} AS class_name,
      cl.id AS level_id, cl.name AS level_name,
      ${request.withBalance ? sql`(${receivableBalanceSql('v')})::text` : sql`NULL`} AS balance
    FROM visible v
    JOIN team camp ON camp.id = v.campus_id
    LEFT JOIN class_level cl
      ON cl.id = v.latest_level_id AND cl.organization_id = v.organization_id
    WHERE v.life = 'active'
    ORDER BY v.first_name, v.last_name, v.id`.execute(db);
  return rows.map((row) => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    admissionNumber: row.admission_number,
    className: row.class_name,
    levelId: row.level_id,
    levelName: row.level_name,
    campusId: row.campus_id,
    campusName: row.campus_name,
    ...(row.balance === null ? {} : { balanceMinor: Number(row.balance) }),
  }));
}

const NO_FIGURES = {
  sales: '0',
  cost: '0',
  sale_count: 0,
  items: '0',
  students: 0,
};

export async function termFigures(
  db: Database,
  scope: OrgScope,
  campusId: string | undefined
): Promise<StoreTermFigures> {
  const { rows } = await sql<{
    sales: string;
    cost: string;
    sale_count: number;
    items: string;
    students: number;
  }>`
    WITH cur AS (
      SELECT t.starts_on, t.ends_on FROM term t
      WHERE t.organization_id = ${scope.organizationId} AND t.is_current
      LIMIT 1
    ),
    totals AS (
      SELECT l.store_sale_id,
        sum(l.quantity::bigint * l.unit_price_minor) AS amount,
        sum(l.cost_minor) AS cost,
        sum(l.quantity) AS quantity
      FROM store_sale_line l
      WHERE l.organization_id = ${scope.organizationId}
      GROUP BY l.store_sale_id
    )
    SELECT COALESCE(sum(totals.amount), 0)::text AS sales,
      COALESCE(sum(totals.cost), 0)::text AS cost,
      count(ss.id)::int AS sale_count,
      COALESCE(sum(totals.quantity), 0)::text AS items,
      count(DISTINCT ss.student_id)::int AS students
    FROM store_sale ss
    JOIN store s ON s.id = ss.store_id AND s.organization_id = ss.organization_id
    JOIN cur ON ss.sold_on BETWEEN cur.starts_on AND cur.ends_on
    JOIN totals ON totals.store_sale_id = ss.id
    WHERE ${listFilters(scope, { campusId })}`.execute(db);
  const row = rows[0] ?? NO_FIGURES;
  return {
    termSalesMinor: Number(row.sales),
    termCostMinor: Number(row.cost),
    termSalesCount: row.sale_count,
    termItemsSold: Number(row.items),
    termStudentsServed: row.students,
  };
}

interface PortalRow {
  id: string;
  sold_on: string;
  campus_name: string;
  receipt_number: string;
  method: string;
}

interface TermWindow {
  name: string;
  starts_on: string;
  ends_on: string;
}

const purchaseRows = (
  db: Database,
  request: { organizationId: string; studentId: string }
) =>
  sql<PortalRow>`
    SELECT ss.id, to_char(ss.sold_on, 'YYYY-MM-DD') AS sold_on,
      camp.name AS campus_name, p.receipt_number, p.method
    FROM store_sale ss
    JOIN store s ON s.id = ss.store_id AND s.organization_id = ss.organization_id
    JOIN team camp ON camp.id = s.campus_id
    JOIN payment p ON p.id = ss.payment_id AND p.organization_id = ss.organization_id
    WHERE ss.organization_id = ${request.organizationId}
      AND ss.student_id = ${request.studentId}
    ${NEWEST_FIRST}`.execute(db);

const currentWindow = (db: Database, organizationId: string) =>
  sql<TermWindow>`
    SELECT t.name, to_char(t.starts_on, 'YYYY-MM-DD') AS starts_on,
      to_char(t.ends_on, 'YYYY-MM-DD') AS ends_on
    FROM term t
    WHERE t.organization_id = ${organizationId} AND t.is_current
    LIMIT 1`.execute(db);

const toPortalSale = (
  row: PortalRow,
  own: readonly SaleLine[]
): PortalPurchase => ({
  id: row.id,
  date: row.sold_on,
  campusName: row.campus_name,
  receiptNumber: row.receipt_number,
  method: paymentMethodSchema.parse(row.method),
  totalMinor: sumOf(own, (line) => line.amountMinor),
  lines: own.map((line) => ({
    itemName: line.displayName,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    amountMinor: line.amountMinor,
  })),
});

function summarise(
  sales: readonly PortalPurchase[],
  term: TermWindow | undefined
): PortalPurchases {
  const thisTerm = sales.filter(
    (sale) =>
      term !== undefined &&
      sale.date >= term.starts_on &&
      sale.date <= term.ends_on
  );
  return {
    termName: term?.name ?? null,
    spentThisTermMinor: thisTerm.reduce(
      (total, sale) => total + sale.totalMinor,
      0
    ),
    termPurchaseCount: thisTerm.length,
    itemsBought: sales.reduce(
      (total, sale) =>
        total + sale.lines.reduce((sum, line) => sum + line.quantity, 0),
      0
    ),
    sales: [...sales],
  };
}

export async function portalPurchases(
  db: Database,
  request: { organizationId: string; studentId: string }
): Promise<PortalPurchases> {
  const [{ rows }, term] = await Promise.all([
    purchaseRows(db, request),
    currentWindow(db, request.organizationId),
  ]);
  const lines = await linesOf(db, {
    organizationId: request.organizationId,
    saleIds: rows.map((row) => row.id),
  });
  return summarise(
    rows.map((row) => toPortalSale(row, lines.get(row.id) ?? [])),
    term.rows[0]
  );
}

export async function placementOf(
  db: Database,
  request: { organizationId: string; studentId: string }
): Promise<StudentPlacement | undefined> {
  const { rows } = await sql<{
    campus_id: string;
    level_id: string | null;
    level_name: string | null;
  }>`
    SELECT ${currentCampusSql('st')} AS campus_id,
      cl.id AS level_id, cl.name AS level_name
    FROM student st
    LEFT JOIN LATERAL (
      SELECT e.class_level_id
      FROM student_enrollment e
      JOIN academic_session a ON a.id = e.session_id AND a.organization_id = e.organization_id
      WHERE e.student_id = st.id AND e.organization_id = st.organization_id
      ORDER BY a.starts_on DESC
      LIMIT 1
    ) latest ON TRUE
    LEFT JOIN class_level cl
      ON cl.id = latest.class_level_id AND cl.organization_id = st.organization_id
    WHERE st.id = ${request.studentId} AND st.organization_id = ${request.organizationId}`.execute(
    db
  );
  const row = rows[0];
  return (
    row && {
      campusId: row.campus_id,
      levelId: row.level_id,
      levelName: row.level_name,
    }
  );
}

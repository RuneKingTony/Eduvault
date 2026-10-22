import { sql } from 'kysely';
import {
  adjustmentKindSchema,
  approvalStatusSchema,
  type Adjustment,
  type AdjustmentListQuery,
} from '@eduvault/api-contract';
import {
  FORMER_MEMBER_NAME,
  countWaiting,
  type WaitingApproval,
} from '../../common/approvals';
import { iso } from '../../common/db/rows';
import type { Database } from '../../common/db/tokens';
import { currentCampusSql, inScope } from '../../common/students';
import type { AdjustmentPage } from './adjustment.repository';
import type { OrgScope } from '../../common/scope';

interface AdjustmentRow {
  id: string;
  number: string;
  kind: string;
  amount_minor: string;
  reason: string;
  status: string;
  created_by_name: string | null;
  approved_by_name: string | null;
  rejection_reason: string | null;
  created_at: Date;
  ledger_account_id: string | null;
  money_account_id: string | null;
  invoice_id: string | null;
  journal_entry_id: string | null;
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
}

const COLUMNS = sql`
  a.id, a.number, a.kind, a.amount_minor::text AS amount_minor, a.reason, a.status,
  cu.name AS created_by_name, au.name AS approved_by_name, a.rejection_reason,
  a.created_at, a.ledger_account_id, a.money_account_id, a.invoice_id,
  a.journal_entry_id, st.id AS student_id, st.first_name, st.last_name,
  st.admission_number`;

const JOINS = sql`
  FROM adjustment a
  JOIN student st ON st.id = a.student_id AND st.organization_id = a.organization_id
  LEFT JOIN "user" cu ON cu.id = a.created_by
  LEFT JOIN "user" au ON au.id = a.approved_by`;

const visible = (scope: OrgScope) =>
  sql`a.organization_id = ${scope.organizationId}
    AND ${inScope(currentCampusSql('st'), scope.campusScope)}`;

const toAdjustment = (row: AdjustmentRow): Adjustment => ({
  id: row.id,
  number: row.number,
  kind: adjustmentKindSchema.parse(row.kind),
  student: {
    id: row.student_id,
    name: `${row.first_name} ${row.last_name}`,
    admissionNumber: row.admission_number,
  },
  amountMinor: Number(row.amount_minor),
  reason: row.reason,
  status: approvalStatusSchema.parse(row.status),
  createdBy: row.created_by_name,
  createdAt: iso(row.created_at),
  approvedBy: row.approved_by_name,
  rejectionReason: row.rejection_reason,
  ledgerAccountId: row.ledger_account_id,
  moneyAccountId: row.money_account_id,
  invoiceId: row.invoice_id,
  journalEntryId: row.journal_entry_id,
});

export async function findAdjustment(
  db: Database,
  scope: OrgScope,
  id: string
): Promise<Adjustment | undefined> {
  const { rows } = await sql<AdjustmentRow>`
    SELECT ${COLUMNS} ${JOINS}
    WHERE a.id = ${id} AND ${visible(scope)}`.execute(db);
  return rows[0] && toAdjustment(rows[0]);
}

function filtersOf(query: AdjustmentListQuery) {
  return sql.join(
    [
      query.status === undefined ? sql`TRUE` : sql`a.status = ${query.status}`,
      query.kind === undefined ? sql`TRUE` : sql`a.kind = ${query.kind}`,
      query.studentId === undefined
        ? sql`TRUE`
        : sql`a.student_id = ${query.studentId}`,
    ],
    sql` AND `
  );
}

export async function listAdjustments(
  db: Database,
  scope: OrgScope,
  query: AdjustmentListQuery
): Promise<AdjustmentPage> {
  const [{ rows }, waitingCount] = await Promise.all([
    sql<AdjustmentRow & { total_rows: number }>`
      SELECT ${COLUMNS}, (count(*) OVER ())::int AS total_rows ${JOINS}
      WHERE ${visible(scope)} AND ${filtersOf(query)}
      ORDER BY a.created_at DESC, a.id
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`.execute(
      db
    ),
    countWaiting(
      db,
      sql`${JOINS} WHERE ${visible(scope)} AND a.status = 'submitted'`
    ),
  ]);
  return {
    items: rows.map((row) => toAdjustment(row)),
    total: rows[0]?.total_rows ?? 0,
    waitingCount,
  };
}

export async function waitingAdjustments(
  db: Database,
  scope: OrgScope
): Promise<WaitingApproval[]> {
  const { rows } = await sql<
    AdjustmentRow & { created_by: string | null; campus_id: string }
  >`
    SELECT ${COLUMNS}, a.created_by, ${currentCampusSql('st')} AS campus_id ${JOINS}
    WHERE ${visible(scope)} AND a.status = 'submitted'
    ORDER BY a.created_at, a.id`.execute(db);
  return rows.map((row) => ({
    kind: adjustmentKindSchema.parse(row.kind),
    id: row.id,
    details: `${row.first_name} ${row.last_name}: ${row.reason}`,
    amountMinor: Number(row.amount_minor),
    amountText: null,
    createdById: row.created_by,
    createdByName: row.created_by_name ?? FORMER_MEMBER_NAME,
    createdAt: iso(row.created_at),
    campusId: row.campus_id,
  }));
}

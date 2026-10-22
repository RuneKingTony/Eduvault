import { sql, type RawBuilder } from 'kysely';
import {
  approvalStatusSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  type Payment,
  type PaymentAllocation,
  type PaymentAllocationSummary,
  type PaymentListQuery,
  type PaymentListSummary,
  type PaymentSummary,
} from '@eduvault/api-contract';
import { escapeLike } from '../../common/db/escape-like';
import { iso } from '../../common/db/rows';
import type { Database } from '../../common/db/tokens';
import { receivableBalanceSql } from '../../common/ledger';
import {
  currentCampusSql,
  inScope,
  studentClassNameSql,
  anyAllocationInScopeSql,
} from '../../common/students';
import type { PaymentPage } from './payment.repository';
import type { OrgScope } from '../../common/scope';

const labelOf = (name: string, last4: string | null): string =>
  last4 === null ? name : `${name} · ending ${last4}`;

function listFilters(
  scope: OrgScope,
  query: Pick<PaymentListQuery, 'q' | 'status'>
): RawBuilder<unknown> {
  const parts: RawBuilder<unknown>[] = [
    sql`p.organization_id = ${scope.organizationId}`,
    anyAllocationInScopeSql('p', scope.campusScope),
  ];
  if (query.status !== undefined) {
    parts.push(sql`p.status = ${query.status}`);
  }
  if (query.q !== undefined && query.q !== '') {
    const pattern = `%${escapeLike(query.q)}%`;
    parts.push(
      sql`(p.receipt_number ILIKE ${pattern}
        OR p.payer_name ILIKE ${pattern}
        OR p.reference ILIKE ${pattern}
        OR EXISTS (
          SELECT 1 FROM payment_allocation sa
          JOIN student ss ON ss.id = sa.student_id AND ss.organization_id = sa.organization_id
          WHERE sa.payment_id = p.id AND sa.organization_id = p.organization_id
            AND (ss.first_name || ' ' || ss.last_name) ILIKE ${pattern}))`
    );
  }
  return sql.join(parts, sql` AND `);
}

interface SummaryRow {
  id: string;
  receipt_number: string;
  reference: string;
  paid_on: string;
  method: string;
  payer_name: string;
  account_id: string;
  account_name: string;
  account_last4: string | null;
  amount_minor: string;
  status: string;
  total_rows: number;
}

interface AllocationSummaryRow {
  payment_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  amount_minor: string;
  in_scope: boolean;
}

const toAllocationSummary = (
  row: AllocationSummaryRow
): PaymentAllocationSummary => ({
  studentId: row.student_id,
  studentName: `${row.first_name} ${row.last_name}`,
  amountMinor: Number(row.amount_minor),
  inScope: row.in_scope,
});

const toSummary = (
  row: SummaryRow,
  allocations: PaymentAllocationSummary[]
): PaymentSummary => ({
  id: row.id,
  receiptNumber: row.receipt_number,
  reference: row.reference,
  paidOn: row.paid_on,
  method: paymentMethodSchema.parse(row.method),
  payerName: row.payer_name,
  moneyAccount: {
    id: row.account_id,
    label: labelOf(row.account_name, row.account_last4),
  },
  amountMinor: Number(row.amount_minor),
  status: paymentStatusSchema.parse(row.status),
  allocations,
});

async function listSummary(
  db: Database,
  scope: OrgScope
): Promise<PaymentListSummary> {
  const { rows } = await sql<{
    receipts: number;
    received: string;
    waiting: number;
  }>`
    SELECT
      (count(DISTINCT p.id) FILTER (WHERE p.status <> 'voided'))::int AS receipts,
      COALESCE(sum(pa.amount_minor) FILTER (WHERE p.status <> 'voided'), 0)::text AS received,
      (count(DISTINCT p.id) FILTER (WHERE p.status = 'void_pending'))::int AS waiting
    FROM payment p
    JOIN payment_allocation pa
      ON pa.payment_id = p.id AND pa.organization_id = p.organization_id
    JOIN student st ON st.id = pa.student_id AND st.organization_id = pa.organization_id
    WHERE p.organization_id = ${scope.organizationId}
      AND ${inScope(currentCampusSql('st'), scope.campusScope)}`.execute(db);
  const row = rows[0];
  return {
    receiptCount: row?.receipts ?? 0,
    receivedMinor: Number(row?.received ?? 0),
    cancellationsWaiting: row?.waiting ?? 0,
  };
}

async function allocationsOf(
  db: Database,
  scope: OrgScope,
  paymentIds: readonly string[]
): Promise<Map<string, PaymentAllocationSummary[]>> {
  const grouped = new Map<string, PaymentAllocationSummary[]>();
  if (paymentIds.length === 0) {
    return grouped;
  }
  const { rows } = await sql<AllocationSummaryRow>`
    SELECT pa.payment_id, pa.student_id, st.first_name, st.last_name,
      pa.amount_minor::text AS amount_minor,
      ${inScope(currentCampusSql('st'), scope.campusScope)} AS in_scope
    FROM payment_allocation pa
    JOIN student st ON st.id = pa.student_id AND st.organization_id = pa.organization_id
    WHERE pa.organization_id = ${scope.organizationId}
      AND pa.payment_id IN (${sql.join(paymentIds)})
    ORDER BY st.first_name, st.last_name, st.id`.execute(db);
  for (const row of rows) {
    const list = grouped.get(row.payment_id) ?? [];
    list.push(toAllocationSummary(row));
    grouped.set(row.payment_id, list);
  }
  return grouped;
}

export async function listPayments(
  db: Database,
  scope: OrgScope,
  query: PaymentListQuery
): Promise<PaymentPage> {
  const { rows } = await sql<SummaryRow>`
    SELECT p.id, p.receipt_number, p.reference,
      to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on,
      p.method, p.payer_name,
      ma.id AS account_id, ma.name AS account_name, ma.account_last4,
      p.amount_minor::text AS amount_minor, p.status,
      (count(*) OVER ())::int AS total_rows
    FROM payment p
    JOIN money_account ma
      ON ma.id = p.money_account_id AND ma.organization_id = p.organization_id
    WHERE ${listFilters(scope, query)}
    ORDER BY p.paid_on DESC, p.created_at DESC, p.id
    LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`.execute(
    db
  );
  const [allocations, summary] = await Promise.all([
    allocationsOf(
      db,
      scope,
      rows.map((row) => row.id)
    ),
    listSummary(db, scope),
  ]);
  return {
    items: rows.map((row) => toSummary(row, allocations.get(row.id) ?? [])),
    total: rows[0]?.total_rows ?? 0,
    summary,
  };
}

interface DetailRow {
  id: string;
  receipt_number: string;
  reference: string;
  provider_reference: string | null;
  paid_on: string;
  method: string;
  status: string;
  payer_name: string;
  payer_guardian_id: string | null;
  account_id: string;
  account_name: string;
  account_last4: string | null;
  amount_minor: string;
  recorded_by: string | null;
  created_at: Date;
  proof_file_id: string | null;
  proof_name: string | null;
  entry_reference: string;
  journal_entry_id: string;
  sale_id: string | null;
  sale_number: string | null;
}

interface AllocationRow {
  student_id: string;
  first_name: string;
  last_name: string;
  class_name: string | null;
  amount_minor: string;
  in_scope: boolean;
  balance: string | null;
}

interface JournalRow {
  account_code: number;
  account_name: string;
  first_name: string | null;
  last_name: string | null;
  campus_name: string | null;
  debit_minor: string;
  credit_minor: string;
}

const toAllocation = (row: AllocationRow): PaymentAllocation => ({
  studentId: row.student_id,
  studentName: `${row.first_name} ${row.last_name}`,
  className: row.class_name,
  amountMinor: Number(row.amount_minor),
  inScope: row.in_scope,
  balanceMinor: row.balance === null ? null : Number(row.balance),
});

async function allocationDetail(
  db: Database,
  scope: OrgScope,
  paymentId: string
): Promise<PaymentAllocation[]> {
  const inside = inScope(currentCampusSql('st'), scope.campusScope);
  const { rows } = await sql<AllocationRow>`
    SELECT pa.student_id, st.first_name, st.last_name,
      CASE WHEN ${inside} THEN ${studentClassNameSql('st')} END AS class_name,
      pa.amount_minor::text AS amount_minor,
      ${inside} AS in_scope,
      CASE WHEN ${inside} THEN (${receivableBalanceSql('st')})::text END AS balance
    FROM payment_allocation pa
    JOIN student st ON st.id = pa.student_id AND st.organization_id = pa.organization_id
    WHERE pa.payment_id = ${paymentId} AND pa.organization_id = ${scope.organizationId}
    ORDER BY st.first_name, st.last_name, st.id`.execute(db);
  return rows.map((row) => toAllocation(row));
}

async function entryOf(
  db: Database,
  scope: OrgScope,
  row: Pick<DetailRow, 'entry_reference' | 'journal_entry_id'>
): Promise<NonNullable<Payment['entry']>> {
  const { rows } = await sql<JournalRow>`
    SELECT la.code AS account_code, la.name AS account_name,
      st.first_name, st.last_name, camp.name AS campus_name,
      jl.debit_minor::text AS debit_minor, jl.credit_minor::text AS credit_minor
    FROM journal_line jl
    JOIN ledger_account la ON la.id = jl.ledger_account_id AND la.organization_id = jl.organization_id
    LEFT JOIN student st ON st.id = jl.student_id AND st.organization_id = jl.organization_id
    LEFT JOIN team camp ON camp.id = jl.campus_id
    WHERE jl.entry_id = ${row.journal_entry_id} AND jl.organization_id = ${scope.organizationId}
    ORDER BY (jl.debit_minor = 0), la.code, jl.debit_minor DESC, jl.credit_minor DESC`.execute(
    db
  );
  const lines = rows.map((line) => ({
    accountCode: line.account_code,
    accountName: line.account_name,
    studentName:
      line.first_name === null ? null : `${line.first_name} ${line.last_name}`,
    campusName: line.campus_name,
    debitMinor: Number(line.debit_minor),
    creditMinor: Number(line.credit_minor),
  }));
  const debits = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const credits = lines.reduce((sum, line) => sum + line.creditMinor, 0);
  return {
    reference: row.entry_reference,
    lines,
    balanced: debits === credits,
  };
}

interface VoidDetailRow {
  id: string;
  status: string;
  reason: string;
  created_by_name: string | null;
  approved_by_name: string | null;
  rejection_reason: string | null;
  journal_entry_id: string | null;
  entry_reference: string | null;
}

async function voidDetail(
  db: Database,
  scope: OrgScope,
  paymentId: string
): Promise<{ void: Payment['void']; voidEntry: Payment['voidEntry'] }> {
  const { rows } = await sql<VoidDetailRow>`
    SELECT v.id, v.status, v.reason, cu.name AS created_by_name,
      au.name AS approved_by_name, v.rejection_reason, v.journal_entry_id,
      je.reference AS entry_reference
    FROM payment_void v
    LEFT JOIN "user" cu ON cu.id = v.created_by
    LEFT JOIN "user" au ON au.id = v.approved_by
    LEFT JOIN journal_entry je
      ON je.id = v.journal_entry_id AND je.organization_id = v.organization_id
    WHERE v.payment_id = ${paymentId} AND v.organization_id = ${scope.organizationId}
    ORDER BY v.created_at DESC, v.id
    LIMIT 1`.execute(db);
  const row = rows[0];
  if (row === undefined) {
    return { void: null, voidEntry: null };
  }
  const voidEntry =
    row.journal_entry_id === null || row.entry_reference === null
      ? null
      : await entryOf(db, scope, {
          entry_reference: row.entry_reference,
          journal_entry_id: row.journal_entry_id,
        });
  return {
    void: {
      id: row.id,
      status: approvalStatusSchema.parse(row.status),
      reason: row.reason,
      createdBy: row.created_by_name,
      approvedBy: row.approved_by_name,
      rejectionReason: row.rejection_reason,
    },
    voidEntry,
  };
}

function toPayment(
  row: DetailRow,
  allocations: PaymentAllocation[],
  entry: NonNullable<Payment['entry']>
): Omit<Payment, 'currency'> {
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    reference: row.reference,
    providerReference: row.provider_reference,
    paidOn: row.paid_on,
    method: paymentMethodSchema.parse(row.method),
    status: paymentStatusSchema.parse(row.status),
    payerName: row.payer_name,
    payerGuardianId: row.payer_guardian_id,
    moneyAccount: {
      id: row.account_id,
      label: labelOf(row.account_name, row.account_last4),
    },
    amountMinor: Number(row.amount_minor),
    recordedBy: row.recorded_by,
    recordedAt: iso(row.created_at),
    proof:
      row.proof_file_id === null || row.proof_name === null
        ? null
        : { fileId: row.proof_file_id, fileName: row.proof_name },
    allocations,
    void: null,
    storeSale:
      row.sale_id === null || row.sale_number === null
        ? null
        : { id: row.sale_id, number: row.sale_number },
    entry,
    voidEntry: null,
  };
}

export async function findPayment(
  db: Database,
  scope: OrgScope,
  id: string
): Promise<Omit<Payment, 'currency'> | undefined> {
  const { rows } = await sql<DetailRow>`
    SELECT p.id, p.receipt_number, p.reference, p.provider_reference,
      to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on,
      p.method, p.status, p.payer_name, p.payer_guardian_id,
      ma.id AS account_id, ma.name AS account_name, ma.account_last4,
      p.amount_minor::text AS amount_minor,
      u.name AS recorded_by, p.created_at,
      p.proof_file_id, fo.original_name AS proof_name,
      je.reference AS entry_reference, p.journal_entry_id,
      ss.id AS sale_id, ss.number AS sale_number
    FROM payment p
    JOIN money_account ma
      ON ma.id = p.money_account_id AND ma.organization_id = p.organization_id
    JOIN journal_entry je
      ON je.id = p.journal_entry_id AND je.organization_id = p.organization_id
    LEFT JOIN "user" u ON u.id = p.created_by
    LEFT JOIN file_object fo
      ON fo.id = p.proof_file_id AND fo.organization_id = p.organization_id
    LEFT JOIN store_sale ss
      ON ss.payment_id = p.id AND ss.organization_id = p.organization_id
    WHERE p.id = ${id}
      AND p.organization_id = ${scope.organizationId}
      AND ${anyAllocationInScopeSql('p', scope.campusScope)}`.execute(db);
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  const [allocations, entry, cancellation] = await Promise.all([
    allocationDetail(db, scope, id),
    entryOf(db, scope, row),
    voidDetail(db, scope, id),
  ]);
  return { ...toPayment(row, allocations, entry), ...cancellation };
}

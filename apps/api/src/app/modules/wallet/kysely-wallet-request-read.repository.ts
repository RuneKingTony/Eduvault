import { sql, type Kysely, type RawBuilder } from 'kysely';
import {
  approvalStatusSchema,
  walletRequestSchema,
  type WalletApprovalKind,
  type WalletRequest,
  type WalletRequestListQuery,
} from '@eduvault/api-contract';
import type { DB } from '../../../db/db-types';
import {
  FORMER_MEMBER_NAME,
  countWaiting,
  type WaitingApproval,
} from '../../common/approvals';
import { iso, isoOrNull } from '../../common/db/rows';
import type { OrgScope } from '../../common/scope';
import {
  anyChildInScopeSql,
  currentCampusSql,
  inScope,
} from '../../common/students';
import type { RequestPage, RequestRecord } from './wallet.repository';

interface RequestRow {
  kind: WalletApprovalKind;
  id: string;
  status: string;
  reference: string;
  reason: string;
  amount_minor: string;
  wallet_id: string;
  guardian_id: string;
  organization_id: string;
  guardian_name: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  rejection_reason: string | null;
  parent_email: string | null;
  money_account_name: string | null;
  payout_reference: string | null;
  proof_file_id: string | null;
  topup_id: string | null;
  topup_reference: string | null;
}

const refundRequests = (scope: OrgScope): RawBuilder<unknown> => sql`
  SELECT 'wallet_refund' AS kind, r.id, r.status, r.reference, r.reason,
    r.amount_minor::text AS amount_minor, w.id AS wallet_id, w.guardian_id,
    w.organization_id, g.full_name AS guardian_name, r.created_by,
    cu.name AS created_by_name, r.created_at, COALESCE(au.name, ru.name) AS decided_by,
    COALESCE(r.approved_at, r.rejected_at) AS decided_at, r.rejection_reason,
    r.parent_email, ma.name AS money_account_name, r.payout_reference,
    r.proof_file_id, NULL::uuid AS topup_id, NULL::text AS topup_reference
  FROM wallet_refund r
  JOIN wallet w ON w.id = r.wallet_id AND w.organization_id = r.organization_id
  JOIN guardian g ON g.id = w.guardian_id AND g.organization_id = w.organization_id
  JOIN money_account ma ON ma.id = r.money_account_id AND ma.organization_id = r.organization_id
  LEFT JOIN "user" cu ON cu.id = r.created_by
  LEFT JOIN "user" au ON au.id = r.approved_by
  LEFT JOIN "user" ru ON ru.id = r.rejected_by
  WHERE r.organization_id = ${scope.organizationId}
    AND ${anyChildInScopeSql('w', scope.campusScope)}`;

const cancellationRequests = (scope: OrgScope): RawBuilder<unknown> => sql`
  SELECT 'wallet_topup_cancellation' AS kind, c.id, c.status, c.reference, c.reason,
    t.amount_minor::text AS amount_minor, w.id AS wallet_id, w.guardian_id,
    w.organization_id, g.full_name AS guardian_name, c.created_by,
    cu.name AS created_by_name, c.created_at, COALESCE(au.name, ru.name) AS decided_by,
    COALESCE(c.approved_at, c.rejected_at) AS decided_at, c.rejection_reason,
    NULL::text AS parent_email, NULL::text AS money_account_name,
    NULL::text AS payout_reference, NULL::uuid AS proof_file_id,
    t.id AS topup_id, t.reference AS topup_reference
  FROM wallet_topup_cancellation c
  JOIN wallet_topup t ON t.id = c.wallet_topup_id AND t.organization_id = c.organization_id
  JOIN wallet w ON w.id = t.wallet_id AND w.organization_id = t.organization_id
  JOIN guardian g ON g.id = w.guardian_id AND g.organization_id = w.organization_id
  LEFT JOIN "user" cu ON cu.id = c.created_by
  LEFT JOIN "user" au ON au.id = c.approved_by
  LEFT JOIN "user" ru ON ru.id = c.rejected_by
  WHERE c.organization_id = ${scope.organizationId}
    AND ${anyChildInScopeSql('w', scope.campusScope)}`;

const visibleRequests = (scope: OrgScope): RawBuilder<unknown> => sql`(
  ${refundRequests(scope)} UNION ALL ${cancellationRequests(scope)}
) q`;

function toRequest(row: RequestRow): WalletRequest {
  return walletRequestSchema.parse({
    kind: row.kind,
    id: row.id,
    status: row.status,
    reference: row.reference,
    reason: row.reason,
    amountMinor: Number(row.amount_minor),
    wallet: { id: row.wallet_id, guardianName: row.guardian_name },
    createdBy: row.created_by_name,
    createdAt: iso(row.created_at),
    decidedBy: row.decided_by,
    decidedAt: isoOrNull(row.decided_at),
    rejectionReason: row.rejection_reason,
    parentEmail: row.parent_email,
    moneyAccountName: row.money_account_name,
    payoutReference: row.payout_reference,
    proofFileId: row.proof_file_id,
    topUp: { id: row.topup_id, reference: row.topup_reference },
  });
}

export async function findRequest(
  db: Kysely<DB>,
  scope: OrgScope,
  target: { kind: WalletApprovalKind; id: string }
): Promise<WalletRequest | undefined> {
  const { rows } = await sql<RequestRow>`
    SELECT q.* FROM ${visibleRequests(scope)}
    WHERE q.kind = ${target.kind} AND q.id = ${target.id}`.execute(db);
  return rows[0] && toRequest(rows[0]);
}

export async function requestRecord(
  db: Kysely<DB>,
  scope: OrgScope,
  target: { kind: WalletApprovalKind; id: string }
): Promise<RequestRecord | undefined> {
  const { rows } = await sql<{ status: string; created_by: string | null }>`
    SELECT q.status, q.created_by FROM ${visibleRequests(scope)}
    WHERE q.kind = ${target.kind} AND q.id = ${target.id}`.execute(db);
  const [row] = rows;
  return (
    row && {
      status: approvalStatusSchema.parse(row.status),
      createdBy: row.created_by,
    }
  );
}

export async function listRequests(
  db: Kysely<DB>,
  scope: OrgScope,
  query: WalletRequestListQuery
): Promise<RequestPage> {
  const kind =
    query.kind === undefined ? sql`TRUE` : sql`q.kind = ${query.kind}`;
  const status =
    query.status === undefined ? sql`TRUE` : sql`q.status = ${query.status}`;
  const [{ rows }, waitingCount] = await Promise.all([
    sql<RequestRow & { total_rows: number }>`
      SELECT q.*, (count(*) OVER ())::int AS total_rows
      FROM ${visibleRequests(scope)}
      WHERE ${kind} AND ${status}
      ORDER BY q.created_at DESC, q.id
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`.execute(
      db
    ),
    countWaiting(
      db,
      sql`FROM ${visibleRequests(scope)} WHERE q.status = 'submitted'`
    ),
  ]);
  return {
    items: rows.map((row) => toRequest(row)),
    total: rows[0]?.total_rows ?? 0,
    waitingCount,
  };
}

const detailsOf = (row: RequestRow): string =>
  row.kind === 'wallet_refund'
    ? `Refund to ${row.guardian_name}: ${row.reason}`
    : `Top-up ${row.topup_reference ?? ''} of ${row.guardian_name}: ${row.reason}`;

export async function waitingRequests(
  db: Kysely<DB>,
  scope: OrgScope
): Promise<WaitingApproval[]> {
  const { rows } = await sql<RequestRow & { campus_id: string | null }>`
    SELECT q.*, (
      SELECT ${currentCampusSql('fs')}
      FROM guardian_student fg
      JOIN student fs ON fs.id = fg.student_id AND fs.organization_id = fg.organization_id
      WHERE fg.guardian_id = q.guardian_id AND fg.organization_id = q.organization_id
        AND ${inScope(currentCampusSql('fs'), scope.campusScope)}
      ORDER BY fs.first_name, fs.last_name, fs.id
      LIMIT 1
    ) AS campus_id
    FROM ${visibleRequests(scope)}
    WHERE q.status = 'submitted'
    ORDER BY q.created_at, q.id`.execute(db);
  return rows.map((row) => ({
    kind: row.kind,
    id: row.id,
    details: detailsOf(row),
    amountMinor: Number(row.amount_minor),
    amountText: null,
    createdById: row.created_by,
    createdByName: row.created_by_name ?? FORMER_MEMBER_NAME,
    createdAt: iso(row.created_at),
    campusId: row.campus_id,
  }));
}

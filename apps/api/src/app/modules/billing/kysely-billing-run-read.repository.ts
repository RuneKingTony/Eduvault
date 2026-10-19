import { sql } from 'kysely';
import {
  billingRunStatusSchema,
  billingScopeSchema,
  type BillingRunListQuery,
  type BillingRunSummary,
} from '@eduvault/api-contract';
import { iso } from '../../common/db/rows';
import type { Database } from '../../common/db/tokens';
import { invoiceTotalSql } from '../../common/fees';
import { currentCampusSql, inScope } from '../../common/students';
import { scopeLabel } from './billing-round';
import type { BillingScope } from './billing-scope';
import type { RunHeader, RunPage } from './billing-run.repository';

interface RunRow {
  id: string;
  number: string;
  term_id: string;
  scope: string;
  status: string;
  term_name: string;
  school_year_name: string;
  campus_name: string | null;
  level_name: string | null;
  created_by_name: string | null;
  issued_by_name: string | null;
  cancelled_by_name: string | null;
  created_at: Date;
  issued_at: Date | null;
  cancelled_at: Date | null;
  charge_count: number;
  sent_count: number;
  total_minor: string;
  fees_changed: boolean;
  total_rows: number;
}

const termLabel = (row: Pick<RunRow, 'term_name' | 'school_year_name'>) =>
  `${row.term_name}, ${row.school_year_name}`;

const toSummary = (row: RunRow): BillingRunSummary => {
  const scope = billingScopeSchema.parse(row.scope);
  return {
    id: row.id,
    number: row.number,
    termId: row.term_id,
    termName: termLabel(row),
    scope,
    scopeLabel: scopeLabel(scope, row.campus_name ?? row.level_name),
    chargeCount: row.charge_count,
    totalMinor: Number(row.total_minor),
    createdBy: row.created_by_name,
    issuedAt: row.issued_at === null ? null : iso(row.issued_at),
    status: billingRunStatusSchema.parse(row.status),
  };
};

const toHeader = (row: RunRow): RunHeader => ({
  ...toSummary(row),
  createdAt: iso(row.created_at),
  issuedBy: row.issued_by_name,
  cancelledBy: row.cancelled_by_name,
  cancelledAt: row.cancelled_at === null ? null : iso(row.cancelled_at),
  sentCount: row.sent_count,
  feesChangedSincePrepared: row.fees_changed,
});

function chargeTotals(scope: BillingScope) {
  return sql`
    CROSS JOIN LATERAL (
      SELECT
        count(*)::int AS charge_count,
        (count(*) FILTER (WHERE c.status = 'issued'))::int AS sent_count,
        COALESCE(sum(c.total_minor), 0)::text AS total_minor
      FROM (
        SELECT
          i.status,
          ${invoiceTotalSql('i')} AS total_minor
        FROM invoice i
        JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
        WHERE i.billing_run_id = br.id
          AND i.organization_id = br.organization_id
          AND ${inScope(currentCampusSql('st'), scope.campusScope)}
      ) c
    ) agg`;
}

function runRows(
  scope: BillingScope,
  options: {
    id?: string;
    status?: string;
    limit?: { page: number; pageSize: number };
  }
) {
  const only =
    options.id === undefined ? sql`` : sql`AND br.id = ${options.id}`;
  const byStatus =
    options.status === undefined
      ? sql``
      : sql`AND br.status = ${options.status}`;
  const limit =
    options.limit === undefined
      ? sql``
      : sql`LIMIT ${options.limit.pageSize} OFFSET ${(options.limit.page - 1) * options.limit.pageSize}`;
  return sql<RunRow>`
    SELECT
      br.id, br.number, br.term_id, br.scope, br.status,
      t.name AS term_name, sy.name AS school_year_name,
      camp.name AS campus_name, lvl.name AS level_name,
      creator.name AS created_by_name,
      issuer.name AS issued_by_name,
      canceller.name AS cancelled_by_name,
      br.created_at, br.issued_at, br.cancelled_at,
      agg.charge_count, agg.sent_count, agg.total_minor,
      (br.status = 'draft' AND EXISTS (
        SELECT 1 FROM fee_line f
        WHERE f.organization_id = br.organization_id
          AND f.term_id = br.term_id
          AND GREATEST(f.created_at, f.updated_at, COALESCE(f.retired_at, f.created_at)) > br.created_at
      )) AS fees_changed,
      (count(*) OVER ())::int AS total_rows
    FROM billing_run br
    JOIN term t ON t.id = br.term_id AND t.organization_id = br.organization_id
    JOIN academic_session sy ON sy.id = t.session_id AND sy.organization_id = t.organization_id
    LEFT JOIN team camp ON camp.id = br.scope_campus_id
    LEFT JOIN class_level lvl ON lvl.id = br.scope_class_level_id AND lvl.organization_id = br.organization_id
    LEFT JOIN "user" creator ON creator.id = br.created_by
    LEFT JOIN "user" issuer ON issuer.id = br.issued_by
    LEFT JOIN "user" canceller ON canceller.id = br.cancelled_by
    ${chargeTotals(scope)}
    WHERE br.organization_id = ${scope.organizationId}
      AND agg.charge_count > 0
      ${only}
      ${byStatus}
    ORDER BY br.created_at DESC, br.number DESC
    ${limit}`;
}

export async function listRuns(
  db: Database,
  scope: BillingScope,
  query: BillingRunListQuery
): Promise<RunPage> {
  const { rows } = await runRows(scope, {
    limit: query,
    status: query.status,
  }).execute(db);
  return {
    items: rows.map((row) => toSummary(row)),
    total: rows[0]?.total_rows ?? 0,
  };
}

export async function findRun(
  db: Database,
  scope: BillingScope,
  id: string
): Promise<RunHeader | undefined> {
  const { rows } = await runRows(scope, { id }).execute(db);
  const row = rows[0];
  return row && toHeader(row);
}

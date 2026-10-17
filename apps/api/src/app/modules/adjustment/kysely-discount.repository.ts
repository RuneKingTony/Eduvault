import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  approvalStatusSchema,
  discountKindSchema,
  type StudentDiscount,
  type StudentDiscountListQuery,
} from '@eduvault/api-contract';
import { naira } from '@eduvault/shared';
import {
  FORMER_MEMBER_NAME,
  countWaiting,
  decisionsFor,
  isApprovalOn,
  type WaitingApproval,
} from '../../common/approvals';
import { iso, isoOrNull } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import type { TermPosition } from '../../common/fees';
import { feeTypeQuery, schoolCurrency } from '../../common/ledger';
import { currentCampusSql, inScope } from '../../common/students';
import type { AdjustmentScope } from './adjustment.repository';
import {
  DiscountRepository,
  type DiscountPage,
  type DiscountRecord,
  type TermChoice,
  type FeeTypeCheck,
  type NewDiscount,
  type TermInfo,
} from './discount.repository';

interface DiscountRow {
  id: string;
  kind: string;
  value: string;
  reason: string;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  created_at: Date;
  ended_at: Date | null;
  rejection_reason: string | null;
  ledger_account_id: string | null;
  fee_type_name: string | null;
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  from_term_id: string;
  from_term_name: string;
  from_session_name: string;
  from_starts_on: string;
  from_sequence: number;
  to_term_id: string | null;
  to_term_name: string | null;
  to_session_name: string | null;
  to_starts_on: string | null;
  to_sequence: number | null;
}

const COLUMNS = sql`
  d.id, d.kind, d.value::text AS value, d.reason, d.status, d.created_by,
  cu.name AS created_by_name, au.name AS approved_by_name, d.created_at,
  d.ended_at, d.rejection_reason, d.ledger_account_id, fee.name AS fee_type_name,
  st.id AS student_id, st.first_name, st.last_name, st.admission_number,
  ft.id AS from_term_id, ft.name AS from_term_name, fs.name AS from_session_name,
  to_char(fs.starts_on, 'YYYY-MM-DD') AS from_starts_on, ft.sequence AS from_sequence,
  tt.id AS to_term_id, tt.name AS to_term_name, ts.name AS to_session_name,
  to_char(ts.starts_on, 'YYYY-MM-DD') AS to_starts_on, tt.sequence AS to_sequence`;

const JOINS = sql`
  FROM student_discount d
  JOIN student st ON st.id = d.student_id AND st.organization_id = d.organization_id
  JOIN term ft ON ft.id = d.from_term_id AND ft.organization_id = d.organization_id
  JOIN academic_session fs ON fs.id = ft.session_id AND fs.organization_id = ft.organization_id
  LEFT JOIN term tt ON tt.id = d.to_term_id AND tt.organization_id = d.organization_id
  LEFT JOIN academic_session ts ON ts.id = tt.session_id AND ts.organization_id = tt.organization_id
  LEFT JOIN ledger_account fee ON fee.id = d.ledger_account_id AND fee.organization_id = d.organization_id
  LEFT JOIN "user" cu ON cu.id = d.created_by
  LEFT JOIN "user" au ON au.id = d.approved_by`;

const visible = (scope: AdjustmentScope) =>
  sql`d.organization_id = ${scope.organizationId}
    AND ${inScope(currentCampusSql('st'), scope.campusScope)}`;

const termLabel = (term: string, session: string): string =>
  `${term}, ${session}`;

function toDiscount(row: DiscountRow): StudentDiscount {
  return {
    id: row.id,
    student: {
      id: row.student_id,
      name: `${row.first_name} ${row.last_name}`,
      admissionNumber: row.admission_number,
    },
    kind: discountKindSchema.parse(row.kind),
    value: Number(row.value),
    feeType:
      row.ledger_account_id === null || row.fee_type_name === null
        ? null
        : { id: row.ledger_account_id, name: row.fee_type_name },
    reason: row.reason,
    fromTerm: {
      id: row.from_term_id,
      name: termLabel(row.from_term_name, row.from_session_name),
    },
    toTerm:
      row.to_term_id === null ||
      row.to_term_name === null ||
      row.to_session_name === null
        ? null
        : {
            id: row.to_term_id,
            name: termLabel(row.to_term_name, row.to_session_name),
          },
    status: approvalStatusSchema.parse(row.status),
    createdBy: row.created_by_name,
    createdAt: iso(row.created_at),
    approvedBy: row.approved_by_name,
    rejectionReason: row.rejection_reason,
    endedAt: isoOrNull(row.ended_at),
  };
}

const untilOf = (row: DiscountRow): TermPosition | null =>
  row.to_starts_on === null || row.to_sequence === null
    ? null
    : { sessionStartsOn: row.to_starts_on, sequence: row.to_sequence };

const valueText = (kind: string, value: string): string =>
  kind === 'percent' ? `${value}%` : naira(Number(value));

interface TermRow {
  id: string;
  name: string;
  session_name: string;
  starts_on: string;
  sequence: number;
}

const toTermInfo = (row: TermRow): TermInfo => ({
  id: row.id,
  name: termLabel(row.name, row.session_name),
  position: { sessionStartsOn: row.starts_on, sequence: row.sequence },
});

@Injectable()
export class KyselyDiscountRepository extends DiscountRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  approvalOn(organizationId: string): Promise<boolean> {
    return isApprovalOn(this.db, organizationId, 'discount');
  }

  async studentInScope(
    scope: AdjustmentScope,
    studentId: string
  ): Promise<boolean> {
    const { rows } = await sql<{ id: string }>`
      SELECT st.id FROM student st
      WHERE st.id = ${studentId} AND st.organization_id = ${scope.organizationId}
        AND ${inScope(currentCampusSql('st'), scope.campusScope)}`.execute(
      this.db
    );
    return rows.length > 0;
  }

  private async termWhere(
    organizationId: string,
    condition: ReturnType<typeof sql>
  ): Promise<TermInfo | undefined> {
    const { rows } = await sql<TermRow>`
      SELECT t.id, t.name, s.name AS session_name,
        to_char(s.starts_on, 'YYYY-MM-DD') AS starts_on, t.sequence
      FROM term t
      JOIN academic_session s ON s.id = t.session_id AND s.organization_id = t.organization_id
      WHERE t.organization_id = ${organizationId} AND ${condition}
      LIMIT 1`.execute(this.db);
    return rows[0] && toTermInfo(rows[0]);
  }

  async termChoices(organizationId: string): Promise<TermChoice[]> {
    const { rows } = await sql<
      TermRow & { term_starts_on: string; is_current: boolean }
    >`
      SELECT t.id, t.name, s.name AS session_name,
        to_char(s.starts_on, 'YYYY-MM-DD') AS starts_on, t.sequence,
        to_char(t.starts_on, 'YYYY-MM-DD') AS term_starts_on, t.is_current
      FROM term t
      JOIN academic_session s ON s.id = t.session_id AND s.organization_id = t.organization_id
      WHERE t.organization_id = ${organizationId}
      ORDER BY t.starts_on, t.id`.execute(this.db);
    return rows.map((row) => ({
      id: row.id,
      label: termLabel(row.name, row.session_name),
      startsOn: row.term_starts_on,
      isCurrent: row.is_current,
    }));
  }

  currentTerm(organizationId: string): Promise<TermInfo | undefined> {
    return this.termWhere(organizationId, sql`t.is_current`);
  }

  term(organizationId: string, termId: string): Promise<TermInfo | undefined> {
    return this.termWhere(organizationId, sql`t.id = ${termId}`);
  }

  async feeType(
    organizationId: string,
    ledgerAccountId: string
  ): Promise<FeeTypeCheck> {
    const account = await this.db
      .selectFrom('ledger_account')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('id', '=', ledgerAccountId)
      .executeTakeFirst();
    if (account === undefined) {
      return 'missing';
    }
    const feeType = await feeTypeQuery(this.db, organizationId)
      .where('ledger_account.id', '=', ledgerAccountId)
      .executeTakeFirst();
    return feeType === undefined ? 'not_fee_type' : 'ok';
  }

  async insert(input: NewDiscount): Promise<string> {
    const row = await this.db
      .insertInto('student_discount')
      .values({
        organization_id: input.organizationId,
        student_id: input.studentId,
        kind: input.kind,
        value: input.value,
        ledger_account_id: input.ledgerAccountId,
        reason: input.reason,
        from_term_id: input.fromTermId,
        to_term_id: input.toTermId,
        status: input.autoApproved ? 'approved' : 'submitted',
        created_by: input.userId,
        approved_by: null,
        approved_at: input.autoApproved ? new Date() : null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async findById(
    scope: AdjustmentScope,
    id: string
  ): Promise<DiscountRecord | undefined> {
    const { rows } = await sql<DiscountRow>`
      SELECT ${COLUMNS} ${JOINS}
      WHERE d.id = ${id} AND ${visible(scope)}`.execute(this.db);
    const row = rows[0];
    return (
      row && {
        discount: toDiscount(row),
        createdById: row.created_by,
        status: approvalStatusSchema.parse(row.status),
        until: untilOf(row),
      }
    );
  }

  async list(
    scope: AdjustmentScope,
    query: StudentDiscountListQuery
  ): Promise<DiscountPage> {
    const status =
      query.status === undefined ? sql`TRUE` : sql`d.status = ${query.status}`;
    const student =
      query.studentId === undefined
        ? sql`TRUE`
        : sql`d.student_id = ${query.studentId}`;
    const [{ rows }, waitingCount] = await Promise.all([
      sql<DiscountRow & { total_rows: number }>`
        SELECT ${COLUMNS}, (count(*) OVER ())::int AS total_rows ${JOINS}
        WHERE ${visible(scope)} AND ${status} AND ${student}
        ORDER BY d.created_at DESC, d.id
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`.execute(
        this.db
      ),
      countWaiting(
        this.db,
        sql`${JOINS} WHERE ${visible(scope)} AND d.status = 'submitted'`
      ),
    ]);
    return {
      items: rows.map((row) => toDiscount(row)),
      total: rows[0]?.total_rows ?? 0,
      waitingCount,
    };
  }

  approve(
    scope: AdjustmentScope,
    id: string,
    userId: string
  ): Promise<boolean> {
    return this.decisions(scope, userId).approve(id);
  }

  reject(
    scope: AdjustmentScope,
    id: string,
    decision: { userId: string; reason: string }
  ): Promise<boolean> {
    return this.decisions(scope, decision.userId).reject(id, decision.reason);
  }

  private decisions(scope: AdjustmentScope, userId: string) {
    return decisionsFor(this.db, {
      table: 'student_discount',
      organizationId: scope.organizationId,
      userId,
    });
  }

  async end(
    scope: AdjustmentScope,
    id: string,
    ending: { userId: string; lastTermId: string }
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('student_discount')
      .set({
        to_term_id: ending.lastTermId,
        ended_at: new Date(),
        ended_by: ending.userId,
      })
      .where('organization_id', '=', scope.organizationId)
      .where('id', '=', id)
      .where('status', '=', 'approved')
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async waiting(scope: AdjustmentScope): Promise<WaitingApproval[]> {
    const { rows } = await sql<DiscountRow & { campus_id: string }>`
      SELECT ${COLUMNS}, ${currentCampusSql('st')} AS campus_id ${JOINS}
      WHERE ${visible(scope)} AND d.status = 'submitted'
      ORDER BY d.created_at, d.id`.execute(this.db);
    return rows.map((row) => {
      const text = valueText(row.kind, row.value);
      return {
        kind: 'discount',
        id: row.id,
        details: `${row.first_name} ${row.last_name}: ${row.reason} (${text})`,
        amountMinor: null,
        amountText: `${text} off`,
        createdById: row.created_by,
        createdByName: row.created_by_name ?? FORMER_MEMBER_NAME,
        createdAt: iso(row.created_at),
        campusId: row.campus_id,
      };
    });
  }
}

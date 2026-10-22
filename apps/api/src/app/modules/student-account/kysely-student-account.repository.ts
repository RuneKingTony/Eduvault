import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import {
  feeTermLabel,
  paymentMethodSchema,
  studentLifeSchema,
  journalKindSchema,
  type BalanceListQuery,
  type StatementFamily,
  type OwedByLife,
} from '@eduvault/api-contract';
import { escapeLike } from '../../common/db/escape-like';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  currentTermWindowCte,
  termPaymentPredicate,
  termSinceDaySql,
} from '../../common/payments';
import {
  receivableAccountIdSql,
  schoolCurrency,
  type KindMovement,
} from '../../common/ledger';
import {
  currentCampusSql,
  payingGuardian,
  inScope,
  studentClassNameSql,
  visibleStudentsCte,
} from '../../common/students';
import { balanceFilterRule } from './balance-filter';
import type { MovementRecord } from './statement-assembly';
import {
  StudentAccountRepository,
  type AccountScope,
  type BalanceCounts,
  type BalancePageRecord,
  type BalanceRowRecord,
  type GuardianChildren,
  type StudentHeader,
  type TermStart,
} from './student-account.repository';

const visibleWith = (scope: AccountScope, studentId?: string) =>
  visibleStudentsCte({
    organizationId: scope.organizationId,
    campusScope: scope.campusScope,
    classScope: 'all',
    today: scope.today,
    ...(studentId === undefined ? {} : { studentId }),
  });

const balancesCte = (organizationId: string): RawBuilder<unknown> => sql`
  bal AS (
    SELECT jl.student_id, SUM(jl.debit_minor - jl.credit_minor) AS balance
    FROM journal_line jl
    WHERE jl.organization_id = ${organizationId}
      AND jl.ledger_account_id = ${receivableAccountIdSql(organizationId)}
      AND jl.student_id IN (SELECT id FROM visible)
    GROUP BY jl.student_id
  )`;

function filterSql(query: BalanceListQuery): RawBuilder<unknown> {
  const rule = balanceFilterRule(query.filter);
  const parts: RawBuilder<unknown>[] = [sql`TRUE`];
  if (rule.balance === 'owing') {
    parts.push(sql`COALESCE(b.balance, 0) > 0`);
  }
  if (rule.balance === 'settled') {
    parts.push(sql`COALESCE(b.balance, 0) <= 0`);
  }
  if (rule.lives !== null) {
    parts.push(sql`v.life IN (${sql.join(rule.lives)})`);
  }
  if (query.q !== undefined && query.q !== '') {
    const pattern = `%${escapeLike(query.q)}%`;
    parts.push(
      sql`((v.first_name || ' ' || v.last_name) ILIKE ${pattern}
        OR v.admission_number ILIKE ${pattern})`
    );
  }
  return sql.join(parts, sql` AND `);
}

interface PageRow {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  life: string;
  balance: string;
  class_name: string | null;
  guardian_id: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  total_rows: number;
}

interface KindRow {
  student_id: string;
  kind: string;
  debit: string;
  credit: string;
}

const minorOf = (value: string | undefined): number => Number(value ?? 0);

const toKind = (row: KindRow): KindMovement => ({
  kind: journalKindSchema.parse(row.kind),
  debitMinor: Number(row.debit),
  creditMinor: Number(row.credit),
});

function toRow(
  row: PageRow,
  kinds: ReadonlyMap<string, KindMovement[]>
): BalanceRowRecord {
  return {
    studentId: row.id,
    name: `${row.first_name} ${row.last_name}`,
    admissionNumber: row.admission_number,
    lifecycle: studentLifeSchema.parse(row.life),
    className: row.class_name,
    guardian:
      row.guardian_id === null || row.guardian_name === null
        ? null
        : {
            id: row.guardian_id,
            name: row.guardian_name,
            phone: row.guardian_phone ?? '',
          },
    balanceMinor: Number(row.balance),
    kindMovements: kinds.get(row.id) ?? [],
  };
}

interface MovementRow {
  entry_id: string;
  sequence: string;
  effective_on: string;
  reference: string;
  kind: string;
  memo: string | null;
  debit: string;
  credit: string;
  invoice_id: string | null;
  term_label: string | null;
  invoice_lines: string | null;
  payment_id: string | null;
  receipt_number: string | null;
  payer_name: string | null;
  method: string | null;
  payment_voided: boolean | null;
  store_sale: boolean;
}

function toMovement(row: MovementRow): MovementRecord {
  return {
    entryId: row.entry_id,
    sequence: Number(row.sequence),
    effectiveOn: row.effective_on,
    reference: row.reference,
    kind: journalKindSchema.parse(row.kind),
    memo: row.memo,
    debitMinor: Number(row.debit),
    creditMinor: Number(row.credit),
    storeSale: row.store_sale,
    invoice:
      row.invoice_id === null
        ? null
        : {
            id: row.invoice_id,
            termLabel: row.term_label ?? '',
            descriptions: row.invoice_lines ?? '',
          },
    payment:
      row.payment_id === null
        ? null
        : {
            id: row.payment_id,
            receiptNumber: row.receipt_number ?? '',
            payerName: row.payer_name ?? '',
            method: paymentMethodSchema.parse(row.method),
            voided: row.payment_voided === true,
          },
  };
}

@Injectable()
export class KyselyStudentAccountRepository extends StudentAccountRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  async balancePage(
    scope: AccountScope,
    query: BalanceListQuery
  ): Promise<BalancePageRecord> {
    const { organizationId } = scope;
    const { rows } = await sql<PageRow>`
      WITH ${visibleWith(scope)}, ${balancesCte(organizationId)},
      page AS (
        SELECT v.id, v.organization_id, v.first_name, v.last_name, v.admission_number, v.life,
          COALESCE(b.balance, 0) AS balance,
          (count(*) OVER ())::int AS total_rows
        FROM visible v
        LEFT JOIN bal b ON b.student_id = v.id
        WHERE ${filterSql(query)}
        ORDER BY COALESCE(b.balance, 0) DESC, v.first_name, v.last_name, v.id
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
      )
      SELECT p.id, p.first_name, p.last_name, p.admission_number, p.life,
        p.balance::text AS balance, p.total_rows,
        ${studentClassNameSql('p')} AS class_name,
        guardian.id AS guardian_id, guardian.full_name AS guardian_name,
        guardian.phone AS guardian_phone
      FROM page p
      LEFT JOIN LATERAL (
        SELECT g.id, g.full_name, g.phone
        FROM guardian_student gs
        JOIN guardian g ON g.id = gs.guardian_id AND g.organization_id = gs.organization_id
        WHERE gs.student_id = p.id AND gs.organization_id = p.organization_id
        ORDER BY gs.pays_fees DESC, gs.created_at, gs.id
        LIMIT 1
      ) guardian ON TRUE
      ORDER BY p.balance DESC, p.first_name, p.last_name, p.id`.execute(
      this.db
    );
    const kinds = await this.kindMovements(
      organizationId,
      rows.map((row) => row.id)
    );
    return {
      items: rows.map((row) => toRow(row, kinds)),
      total: rows[0]?.total_rows ?? 0,
    };
  }

  private async kindMovements(
    organizationId: string,
    studentIds: readonly string[]
  ): Promise<Map<string, KindMovement[]>> {
    const grouped = new Map<string, KindMovement[]>();
    if (studentIds.length === 0) {
      return grouped;
    }
    const { rows } = await sql<KindRow>`
      SELECT jl.student_id, je.kind,
        sum(jl.debit_minor)::text AS debit, sum(jl.credit_minor)::text AS credit
      FROM journal_line jl
      JOIN journal_entry je ON je.id = jl.entry_id AND je.organization_id = jl.organization_id
      WHERE jl.organization_id = ${organizationId}
        AND jl.ledger_account_id = ${receivableAccountIdSql(organizationId)}
        AND jl.student_id IN (${sql.join(studentIds)})
        AND je.kind <> 'store'
        AND NOT EXISTS (
          SELECT 1 FROM payment sp
          JOIN store_sale ss ON ss.payment_id = sp.id AND ss.organization_id = sp.organization_id
          WHERE sp.journal_entry_id = je.id AND sp.organization_id = je.organization_id
        )
      GROUP BY jl.student_id, je.kind`.execute(this.db);
    for (const row of rows) {
      const list = grouped.get(row.student_id) ?? [];
      list.push(toKind(row));
      grouped.set(row.student_id, list);
    }
    return grouped;
  }

  async balanceCounts(scope: AccountScope): Promise<BalanceCounts> {
    const { rows } = await sql<{
      in_scope: number;
      owing: number;
      owed: string;
    }>`
      WITH ${visibleWith(scope)}, ${balancesCte(scope.organizationId)}
      SELECT count(*)::int AS in_scope,
        (count(*) FILTER (WHERE COALESCE(b.balance, 0) > 0))::int AS owing,
        COALESCE(sum(b.balance) FILTER (WHERE b.balance > 0), 0)::text AS owed
      FROM visible v
      LEFT JOIN bal b ON b.student_id = v.id`.execute(this.db);
    const row = rows[0];
    return {
      totalOwedMinor: Number(row?.owed ?? 0),
      studentsOwing: row?.owing ?? 0,
      studentsInScope: row?.in_scope ?? 0,
    };
  }

  async owedByLife(scope: AccountScope): Promise<OwedByLife> {
    const { rows } = await sql<Record<keyof OwedByLife, string>>`
      WITH ${visibleWith(scope)}, ${balancesCte(scope.organizationId)},
      owed AS (
        SELECT v.life, COALESCE(v.new_in_session, FALSE) AS new_intake, b.balance
        FROM visible v
        JOIN bal b ON b.student_id = v.id
        WHERE b.balance > 0
      )
      SELECT
        COALESCE(sum(balance) FILTER (WHERE life = 'active'), 0)::text AS active,
        COALESCE(sum(balance) FILTER (WHERE life = 'active' AND new_intake), 0)::text AS "newIntakes",
        COALESCE(sum(balance) FILTER (WHERE life = 'inactive'), 0)::text AS inactive,
        COALESCE(sum(balance) FILTER (WHERE life = 'left'), 0)::text AS "left",
        COALESCE(sum(balance) FILTER (WHERE life = 'graduated'), 0)::text AS graduated
      FROM owed`.execute(this.db);
    const row = rows[0];
    return {
      active: minorOf(row?.active),
      newIntakes: minorOf(row?.newIntakes),
      inactive: minorOf(row?.inactive),
      left: minorOf(row?.left),
      graduated: minorOf(row?.graduated),
    };
  }

  async hasCurrentTerm(organizationId: string): Promise<boolean> {
    const { rows } = await sql<{ present: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM term
        WHERE organization_id = ${organizationId} AND is_current
      ) AS present`.execute(this.db);
    return rows[0]?.present ?? false;
  }

  async receivedThisTerm(
    scope: AccountScope
  ): Promise<{ minor: number; count: number }> {
    const { organizationId } = scope;
    const { rows } = await sql<{ received: string; payments: number }>`
      WITH ${currentTermWindowCte(organizationId)}
      SELECT COALESCE(sum(pa.amount_minor), 0)::text AS received,
        count(DISTINCT p.id)::int AS payments
      FROM payment p
      JOIN payment_allocation pa ON pa.payment_id = p.id AND pa.organization_id = p.organization_id
      JOIN student st ON st.id = pa.student_id AND st.organization_id = pa.organization_id
      WHERE p.organization_id = ${organizationId}
        AND ${termPaymentPredicate(sql`(SELECT since_day FROM term_window)`, sql`(SELECT ends_on FROM term_window)`)}
        AND ${inScope(currentCampusSql('st'), scope.campusScope)}`.execute(
      this.db
    );
    return {
      minor: Number(rows[0]?.received ?? 0),
      count: rows[0]?.payments ?? 0,
    };
  }

  async campusNames(scope: AccountScope): Promise<string[]> {
    if (scope.campusScope === 'all' || scope.campusScope.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('team')
      .select('name')
      .where('organizationId', '=', scope.organizationId)
      .where('id', 'in', scope.campusScope)
      .orderBy('name')
      .execute();
    return rows.map((row) => row.name);
  }

  async studentHeader(
    scope: AccountScope,
    studentId: string
  ): Promise<StudentHeader | undefined> {
    const { rows } = await sql<{
      id: string;
      first_name: string;
      last_name: string;
      admission_number: string;
      campus_name: string;
      archived: boolean;
      class_name: string | null;
    }>`
      WITH ${visibleWith(scope, studentId)}
      SELECT v.id, v.first_name, v.last_name, v.admission_number,
        campus.name AS campus_name, (v.archived_at IS NOT NULL) AS archived,
        ${studentClassNameSql('v')} AS class_name
      FROM visible v
      JOIN team campus ON campus.id = v.campus_id`.execute(this.db);
    const row = rows[0];
    return (
      row && {
        id: row.id,
        name: `${row.first_name} ${row.last_name}`,
        admissionNumber: row.admission_number,
        className: row.class_name,
        campusName: row.campus_name,
        archived: row.archived,
      }
    );
  }

  async movements(
    organizationId: string,
    studentId: string
  ): Promise<MovementRecord[]> {
    const { rows } = await sql<MovementRow>`
      SELECT je.id AS entry_id, je.sequence::text AS sequence,
        to_char(je.effective_on, 'YYYY-MM-DD') AS effective_on,
        je.reference, je.kind, je.memo,
        sum(jl.debit_minor)::text AS debit, sum(jl.credit_minor)::text AS credit,
        inv.id AS invoice_id,
        (t.name || ', ' || sy.name) AS term_label,
        (
          SELECT string_agg(il.description, '; ' ORDER BY il.created_at, il.description)
          FROM invoice_line il
          WHERE il.invoice_id = inv.id AND il.organization_id = inv.organization_id
        ) AS invoice_lines,
        pay.id AS payment_id, pay.receipt_number, pay.payer_name, pay.method,
        (pay.status = 'voided') AS payment_voided,
        EXISTS (
          SELECT 1 FROM store_sale ss
          WHERE ss.organization_id = je.organization_id
            AND (ss.invoice_id = inv.id OR ss.payment_id = pay.id)
        ) AS store_sale
      FROM journal_line jl
      JOIN journal_entry je ON je.id = jl.entry_id AND je.organization_id = jl.organization_id
      LEFT JOIN invoice inv
        ON inv.journal_entry_id = je.id AND inv.organization_id = je.organization_id
      LEFT JOIN term t ON t.id = inv.term_id AND t.organization_id = inv.organization_id
      LEFT JOIN academic_session sy ON sy.id = t.session_id AND sy.organization_id = t.organization_id
      LEFT JOIN payment pay
        ON pay.journal_entry_id = je.id AND pay.organization_id = je.organization_id
      WHERE jl.organization_id = ${organizationId}
        AND jl.student_id = ${studentId}
        AND jl.ledger_account_id = ${receivableAccountIdSql(organizationId)}
      GROUP BY je.id, inv.id, t.id, sy.id, pay.id
      ORDER BY je.effective_on, je.sequence`.execute(this.db);
    return rows.map((row) => toMovement(row));
  }

  async termWindows(organizationId: string): Promise<TermStart[]> {
    const { rows } = await sql<{
      id: string;
      name: string;
      school_year_name: string;
      since_day: string;
    }>`
      SELECT t.id, t.name, sy.name AS school_year_name,
        to_char(${termSinceDaySql(organizationId)}, 'YYYY-MM-DD') AS since_day
      FROM term t
      JOIN academic_session sy ON sy.id = t.session_id AND sy.organization_id = t.organization_id
      WHERE t.organization_id = ${organizationId}
      ORDER BY t.starts_on, t.id`.execute(this.db);
    return rows.map((row) => ({
      id: row.id,
      label: feeTermLabel({
        name: row.name,
        schoolYearName: row.school_year_name,
      }),
      sinceDay: row.since_day,
    }));
  }

  async family(
    scope: AccountScope,
    studentId: string
  ): Promise<StatementFamily> {
    const payer = await payingGuardian(this.db, {
      organizationId: scope.organizationId,
      studentId,
    });
    if (payer === undefined) {
      return null;
    }
    const children = await this.childIds(scope, payer.id);
    return {
      guardianId: payer.id,
      guardianName: payer.fullName,
      childCount: children.length,
    };
  }

  private async childIds(
    scope: AccountScope,
    guardianId: string
  ): Promise<string[]> {
    const { rows } = await sql<{ id: string }>`
      SELECT st.id
      FROM guardian_student gs
      JOIN student st ON st.id = gs.student_id AND st.organization_id = gs.organization_id
      WHERE gs.guardian_id = ${guardianId}
        AND gs.organization_id = ${scope.organizationId}
        AND ${inScope(currentCampusSql('st'), scope.campusScope)}
      ORDER BY st.first_name, st.last_name, st.id`.execute(this.db);
    return rows.map((row) => row.id);
  }

  async guardianChildren(
    scope: AccountScope,
    guardianId: string
  ): Promise<GuardianChildren | undefined> {
    const guardian = await this.db
      .selectFrom('guardian')
      .select(['id', 'full_name'])
      .where('organization_id', '=', scope.organizationId)
      .where('id', '=', guardianId)
      .executeTakeFirst();
    if (guardian === undefined) {
      return undefined;
    }
    const studentIds = await this.childIds(scope, guardianId);
    return studentIds.length === 0
      ? undefined
      : {
          guardian: { id: guardian.id, name: guardian.full_name },
          studentIds,
        };
  }
}

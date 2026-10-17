import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import {
  FEES_RECEIVABLE_SYSTEM_KEY,
  invoiceKindSchema,
  invoiceStatusSchema,
  type InvoiceCounts,
  type InvoiceJournal,
  type InvoiceLine,
  type InvoiceListQuery,
  type InvoiceListSummary,
  type InvoiceSummary,
} from '@eduvault/api-contract';
import { escapeLike } from '../../common/db/escape-like';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { chargeTotal, invoiceTotalSql } from '../../common/fees';
import { schoolCurrency, type ReceivableMovement } from '../../common/ledger';
import { currentCampusSql, inScope } from '../../common/students';
import {
  InvoiceRepository,
  type InvoicePage,
  type InvoiceRecord,
  type InvoiceScope,
} from './invoice.repository';

interface SummaryRow {
  id: string;
  number: string | null;
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  arm_name: string | null;
  kind: string;
  term_id: string;
  term_name: string;
  school_year_name: string;
  status: string;
  date: string;
  total_minor: string;
  fee_count: number;
  descriptions: string | null;
  total_rows: number;
}

const toSummary = (row: SummaryRow): InvoiceSummary => {
  const kind = invoiceKindSchema.parse(row.kind);
  const termName = `${row.term_name}, ${row.school_year_name}`;
  return {
    id: row.id,
    number: row.number,
    studentId: row.student_id,
    studentName: `${row.first_name} ${row.last_name}`,
    admissionNumber: row.admission_number,
    armName: row.arm_name,
    kind,
    termId: row.term_id,
    termName,
    forText: kind === 'term' ? termName : (row.descriptions ?? ''),
    feeCount: row.fee_count,
    totalMinor: Number(row.total_minor),
    status: invoiceStatusSchema.parse(row.status),
    date: row.date,
  };
};

interface DetailRow {
  id: string;
  number: string | null;
  kind: string;
  status: string;
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  arm_name: string | null;
  term_id: string;
  term_name: string;
  school_year_name: string;
  campus_id: string;
  campus_name: string;
  billing_run_id: string | null;
  run_number: string | null;
  created_at: Date;
  issued_at: Date | null;
  issued_by_name: string | null;
  entry_sequence: string | null;
  entry_reference: string | null;
  sale_id: string | null;
  sale_number: string | null;
}

interface LineRow {
  id: string;
  description: string;
  amount_minor: string;
  ledger_account_id: string;
  fee_line_id: string | null;
  student_discount_id: string | null;
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

const toLine = (row: LineRow): InvoiceLine => ({
  id: row.id,
  description: row.description,
  amountMinor: Number(row.amount_minor),
  ledgerAccountId: row.ledger_account_id,
  feeLineId: row.fee_line_id,
  studentDiscountId: row.student_discount_id,
});

function toJournal(reference: string, rows: JournalRow[]): InvoiceJournal {
  const lines = rows.map((row) => ({
    accountCode: row.account_code,
    accountName: row.account_name,
    studentName:
      row.first_name === null ? null : `${row.first_name} ${row.last_name}`,
    campusName: row.campus_name,
    debitMinor: Number(row.debit_minor),
    creditMinor: Number(row.credit_minor),
  }));
  const debits = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const credits = lines.reduce((sum, line) => sum + line.creditMinor, 0);
  return { reference, lines, balanced: debits === credits };
}

const SENT_DAY = sql`(COALESCE(i.issued_at, i.created_at) AT TIME ZONE 'Africa/Lagos')`;

@Injectable()
export class KyselyInvoiceRepository extends InvoiceRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  async studentVisible(
    scope: InvoiceScope,
    studentId: string
  ): Promise<boolean> {
    const { rows } = await sql<{ id: string }>`
      SELECT st.id FROM student st
      WHERE st.id = ${studentId}
        AND st.organization_id = ${scope.organizationId}
        AND ${inScope(currentCampusSql('st'), scope.campusScope)}`.execute(
      this.db
    );
    return rows.length > 0;
  }

  private filters(
    scope: InvoiceScope,
    query: Partial<InvoiceListQuery> = {}
  ): RawBuilder<unknown> {
    const parts: RawBuilder<unknown>[] = [
      sql`i.organization_id = ${scope.organizationId}`,
      inScope(currentCampusSql('st'), scope.campusScope),
    ];
    for (const [column, value] of [
      ['i.kind', query.kind],
      ['i.status', query.status],
      ['i.student_id', query.studentId],
      ['i.term_id', query.termId],
      ['i.billing_run_id', query.billingRunId],
    ] as const) {
      if (value !== undefined) {
        parts.push(sql`${sql.ref(column)} = ${value}`);
      }
    }
    if (query.q !== undefined && query.q !== '') {
      const pattern = `%${escapeLike(query.q)}%`;
      parts.push(
        sql`((st.first_name || ' ' || st.last_name) ILIKE ${pattern}
          OR i.number ILIKE ${pattern}
          OR st.admission_number ILIKE ${pattern})`
      );
    }
    return sql.join(parts, sql` AND `);
  }

  async list(
    scope: InvoiceScope,
    query: InvoiceListQuery
  ): Promise<InvoicePage> {
    const { rows } = await sql<SummaryRow>`
      SELECT
        i.id, i.number, i.student_id, st.first_name, st.last_name, st.admission_number,
        arm.name AS arm_name, i.kind, i.term_id,
        t.name AS term_name, sy.name AS school_year_name, i.status,
        to_char(${SENT_DAY}, 'YYYY-MM-DD') AS date,
        ${invoiceTotalSql('i')}::text AS total_minor, tot.fee_count, tot.descriptions,
        (count(*) OVER ())::int AS total_rows
      FROM invoice i
      JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
      JOIN term t ON t.id = i.term_id AND t.organization_id = i.organization_id
      JOIN academic_session sy ON sy.id = t.session_id AND sy.organization_id = t.organization_id
      LEFT JOIN student_enrollment en
        ON en.student_id = st.id AND en.organization_id = st.organization_id AND en.session_id = t.session_id
      LEFT JOIN enrollment_placement ep ON ep.enrollment_id = en.id AND ep.term_id = i.term_id
      LEFT JOIN class_arm arm ON arm.id = ep.class_arm_id AND arm.organization_id = ep.organization_id
      CROSS JOIN LATERAL (
        SELECT
          (count(*) FILTER (WHERE il.fee_line_id IS NOT NULL))::int AS fee_count,
          string_agg(il.description, '; ' ORDER BY il.created_at, il.description) AS descriptions
        FROM invoice_line il
        WHERE il.invoice_id = i.id AND il.organization_id = i.organization_id
      ) tot
      WHERE ${this.filters(scope, query)}
      ORDER BY ${SENT_DAY}::date DESC, i.number DESC NULLS LAST, i.created_at DESC, i.id
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`.execute(
      this.db
    );
    return {
      items: rows.map((row) => toSummary(row)),
      total: rows[0]?.total_rows ?? 0,
    };
  }

  async counts(scope: InvoiceScope): Promise<InvoiceCounts> {
    const { rows } = await sql<{ kind: string; total: number }>`
      SELECT i.kind, count(*)::int AS total
      FROM invoice i
      JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
      WHERE ${this.filters(scope)}
      GROUP BY i.kind`.execute(this.db);
    const totalOf = (kind: string) =>
      rows.find((row) => row.kind === kind)?.total ?? 0;
    return {
      term: totalOf('term'),
      adhoc: totalOf('adhoc'),
      store: totalOf('store'),
    };
  }

  async summary(scope: InvoiceScope): Promise<InvoiceListSummary> {
    const { rows } = await sql<{
      sent_count: number;
      sent_total: string;
      draft_count: number;
    }>`
      SELECT
        (count(*) FILTER (WHERE i.status = 'issued'))::int AS sent_count,
        COALESCE(sum(${invoiceTotalSql('i')}) FILTER (WHERE i.status = 'issued'), 0)::text AS sent_total,
        (count(*) FILTER (WHERE i.status = 'draft'))::int AS draft_count
      FROM invoice i
      JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
      WHERE ${this.filters(scope)}`.execute(this.db);
    const row = rows[0];
    return {
      sentCount: row?.sent_count ?? 0,
      sentTotalMinor: Number(row?.sent_total ?? 0),
      draftCount: row?.draft_count ?? 0,
    };
  }

  async termTotals(
    scope: InvoiceScope,
    termId: string
  ): Promise<{ count: number; totalMinor: number }> {
    const { rows } = await sql<{ total: number; total_minor: string }>`
      SELECT count(*)::int AS total, COALESCE(sum(${invoiceTotalSql('i')}), 0)::text AS total_minor
      FROM invoice i
      JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
      WHERE ${this.filters(scope, { kind: 'term', status: 'issued', termId })}`.execute(
      this.db
    );
    return {
      count: rows[0]?.total ?? 0,
      totalMinor: Number(rows[0]?.total_minor ?? 0),
    };
  }

  async find(
    scope: InvoiceScope,
    id: string
  ): Promise<InvoiceRecord | undefined> {
    const { rows } = await sql<DetailRow>`
      SELECT
        i.id, i.number, i.kind, i.status, i.student_id,
        st.first_name, st.last_name, st.admission_number, arm.name AS arm_name,
        i.term_id, t.name AS term_name, sy.name AS school_year_name,
        i.campus_id, camp.name AS campus_name,
        i.billing_run_id, br.number AS run_number,
        i.created_at, i.issued_at, issuer.name AS issued_by_name,
        je.sequence::text AS entry_sequence, je.reference AS entry_reference,
        ss.id AS sale_id, ss.number AS sale_number
      FROM invoice i
      JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
      JOIN term t ON t.id = i.term_id AND t.organization_id = i.organization_id
      JOIN academic_session sy ON sy.id = t.session_id AND sy.organization_id = t.organization_id
      JOIN team camp ON camp.id = i.campus_id
      LEFT JOIN student_enrollment en
        ON en.student_id = st.id AND en.organization_id = st.organization_id AND en.session_id = t.session_id
      LEFT JOIN enrollment_placement ep ON ep.enrollment_id = en.id AND ep.term_id = i.term_id
      LEFT JOIN class_arm arm ON arm.id = ep.class_arm_id AND arm.organization_id = ep.organization_id
      LEFT JOIN billing_run br ON br.id = i.billing_run_id AND br.organization_id = i.organization_id
      LEFT JOIN "user" issuer ON issuer.id = i.issued_by
      LEFT JOIN journal_entry je ON je.id = i.journal_entry_id AND je.organization_id = i.organization_id
      LEFT JOIN store_sale ss ON ss.invoice_id = i.id AND ss.organization_id = i.organization_id
      WHERE i.id = ${id}
        AND i.organization_id = ${scope.organizationId}
        AND ${inScope(currentCampusSql('st'), scope.campusScope)}`.execute(
      this.db
    );
    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }
    const [lines, chargedTo, journal] = await Promise.all([
      this.lines(scope.organizationId, id),
      this.chargedTo(scope.organizationId, row.student_id),
      this.journal(scope.organizationId, row.entry_reference, id),
    ]);
    return this.toRecord(row, { lines, chargedTo, journal });
  }

  private toRecord(
    row: DetailRow,
    extra: Pick<InvoiceRecord, 'lines' | 'chargedTo' | 'journal'>
  ): InvoiceRecord {
    return {
      id: row.id,
      number: row.number,
      kind: invoiceKindSchema.parse(row.kind),
      status: invoiceStatusSchema.parse(row.status),
      student: {
        id: row.student_id,
        name: `${row.first_name} ${row.last_name}`,
        admissionNumber: row.admission_number,
        armName: row.arm_name,
      },
      termId: row.term_id,
      termName: `${row.term_name}, ${row.school_year_name}`,
      campusId: row.campus_id,
      campusName: row.campus_name,
      lines: extra.lines,
      totalMinor: chargeTotal(extra.lines),
      billingRun:
        row.billing_run_id === null || row.run_number === null
          ? null
          : { id: row.billing_run_id, number: row.run_number },
      createdAt: iso(row.created_at),
      issuedAt: row.issued_at === null ? null : iso(row.issued_at),
      issuedBy: row.issued_by_name,
      chargedTo: extra.chargedTo,
      journal: extra.journal,
      source:
        row.sale_id === null || row.sale_number === null
          ? null
          : { kind: 'store_sale', id: row.sale_id, number: row.sale_number },
      entrySequence:
        row.entry_sequence === null ? null : Number(row.entry_sequence),
    };
  }

  private async lines(
    organizationId: string,
    invoiceId: string
  ): Promise<InvoiceLine[]> {
    const { rows } = await sql<LineRow>`
      SELECT il.id, il.description, il.amount_minor::text AS amount_minor,
        il.ledger_account_id, il.fee_line_id, il.student_discount_id
      FROM invoice_line il
      JOIN ledger_account la ON la.id = il.ledger_account_id AND la.organization_id = il.organization_id
      WHERE il.invoice_id = ${invoiceId} AND il.organization_id = ${organizationId}
      ORDER BY (il.amount_minor < 0), la.code, il.description, il.id`.execute(
      this.db
    );
    return rows.map((row) => toLine(row));
  }

  private async chargedTo(
    organizationId: string,
    studentId: string
  ): Promise<InvoiceRecord['chargedTo']> {
    const row = await this.db
      .selectFrom('guardian_student as gs')
      .innerJoin('guardian as g', (join) =>
        join
          .onRef('g.id', '=', 'gs.guardian_id')
          .onRef('g.organization_id', '=', 'gs.organization_id')
      )
      .select(['g.full_name', 'gs.relationship'])
      .where('gs.organization_id', '=', organizationId)
      .where('gs.student_id', '=', studentId)
      .where('gs.pays_fees', '=', true)
      .orderBy('g.full_name')
      .limit(1)
      .executeTakeFirst();
    return row === undefined
      ? null
      : { name: row.full_name, relationship: row.relationship };
  }

  private async journal(
    organizationId: string,
    reference: string | null,
    invoiceId: string
  ): Promise<InvoiceJournal | null> {
    if (reference === null) {
      return null;
    }
    const { rows } = await sql<JournalRow>`
      SELECT la.code AS account_code, la.name AS account_name,
        st.first_name, st.last_name, camp.name AS campus_name,
        jl.debit_minor::text AS debit_minor, jl.credit_minor::text AS credit_minor
      FROM invoice i
      JOIN journal_line jl ON jl.entry_id = i.journal_entry_id AND jl.organization_id = i.organization_id
      JOIN ledger_account la ON la.id = jl.ledger_account_id AND la.organization_id = jl.organization_id
      LEFT JOIN student st ON st.id = jl.student_id AND st.organization_id = jl.organization_id
      LEFT JOIN team camp ON camp.id = jl.campus_id
      WHERE i.id = ${invoiceId} AND i.organization_id = ${organizationId}
      ORDER BY (jl.debit_minor = 0), la.code, jl.debit_minor DESC, jl.credit_minor DESC`.execute(
      this.db
    );
    return toJournal(reference, rows);
  }

  async movements(
    organizationId: string,
    studentId: string
  ): Promise<ReceivableMovement[]> {
    const { rows } = await sql<{ sequence: string; net_minor: string }>`
      SELECT je.sequence::text AS sequence,
        sum(jl.debit_minor - jl.credit_minor)::text AS net_minor
      FROM journal_line jl
      JOIN journal_entry je ON je.id = jl.entry_id AND je.organization_id = jl.organization_id
      JOIN ledger_account la ON la.id = jl.ledger_account_id AND la.organization_id = jl.organization_id
      WHERE jl.organization_id = ${organizationId}
        AND jl.student_id = ${studentId}
        AND la.system_key = ${FEES_RECEIVABLE_SYSTEM_KEY}
      GROUP BY je.sequence`.execute(this.db);
    return rows.map((row) => ({
      sequence: Number(row.sequence),
      netMinor: Number(row.net_minor),
    }));
  }
}

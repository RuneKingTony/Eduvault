import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import {
  DISCOUNTS_GIVEN_SYSTEM_KEY,
  FEES_RECEIVABLE_SYSTEM_KEY,
  billingRunStatusSchema,
  billingScopeSchema,
  feeAppliesToSchema,
  type BillingRunListQuery,
  type BillingRunSummary,
} from '@eduvault/api-contract';
import { INACTIVE_AFTER_DAYS } from '@eduvault/shared';
import {
  ActivityWriter,
  financeActor,
  roundSentActivity,
  type CampusAmount,
} from '../../common/activity';
import { chunks, day, iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  allocateDocumentNumber,
  formatDocumentNumber,
} from '../../common/documents';
import {
  chargePostingLines,
  discountFacts,
  invoiceTotalSql,
  type ChargeableFeeLine,
  type DiscountFacts,
} from '../../common/fees';
import {
  LedgerPoster,
  schoolCurrency,
  systemAccountId,
} from '../../common/ledger';
import { currentCampusSql, inScope } from '../../common/students';
import type { DB } from '../../../db/db-types';
import { scopeLabel, type RoundFilter } from './billing-round';
import {
  BillingRepository,
  type BillingScope,
  type ChargeSummary,
  type ChargeSummaryOptions,
  type CreatedRound,
  type IssueRound,
  type LevelRef,
  type NewRound,
  type RoundCandidateOptions,
  type RoundCandidates,
  type RunAction,
  type RunHeader,
  type RunOutcome,
  type RunPage,
  type TermInfo,
} from './billing.repository';
import type { RoundCandidate } from './round-plan';
import { sendOrder } from './send-order';

const INSERT_CHUNK = 500;

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

interface CandidateRow {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  home_campus_id: string;
  enrollment_id: string;
  class_level_id: string;
  is_new_student: boolean;
  term_campus_id: string | null;
  latest_campus_id: string | null;
}

interface RoundRow {
  skipped: number;
  candidates: CandidateRow[] | null;
}

const toCandidate = (row: CandidateRow): RoundCandidate => ({
  studentId: row.id,
  enrollmentId: row.enrollment_id,
  firstName: row.first_name,
  lastName: row.last_name,
  admissionNumber: row.admission_number,
  isNew: row.is_new_student,
  termPlacementCampusId: row.term_campus_id,
  latestPlacementCampusId: row.latest_campus_id,
  homeCampusId: row.home_campus_id,
  classLevelId: row.class_level_id,
});

// These fragments read the caller's aliases: s (student) and en (enrollment); roundFilterSql also reads p (placements).
const termPlacementCampusSql = (termId: string) =>
  sql<string | null>`(
    select tp.campus_id
    from enrollment_placement tp
    where tp.enrollment_id = en.id
      and tp.term_id = ${termId}
  )`;

const latestPlacementCampusSql = () =>
  sql<string | null>`(
    select ep.campus_id
    from enrollment_placement ep
    join term t on t.id = ep.term_id and t.organization_id = ep.organization_id
    where ep.enrollment_id = en.id
    order by t.sequence desc
    limit 1
  )`;

const campusOfSql = (
  termPlacement: RawBuilder<string | null>,
  latestPlacement: RawBuilder<string | null>
) => sql<string>`coalesce(${termPlacement}, ${latestPlacement}, s.campus_id)`;

const termCampusSql = (termId: string) =>
  campusOfSql(termPlacementCampusSql(termId), latestPlacementCampusSql());

const includedSql = (today: string) =>
  sql<boolean>`(
    en.status = 'active'
    and s.exit_kind is null
    and (
      s.not_seen_since is null
      or ${today}::date - s.not_seen_since < ${INACTIVE_AFTER_DAYS}
    )
  )`;

const chargedSql = (termId: string) =>
  sql<boolean>`exists (
    select 1
    from invoice i
    where i.student_id = s.id
      and i.organization_id = s.organization_id
      and i.term_id = ${termId}
      and i.kind = 'term'
      and i.status <> 'cancelled'
  )`;

const roundFilterSql = (filter: RoundFilter) => {
  switch (filter.scope) {
    case 'school': {
      return sql`true`;
    }
    case 'campus': {
      return sql`${campusOfSql(
        sql`p.term_campus_id`,
        sql`p.latest_campus_id`
      )} = ${filter.campusId}`;
    }
    case 'level': {
      return sql`en.class_level_id = ${filter.classLevelId}`;
    }
  }
};

const hasLineSql = (termId: string) =>
  sql<boolean>`exists (
    select 1
    from fee_line f
    join ledger_account fee_type
      on fee_type.id = f.ledger_account_id
      and fee_type.organization_id = f.organization_id
    where f.organization_id = s.organization_id
      and f.term_id = ${termId}
      and f.retired_at is null
      and f.class_level_id = en.class_level_id
      and (f.campus_id is null or f.campus_id = ${termCampusSql(termId)})
      and (f.applies_to = 'all' or (f.applies_to = 'new') = en.is_new_student)
      and (
        not f.is_optional
        or exists (
          select 1
          from student_fee_option o
          where o.enrollment_id = en.id
            and o.ledger_account_id = f.ledger_account_id
            and o.organization_id = f.organization_id
        )
      )
  )`;

interface ChargeSummaryRow {
  created: number;
  skipped: number;
  level_ids: string[] | null;
  sample: { id: string; name: string }[] | null;
}

const toChargeSummary = (row: ChargeSummaryRow | undefined): ChargeSummary => ({
  created: row?.created ?? 0,
  skipped: row?.skipped ?? 0,
  levelIds: row?.level_ids ?? [],
  sample: row?.sample ?? [],
});

interface LedgerChargeLine {
  ledgerAccountId: string;
  amountMinor: number;
}

type RunCheck =
  { ok: true; number: string } | { ok: false; outcome: RunOutcome };

interface SendableDraft {
  id: string;
  student_id: string;
  campus_id: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class KyselyBillingRepository extends BillingRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly poster: LedgerPoster,
    private readonly activity: ActivityWriter
  ) {
    super();
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  private terms(organizationId: string) {
    return this.db
      .selectFrom('term')
      .innerJoin('academic_session', (join) =>
        join
          .onRef('academic_session.id', '=', 'term.session_id')
          .onRef(
            'academic_session.organization_id',
            '=',
            'term.organization_id'
          )
      )
      .select([
        'term.id',
        'term.name',
        'term.session_id',
        'term.is_current',
        'term.sequence',
        'academic_session.name as school_year_name',
        day('academic_session.starts_on').as('session_starts_on'),
      ])
      .where('term.organization_id', '=', organizationId);
  }

  async termsToCharge(organizationId: string): Promise<TermInfo[]> {
    const rows = await this.terms(organizationId)
      .where(
        'term.starts_on',
        '>=',
        this.db
          .selectFrom('term as current')
          .select('current.starts_on')
          .where('current.organization_id', '=', organizationId)
          .where('current.is_current', '=', true)
      )
      .orderBy('term.starts_on')
      .limit(2)
      .execute();
    return rows.map((row) => this.toTerm(row));
  }

  async findTerm(
    organizationId: string,
    termId: string
  ): Promise<TermInfo | undefined> {
    const row = await this.terms(organizationId)
      .where('term.id', '=', termId)
      .executeTakeFirst();
    return row && this.toTerm(row);
  }

  private toTerm(row: {
    id: string;
    name: string;
    session_id: string;
    is_current: boolean;
    sequence: number;
    school_year_name: string;
    session_starts_on: string;
  }): TermInfo {
    return {
      id: row.id,
      name: row.name,
      schoolYearName: row.school_year_name,
      sessionId: row.session_id,
      isCurrent: row.is_current,
      position: {
        sessionStartsOn: row.session_starts_on,
        sequence: row.sequence,
      },
    };
  }

  findLevel(organizationId: string, id: string): Promise<LevelRef | undefined> {
    return this.db
      .selectFrom('class_level')
      .select(['id', 'name'])
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async roundCandidates(
    scope: BillingScope,
    term: TermInfo,
    options: RoundCandidateOptions
  ): Promise<RoundCandidates> {
    const { rows } = await sql<RoundRow>`
      with cand as (
        select
          s.id,
          s.first_name,
          s.last_name,
          s.admission_number,
          s.campus_id as home_campus_id,
          en.id as enrollment_id,
          en.class_level_id,
          en.is_new_student,
          p.term_campus_id,
          p.latest_campus_id,
          ${chargedSql(term.id)} as charged
        from student s
        join student_enrollment en
          on en.student_id = s.id
          and en.organization_id = s.organization_id
        cross join lateral (
          select
            ${termPlacementCampusSql(term.id)} as term_campus_id,
            ${latestPlacementCampusSql()} as latest_campus_id
        ) p
        where s.organization_id = ${scope.organizationId}
          and en.session_id = ${term.sessionId}
          and ${inScope(currentCampusSql('s'), scope.campusScope)}
          and ${includedSql(options.today)}
          and ${roundFilterSql(options.filter)}
      )
      select
        (count(*) filter (where charged))::int as skipped,
        json_agg(to_jsonb(cand) - 'charged') filter (where not charged) as candidates
      from cand
    `.execute(this.db);
    const row = rows[0];
    return {
      candidates: (row?.candidates ?? []).map((candidate) =>
        toCandidate(candidate)
      ),
      skipped: row?.skipped ?? 0,
    };
  }

  async chargeSummary(
    scope: BillingScope,
    term: TermInfo,
    options: ChargeSummaryOptions
  ): Promise<ChargeSummary> {
    const { rows } = await sql<ChargeSummaryRow>`
      with cand as (
        select
          s.id,
          s.first_name,
          s.last_name,
          en.class_level_id,
          ${includedSql(options.today)} as included,
          ${chargedSql(term.id)} as charged,
          ${hasLineSql(term.id)} as has_line
        from student s
        join student_enrollment en
          on en.student_id = s.id
          and en.organization_id = s.organization_id
        where s.organization_id = ${scope.organizationId}
          and en.session_id = ${term.sessionId}
          and ${inScope(currentCampusSql('s'), scope.campusScope)}
      )
      select
        (count(*) filter (where included and not charged and has_line))::int as created,
        (count(*) filter (where included and charged))::int as skipped,
        array_agg(distinct class_level_id) as level_ids,
        (
          select json_agg(
            json_build_object('id', picked.id, 'name', picked.first_name || ' ' || picked.last_name)
            order by picked.first_name, picked.last_name, picked.id
          )
          from (
            select id, first_name, last_name
            from cand
            where included and not charged and has_line
            order by first_name, last_name, id
            limit ${options.sampleSize}
          ) picked
        ) as sample
      from cand
    `.execute(this.db);
    return toChargeSummary(rows[0]);
  }

  async feeLines(
    organizationId: string,
    termId: string
  ): Promise<ChargeableFeeLine[]> {
    const rows = await this.db
      .selectFrom('fee_line as f')
      .innerJoin('ledger_account as type', (join) =>
        join
          .onRef('type.id', '=', 'f.ledger_account_id')
          .onRef('type.organization_id', '=', 'f.organization_id')
      )
      .select([
        'f.id',
        'f.term_id',
        'f.class_level_id',
        'f.ledger_account_id',
        'type.code as fee_type_code',
        'f.campus_id',
        'f.name',
        'f.amount_minor',
        'f.applies_to',
        'f.is_optional',
      ])
      .where('f.organization_id', '=', organizationId)
      .where('f.term_id', '=', termId)
      .where('f.retired_at', 'is', null)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      termId: row.term_id,
      classLevelId: row.class_level_id,
      feeTypeId: row.ledger_account_id,
      feeTypeCode: row.fee_type_code,
      campusId: row.campus_id,
      name: row.name,
      amountMinor: Number(row.amount_minor),
      appliesTo: feeAppliesToSchema.parse(row.applies_to),
      isOptional: row.is_optional,
      retiredAt: null,
    }));
  }

  async optedIn(
    organizationId: string,
    enrollmentIds: readonly string[]
  ): Promise<Map<string, Set<string>>> {
    const byEnrollment = new Map<string, Set<string>>();
    for (const ids of chunks(enrollmentIds, INSERT_CHUNK)) {
      const rows = await this.db
        .selectFrom('student_fee_option')
        .select(['enrollment_id', 'ledger_account_id'])
        .where('organization_id', '=', organizationId)
        .where('enrollment_id', 'in', ids)
        .execute();
      for (const row of rows) {
        const held = byEnrollment.get(row.enrollment_id) ?? new Set<string>();
        held.add(row.ledger_account_id);
        byEnrollment.set(row.enrollment_id, held);
      }
    }
    return byEnrollment;
  }

  async discounts(
    organizationId: string,
    studentIds: readonly string[]
  ): Promise<Map<string, DiscountFacts[]>> {
    const byStudent = new Map<string, DiscountFacts[]>();
    for (const ids of chunks(studentIds, INSERT_CHUNK)) {
      for (const [studentId, facts] of await discountFacts(
        this.db,
        organizationId,
        ids
      )) {
        byStudent.set(studentId, facts);
      }
    }
    return byStudent;
  }

  async discountsAccountId(organizationId: string): Promise<string> {
    return systemAccountId(this.db, organizationId, DISCOUNTS_GIVEN_SYSTEM_KEY);
  }

  createRound(input: NewRound): Promise<CreatedRound> {
    return this.db.transaction().execute(async (trx) => {
      const runId = randomUUID();
      const drafts = await this.insertDrafts(trx, input, runId);
      if (drafts.length === 0) {
        return { runId: null, number: null, created: 0 };
      }
      const value = await allocateDocumentNumber(trx, {
        organizationId: input.organizationId,
        kind: 'billing_run',
        year: input.year,
      });
      const number = formatDocumentNumber('billing_run', input.year, value);
      await this.insertRun(trx, { input, runId, number });
      await this.insertLines(trx, input, drafts);
      return { runId, number, created: drafts.length };
    });
  }

  private async insertDrafts(
    trx: Kysely<DB>,
    input: NewRound,
    runId: string
  ): Promise<{ id: string; student_id: string }[]> {
    const inserted: { id: string; student_id: string }[] = [];
    const ordered = input.charges.toSorted((a, b) =>
      a.studentId.localeCompare(b.studentId)
    );
    for (const group of chunks(ordered, INSERT_CHUNK)) {
      const rows = await trx
        .insertInto('invoice')
        .values(
          group.map((charge) => ({
            organization_id: input.organizationId,
            student_id: charge.studentId,
            term_id: input.termId,
            campus_id: charge.campusId,
            billing_run_id: runId,
            kind: 'term',
            status: 'draft',
            created_by: input.userId,
          }))
        )
        .onConflict((conflict) => conflict.doNothing())
        .returning(['id', 'student_id'])
        .execute();
      inserted.push(...rows);
    }
    return inserted;
  }

  private async insertRun(
    trx: Kysely<DB>,
    round: { input: NewRound; runId: string; number: string }
  ): Promise<void> {
    const { input, runId, number } = round;
    await trx
      .insertInto('billing_run')
      .values({
        id: runId,
        organization_id: input.organizationId,
        number,
        term_id: input.termId,
        scope: input.filter.scope,
        scope_campus_id:
          input.filter.scope === 'campus' ? input.filter.campusId : null,
        scope_class_level_id:
          input.filter.scope === 'level' ? input.filter.classLevelId : null,
        status: 'draft',
        created_by: input.userId,
      })
      .execute();
  }

  private async insertLines(
    trx: Kysely<DB>,
    input: NewRound,
    drafts: readonly { id: string; student_id: string }[]
  ): Promise<void> {
    const linesOf = new Map(
      input.charges.map((charge) => [charge.studentId, charge.lines])
    );
    const rows = drafts.flatMap((draft) =>
      (linesOf.get(draft.student_id) ?? []).map((line) => ({
        organization_id: input.organizationId,
        invoice_id: draft.id,
        fee_line_id: line.feeLineId,
        student_discount_id: line.studentDiscountId,
        ledger_account_id: line.ledgerAccountId,
        description: line.description,
        amount_minor: String(line.amountMinor),
      }))
    );
    for (const group of chunks(rows, INSERT_CHUNK)) {
      await trx.insertInto('invoice_line').values(group).execute();
    }
  }

  private chargeTotals(scope: BillingScope) {
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

  private runRows(
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
      ${this.chargeTotals(scope)}
      WHERE br.organization_id = ${scope.organizationId}
        AND agg.charge_count > 0
        ${only}
        ${byStatus}
      ORDER BY br.created_at DESC, br.number DESC
      ${limit}`;
  }

  async listRuns(
    scope: BillingScope,
    query: BillingRunListQuery
  ): Promise<RunPage> {
    const { rows } = await this.runRows(scope, {
      limit: query,
      status: query.status,
    }).execute(this.db);
    return {
      items: rows.map((row) => toSummary(row)),
      total: rows[0]?.total_rows ?? 0,
    };
  }

  async findRun(
    scope: BillingScope,
    id: string
  ): Promise<RunHeader | undefined> {
    const { rows } = await this.runRows(scope, { id }).execute(this.db);
    const row = rows[0];
    return row && toHeader(row);
  }

  issue(input: IssueRound): Promise<RunOutcome> {
    return this.db.transaction().execute(async (trx) => {
      const checked = await this.refuseRun(trx, input);
      if (!checked.ok) {
        return checked.outcome;
      }
      const sent = await this.sendDrafts(trx, input);
      const currency = await schoolCurrency(trx, input.scope.organizationId);
      await this.activity.within(trx).recordMany(
        roundSentActivity(
          financeActor(
            {
              organizationId: input.scope.organizationId,
              userId: input.userId,
              name: input.userName,
            },
            currency
          ),
          { id: input.runId, number: checked.number },
          sent
        )
      );
      await trx
        .updateTable('billing_run')
        .set({
          status: 'issued',
          issued_by: input.userId,
          issued_at: sql<Date>`now()`,
        })
        .where('id', '=', input.runId)
        .where('organization_id', '=', input.scope.organizationId)
        .execute();
      return { status: 'done' };
    });
  }

  cancel(input: RunAction): Promise<RunOutcome> {
    return this.db.transaction().execute(async (trx) => {
      const checked = await this.refuseRun(trx, input);
      if (!checked.ok) {
        return checked.outcome;
      }
      const { organizationId } = input.scope;
      await trx
        .updateTable('invoice')
        .set({ status: 'cancelled' })
        .where('organization_id', '=', organizationId)
        .where('billing_run_id', '=', input.runId)
        .where('status', '=', 'draft')
        .execute();
      await trx
        .updateTable('billing_run')
        .set({
          status: 'cancelled',
          cancelled_by: input.userId,
          cancelled_at: sql<Date>`now()`,
        })
        .where('id', '=', input.runId)
        .where('organization_id', '=', organizationId)
        .execute();
      return { status: 'done' };
    });
  }

  private async refuseRun(
    trx: Kysely<DB>,
    input: RunAction
  ): Promise<RunCheck> {
    const { organizationId, campusScope } = input.scope;
    const run = await trx
      .selectFrom('billing_run')
      .select(['status', 'number'])
      .where('id', '=', input.runId)
      .where('organization_id', '=', organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (run === undefined) {
      return { ok: false, outcome: { status: 'not_found' } };
    }
    const { rows } = await sql<{ total: number; in_scope: number }>`
      SELECT
        count(*)::int AS total,
        (count(*) FILTER (WHERE ${inScope(currentCampusSql('st'), campusScope)}))::int AS in_scope
      FROM invoice i
      JOIN student st ON st.id = i.student_id AND st.organization_id = i.organization_id
      WHERE i.billing_run_id = ${input.runId} AND i.organization_id = ${organizationId}`.execute(
      trx
    );
    const counts = rows[0];
    if (counts === undefined || counts.in_scope === 0) {
      return { ok: false, outcome: { status: 'not_found' } };
    }
    const current = billingRunStatusSchema.parse(run.status);
    if (current !== 'draft') {
      return { ok: false, outcome: { status: 'refused', current } };
    }
    return counts.in_scope === counts.total
      ? { ok: true, number: run.number }
      : { ok: false, outcome: { status: 'out_of_scope' } };
  }

  private async sendDrafts(
    trx: Kysely<DB>,
    input: IssueRound
  ): Promise<CampusAmount[]> {
    const { organizationId } = input.scope;
    const receivableId = await systemAccountId(
      trx,
      organizationId,
      FEES_RECEIVABLE_SYSTEM_KEY
    );
    const drafts = await trx
      .selectFrom('invoice as i')
      .innerJoin('student as st', (join) =>
        join
          .onRef('st.id', '=', 'i.student_id')
          .onRef('st.organization_id', '=', 'i.organization_id')
      )
      .select([
        'i.id',
        'i.student_id',
        'i.campus_id',
        'st.first_name',
        'st.last_name',
        'st.admission_number',
      ])
      .where('i.organization_id', '=', organizationId)
      .where('i.billing_run_id', '=', input.runId)
      .where('i.status', '=', 'draft')
      .execute();
    const linesByInvoice = await this.draftLines(
      trx,
      organizationId,
      drafts.map((row) => row.id)
    );
    const sent: CampusAmount[] = [];
    for (const draft of sendOrder(
      drafts.map((row) => ({
        ...row,
        firstName: row.first_name,
        lastName: row.last_name,
        admissionNumber: row.admission_number,
      }))
    )) {
      const lines = linesByInvoice.get(draft.id) ?? [];
      await this.sendOne(trx, { input, receivableId, draft, lines });
      sent.push({
        campusId: draft.campus_id,
        amountMinor: lines.reduce((sum, line) => sum + line.amountMinor, 0),
      });
    }
    return sent;
  }

  private async draftLines(
    trx: Kysely<DB>,
    organizationId: string,
    invoiceIds: readonly string[]
  ): Promise<Map<string, LedgerChargeLine[]>> {
    const linesByInvoice = new Map<string, LedgerChargeLine[]>();
    if (invoiceIds.length === 0) {
      return linesByInvoice;
    }
    for (const line of await trx
      .selectFrom('invoice_line')
      .select(['invoice_id', 'ledger_account_id', 'amount_minor'])
      .where('organization_id', '=', organizationId)
      .where('invoice_id', 'in', invoiceIds)
      .execute()) {
      const lines = linesByInvoice.get(line.invoice_id) ?? [];
      lines.push({
        ledgerAccountId: line.ledger_account_id,
        amountMinor: Number(line.amount_minor),
      });
      linesByInvoice.set(line.invoice_id, lines);
    }
    return linesByInvoice;
  }

  private async sendOne(
    trx: Kysely<DB>,
    send: {
      input: IssueRound;
      receivableId: string;
      draft: SendableDraft;
      lines: LedgerChargeLine[];
    }
  ): Promise<void> {
    const { input, draft } = send;
    const { organizationId } = input.scope;
    const value = await allocateDocumentNumber(trx, {
      organizationId,
      kind: 'invoice',
      year: input.year,
    });
    const number = formatDocumentNumber('invoice', input.year, value);
    const entryId = await this.postCharge(trx, { ...send, number });
    await trx
      .updateTable('invoice')
      .set({
        status: 'issued',
        number,
        issued_at: sql<Date>`now()`,
        issued_by: input.userId,
        journal_entry_id: entryId,
      })
      .where('id', '=', draft.id)
      .where('organization_id', '=', organizationId)
      .where('status', '=', 'draft')
      .execute();
  }

  private async postCharge(
    trx: Kysely<DB>,
    send: {
      input: IssueRound;
      receivableId: string;
      draft: SendableDraft;
      lines: LedgerChargeLine[];
      number: string;
    }
  ): Promise<string> {
    const { input, draft, number } = send;
    const { organizationId } = input.scope;
    const { entry, replayed } = await this.poster.post(trx, {
      organizationId,
      reference: number,
      kind: 'invoice',
      effectiveOn: input.today,
      memo: `Term fees · ${draft.firstName} ${draft.lastName}`,
      postedBy: input.userId,
      sourceId: draft.id,
      lines: chargePostingLines({
        lines: send.lines,
        receivableId: send.receivableId,
        studentId: draft.student_id,
        campusId: draft.campus_id,
      }),
    });
    if (replayed) {
      throw new Error(`Charge number ${number} was already posted`);
    }
    return entry.id;
  }
}

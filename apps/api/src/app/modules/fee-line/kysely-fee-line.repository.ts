import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  feeAppliesToSchema,
  type FeeLine,
  type FeeSetup,
  type FeeType,
} from '@eduvault/api-contract';
import { inCampusScope } from '../../common/db/in-campus-scope';
import { iso } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { uniqueViolation } from '../../common/db/unique-violation';
import { feeTypeQuery, schoolCurrency } from '../../common/ledger';
import {
  FeeLineRepository,
  type CopyFeeLines,
  type CopyOutcome,
  type FeeLineOutcome,
  type FeeScope,
  type LevelRef,
  type NewFeeLine,
  type TermRef,
} from './fee-line.repository';

const LIVE_LINE_KEY = 'fee_line_live_key';

interface LineRow {
  id: string;
  term_id: string;
  class_level_id: string;
  level_name: string;
  level_sequence: number;
  fee_type_id: string;
  fee_type_code: number;
  fee_type_name: string;
  campus_id: string | null;
  campus_name: string | null;
  name: string;
  amount_minor: string | number | bigint;
  applies_to: string;
  is_optional: boolean;
  retired_at: Date | null;
  created_at: Date;
}

const toLine = (row: LineRow): FeeLine => ({
  id: row.id,
  termId: row.term_id,
  classLevelId: row.class_level_id,
  levelName: row.level_name,
  levelSequence: row.level_sequence,
  feeTypeId: row.fee_type_id,
  feeTypeCode: row.fee_type_code,
  feeTypeName: row.fee_type_name,
  campusId: row.campus_id,
  campusName: row.campus_name,
  name: row.name,
  amountMinor: Number(row.amount_minor),
  appliesTo: feeAppliesToSchema.parse(row.applies_to),
  isOptional: row.is_optional,
  retiredAt: row.retired_at === null ? null : iso(row.retired_at),
  createdAt: iso(row.created_at),
});

interface TermRow {
  id: string;
  name: string;
  school_year_name: string;
  session_id: string;
  starts_on: string;
  ends_on: string;
}

const toTerm = (row: TermRow): TermRef => ({
  id: row.id,
  name: row.name,
  schoolYearName: row.school_year_name,
  sessionId: row.session_id,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
});

@Injectable()
export class KyselyFeeLineRepository extends FeeLineRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  private lines() {
    return this.db
      .selectFrom('fee_line')
      .innerJoin('class_level', (join) =>
        join
          .onRef('class_level.id', '=', 'fee_line.class_level_id')
          .onRef('class_level.organization_id', '=', 'fee_line.organization_id')
      )
      .innerJoin('ledger_account', (join) =>
        join
          .onRef('ledger_account.id', '=', 'fee_line.ledger_account_id')
          .onRef(
            'ledger_account.organization_id',
            '=',
            'fee_line.organization_id'
          )
      )
      .leftJoin('team', 'team.id', 'fee_line.campus_id')
      .select([
        'fee_line.id',
        'fee_line.term_id',
        'fee_line.class_level_id',
        'class_level.name as level_name',
        'class_level.sequence as level_sequence',
        'fee_line.ledger_account_id as fee_type_id',
        'ledger_account.code as fee_type_code',
        'ledger_account.name as fee_type_name',
        'fee_line.campus_id',
        'team.name as campus_name',
        'fee_line.name',
        'fee_line.amount_minor',
        'fee_line.applies_to',
        'fee_line.is_optional',
        'fee_line.retired_at',
        'fee_line.created_at',
      ]);
  }

  async list(
    scope: FeeScope,
    query: { termId: string; includeRetired: boolean }
  ): Promise<FeeLine[]> {
    let lines = this.lines()
      .where('fee_line.organization_id', '=', scope.organizationId)
      .where('fee_line.term_id', '=', query.termId)
      .where((eb) =>
        inCampusScope(eb, 'fee_line.campus_id', {
          scope: scope.campusScope,
          nullMeans: 'all',
        })
      );
    if (!query.includeRetired) {
      lines = lines.where('fee_line.retired_at', 'is', null);
    }
    const rows = await lines
      .orderBy('class_level.sequence')
      .orderBy('ledger_account.code')
      .orderBy('team.name')
      .orderBy('fee_line.id')
      .execute();
    return rows.map((row) => toLine(row));
  }

  async findById(scope: FeeScope, id: string): Promise<FeeLine | undefined> {
    const row = await this.lines()
      .where('fee_line.organization_id', '=', scope.organizationId)
      .where('fee_line.id', '=', id)
      .where((eb) =>
        inCampusScope(eb, 'fee_line.campus_id', {
          scope: scope.campusScope,
          nullMeans: 'all',
        })
      )
      .executeTakeFirst();
    return row && toLine(row);
  }

  private terms() {
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
        'academic_session.name as school_year_name',
        'term.session_id',
        sql<string>`to_char(term.starts_on, 'YYYY-MM-DD')`.as('starts_on'),
        sql<string>`to_char(term.ends_on, 'YYYY-MM-DD')`.as('ends_on'),
      ]);
  }

  async findTerm(
    organizationId: string,
    termId: string
  ): Promise<TermRef | undefined> {
    const row = await this.terms()
      .where('term.organization_id', '=', organizationId)
      .where('term.id', '=', termId)
      .executeTakeFirst();
    return row && toTerm(row);
  }

  async previousTerm(
    organizationId: string,
    termId: string
  ): Promise<TermRef | undefined> {
    const row = await this.terms()
      .where('term.organization_id', '=', organizationId)
      .where(
        'term.starts_on',
        '<',
        this.db
          .selectFrom('term as target')
          .select('target.starts_on')
          .where('target.organization_id', '=', organizationId)
          .where('target.id', '=', termId)
      )
      .orderBy('term.starts_on', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row && toTerm(row);
  }

  async liveLineCount(organizationId: string, termId: string): Promise<number> {
    const row = await this.db
      .selectFrom('fee_line')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('organization_id', '=', organizationId)
      .where('term_id', '=', termId)
      .where('retired_at', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async copyLines(input: CopyFeeLines): Promise<CopyOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('fee_line')
          .select('id')
          .where('organization_id', '=', input.organizationId)
          .where('term_id', '=', input.toTermId)
          .where('retired_at', 'is', null)
          .limit(1)
          .executeTakeFirst();
        if (existing !== undefined) {
          return { status: 'not_empty' };
        }
        const result = await trx
          .insertInto('fee_line')
          .columns([
            'organization_id',
            'term_id',
            'class_level_id',
            'ledger_account_id',
            'campus_id',
            'name',
            'amount_minor',
            'applies_to',
            'is_optional',
            'created_by',
          ])
          .expression((eb) =>
            eb
              .selectFrom('fee_line')
              .select([
                'organization_id',
                eb.val(input.toTermId).as('term_id'),
                'class_level_id',
                'ledger_account_id',
                'campus_id',
                'name',
                'amount_minor',
                'applies_to',
                'is_optional',
                eb.val(input.userId).as('created_by'),
              ])
              .where('organization_id', '=', input.organizationId)
              .where('term_id', '=', input.fromTermId)
              .where('retired_at', 'is', null)
          )
          .executeTakeFirstOrThrow();
        const copied = Number(result.numInsertedOrUpdatedRows ?? 0n);
        return copied === 0
          ? { status: 'source_empty' }
          : { status: 'copied', copied };
      });
    } catch (error) {
      if (uniqueViolation(error) === LIVE_LINE_KEY) {
        return { status: 'not_empty' };
      }
      throw error;
    }
  }

  currency(organizationId: string): Promise<string> {
    return schoolCurrency(this.db, organizationId);
  }

  async setup(organizationId: string): Promise<FeeSetup> {
    const [terms, levels] = await Promise.all([
      this.db
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
          'academic_session.name as school_year_name',
          'term.is_current',
        ])
        .where('term.organization_id', '=', organizationId)
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
        .execute(),
      this.db
        .selectFrom('class_level')
        .select(['id', 'name', 'sequence'])
        .where('organization_id', '=', organizationId)
        .orderBy('sequence')
        .execute(),
    ]);
    return {
      terms: terms.map((term) => ({
        id: term.id,
        name: term.name,
        schoolYearName: term.school_year_name,
        isCurrent: term.is_current,
      })),
      levels,
    };
  }

  findFeeType(
    organizationId: string,
    id: string
  ): Promise<FeeType | undefined> {
    return feeTypeQuery(this.db, organizationId)
      .where('ledger_account.id', '=', id)
      .executeTakeFirst();
  }

  async hasLedgerAccount(organizationId: string, id: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('ledger_account')
      .select('id')
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row !== undefined;
  }

  findLevel(organizationId: string, id: string): Promise<LevelRef | undefined> {
    return this.db
      .selectFrom('class_level')
      .select(['id', 'name'])
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async create(input: NewFeeLine): Promise<FeeLineOutcome> {
    try {
      const inserted = await this.db
        .insertInto('fee_line')
        .values({
          organization_id: input.organizationId,
          term_id: input.termId,
          class_level_id: input.classLevelId,
          ledger_account_id: input.feeTypeId,
          campus_id: input.campusId,
          name: input.name,
          amount_minor: String(input.amountMinor),
          applies_to: input.appliesTo,
          is_optional: input.isOptional,
          created_by: input.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const row = await this.lines()
        .where('fee_line.id', '=', inserted.id)
        .where('fee_line.organization_id', '=', input.organizationId)
        .executeTakeFirstOrThrow();
      return { status: 'saved', line: toLine(row) };
    } catch (error) {
      if (uniqueViolation(error) === LIVE_LINE_KEY) {
        return { status: 'duplicate' };
      }
      throw error;
    }
  }

  async updateAmount(
    organizationId: string,
    id: string,
    amountMinor: number
  ): Promise<FeeLine | undefined> {
    const changed = await this.db
      .updateTable('fee_line')
      .set({ amount_minor: String(amountMinor), updated_at: sql<Date>`now()` })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('retired_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    return changed && this.reload(organizationId, changed.id);
  }

  async retire(
    organizationId: string,
    id: string
  ): Promise<FeeLine | undefined> {
    const changed = await this.db
      .updateTable('fee_line')
      .set({ retired_at: sql<Date>`now()` })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('retired_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    return changed && this.reload(organizationId, changed.id);
  }

  private async reload(organizationId: string, id: string): Promise<FeeLine> {
    const row = await this.lines()
      .where('fee_line.organization_id', '=', organizationId)
      .where('fee_line.id', '=', id)
      .executeTakeFirstOrThrow();
    return toLine(row);
  }
}

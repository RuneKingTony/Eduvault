import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  DISCOUNTS_GIVEN_SYSTEM_KEY,
  feeAppliesToSchema,
} from '@eduvault/api-contract';
import { chunks, day } from '../../common/db/rows';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import {
  discountFacts,
  type ChargeableFeeLine,
  type DiscountFacts,
} from '../../common/fees';
import { systemAccountId } from '../../common/ledger';
import { currentCampusSql, inScope } from '../../common/students';
import {
  BillingPlanRepository,
  type ChargeSummary,
  type ChargeSummaryOptions,
  type LevelRef,
  type RoundCandidateOptions,
  type RoundCandidates,
  type TermInfo,
} from './billing-plan.repository';
import type { OrgScope } from '../../common/scope';
import {
  chargedSql,
  hasLineSql,
  includedSql,
  latestPlacementCampusSql,
  roundFilterSql,
  termPlacementCampusSql,
} from './kysely-billing-candidate-sql.repository';
import type { RoundCandidate } from './round-plan';

const INSERT_CHUNK = 500;

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

@Injectable()
export class KyselyBillingPlanRepository extends BillingPlanRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
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
    scope: OrgScope,
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
    scope: OrgScope,
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
}

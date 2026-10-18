import { Inject, Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import {
  enrollmentStatusSchema,
  type StudentCounts,
  type StudentDetail,
  type StudentHistory,
  type StudentRow,
  type StudentTab,
  type UpdateStudentInput,
} from '@eduvault/api-contract';
import { Clock, schoolToday } from '../../common/clock';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { invoiceTotalSql } from '../../common/fees';
import { receivableBalanceSql } from '../../common/ledger';
import {
  currentTermWindowCte,
  termPaymentPredicate,
} from '../../common/payments';
import { visibleStudentsCte } from '../../common/students';
import { exitReasonLabel } from './exit-reasons';
import {
  canUndoLeaving,
  isDueToBeLeft,
  isNewIntake,
  lifeOf,
  weeksAway,
} from './lifecycle';
import {
  StudentRepository,
  type StudentDetailTarget,
  type StudentListParams,
  type StudentListResult,
} from './student.repository';
import type { StudentVisibility } from './visibility';

interface RowFacts {
  id: string;
  first_name: string;
  last_name: string;
  gender: 'F' | 'M';
  admission_number: string;
  date_of_birth: string;
  admitted_on: string;
  home_campus_id: string;
  home_campus_name: string;
  campus_id: string;
  campus_name: string;
  arm_id: string | null;
  class_name: string | null;
  new_in_session: boolean | null;
  not_seen_since: string | null;
  not_seen_by: string | null;
  not_seen_by_name: string | null;
  not_seen_note: string | null;
  exit_kind: 'left' | 'graduated' | null;
  exit_reason: string | null;
  exit_note: string | null;
  last_day: string | null;
  archived_on: string | null;
  archived_by: string | null;
  archived_term_id: string | null;
  archived_by_name: string | null;
  graduated_session_name: string | null;
  latest_class_name: string | null;
  latest_level_name: string | null;
  payers: string[] | null;
  balance_minor: string | null;
  charged_minor: string | null;
  paid_minor: string | null;
  currency: string | null;
}

interface CountsRow {
  active: number;
  new: number;
  inactive: number;
  left: number;
  graduated: number;
  total: number;
}

type Nullable<T> = { [K in keyof T]: T[K] | null };

type ListRow = CountsRow & Nullable<RowFacts>;

const TAB_PREDICATES: Record<StudentTab, RawBuilder<boolean>> = {
  active: sql<boolean>`life = 'active'`,
  new: sql<boolean>`life = 'active' AND COALESCE(new_in_session, FALSE)`,
  inactive: sql<boolean>`life = 'inactive'`,
  left: sql<boolean>`life = 'left'`,
  graduated: sql<boolean>`life = 'graduated'`,
};

const TAB_ORDERS: Record<StudentTab, RawBuilder<unknown>> = {
  active: sql`last_name, first_name, id`,
  new: sql`last_name, first_name, id`,
  inactive: sql`not_seen_since ASC, last_name, first_name, id`,
  left: sql`last_day DESC NULLS LAST, last_name, first_name, id`,
  graduated: sql`archived_at DESC, last_name, first_name, id`,
};

const searchPredicate = (params: StudentListParams): RawBuilder<boolean> => {
  const q = params.q ?? '';
  if (q === '') {
    return sql<boolean>`TRUE`;
  }
  const guardianMatch = params.withGuardians
    ? sql`OR EXISTS (
        SELECT 1
        FROM guardian_student gs
        JOIN guardian g ON g.id = gs.guardian_id AND g.organization_id = gs.organization_id
        WHERE gs.student_id = visible.id
          AND (strpos(lower(g.full_name), lower(${q})) > 0
            OR strpos(lower(g.phone), lower(${q})) > 0)
      )`
    : sql``;
  return sql<boolean>`(
    strpos(lower(first_name || ' ' || last_name), lower(${q})) > 0
    OR strpos(lower(admission_number), lower(${q})) > 0
    ${guardianMatch}
  )`;
};

const filterPredicate = (params: StudentListParams): RawBuilder<boolean> => {
  const campus =
    params.campusId === undefined
      ? sql``
      : sql`AND campus_id = ${params.campusId}`;
  const level =
    params.levelId === undefined
      ? sql``
      : sql`AND latest_level_id = ${params.levelId}`;
  return sql<boolean>`${TAB_PREDICATES[params.tab]} ${campus} ${level} AND ${searchPredicate(params)}`;
};

const countsCte = sql`
  counts AS (
    SELECT
      (count(*) FILTER (WHERE life = 'active'))::int AS active,
      (count(*) FILTER (WHERE life = 'active' AND COALESCE(new_in_session, FALSE)))::int AS "new",
      (count(*) FILTER (WHERE life = 'inactive'))::int AS inactive,
      (count(*) FILTER (WHERE life = 'left'))::int AS "left",
      (count(*) FILTER (WHERE life = 'graduated'))::int AS graduated,
      (SELECT count(*) FROM filtered)::int AS total
    FROM visible
  )`;

const financeLateral = (withFinance: boolean): RawBuilder<unknown> => {
  const enabled = withFinance ? sql`TRUE` : sql`FALSE`;
  return sql`
    LEFT JOIN LATERAL (
      SELECT
        ${receivableBalanceSql('page')}::text AS balance_minor,
        CASE WHEN tw.term_id IS NULL THEN NULL ELSE (
          SELECT COALESCE(sum(${invoiceTotalSql('i')}), 0)::text
          FROM invoice i
          WHERE i.organization_id = page.organization_id
            AND i.student_id = page.id
            AND i.term_id = tw.term_id
            AND i.kind = 'term' AND i.status = 'issued'
        ) END AS charged_minor,
        CASE WHEN tw.term_id IS NULL THEN NULL ELSE (
          SELECT COALESCE(sum(pa.amount_minor), 0)::text
          FROM payment_allocation pa
          JOIN payment p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
          WHERE pa.organization_id = page.organization_id
            AND pa.student_id = page.id
            AND ${termPaymentPredicate(sql`tw.since_day`, sql`tw.ends_on`)}
        ) END AS paid_minor
      FROM (SELECT 1) one
      LEFT JOIN term_window tw ON TRUE
    ) fin ON ${enabled}`;
};

const currencySql = (
  organizationId: string,
  withFinance: boolean
): RawBuilder<string | null> =>
  withFinance
    ? sql<string>`(SELECT sa.currency FROM school_account sa WHERE sa.organization_id = ${organizationId})`
    : sql<null>`NULL::text`;

interface RowsOptions {
  withGuardians: boolean;
  withFinance: boolean;
}

const rowsCte = ({
  withGuardians,
  withFinance,
}: RowsOptions): RawBuilder<unknown> => sql`
  page_rows AS (
    SELECT
      page.*,
      home.name AS home_campus_name,
      campus.name AS campus_name,
      arm_level.name || ' ' || arm.name AS class_name,
      nsb.name AS not_seen_by_name,
      ab.name AS archived_by_name,
      grad.name AS graduated_session_name,
      latest.class_name AS latest_class_name,
      latest.level_name AS latest_level_name,
      payer.payers,
      fin.balance_minor,
      fin.charged_minor,
      fin.paid_minor
    FROM page
    JOIN team home ON home.id = page.home_campus_id
    JOIN team campus ON campus.id = page.campus_id
    LEFT JOIN class_arm arm ON arm.id = page.arm_id
    LEFT JOIN class_level arm_level ON arm_level.id = arm.class_level_id
    LEFT JOIN "user" nsb ON nsb.id = page.not_seen_by
    LEFT JOIN "user" ab ON ab.id = page.archived_by
    LEFT JOIN academic_session grad ON grad.id = page.graduated_session_id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          (
            SELECT pl.name || ' ' || pa.name
            FROM enrollment_placement ep
            JOIN class_arm pa ON pa.id = ep.class_arm_id
            JOIN class_level pl ON pl.id = pa.class_level_id
            JOIN term pt ON pt.id = ep.term_id
            WHERE ep.enrollment_id = en.id
            ORDER BY pt.starts_on DESC
            LIMIT 1
          ),
          lvl.name
        ) AS class_name,
        lvl.name AS level_name
      FROM student_enrollment en
      JOIN academic_session sess ON sess.id = en.session_id
      JOIN class_level lvl ON lvl.id = en.class_level_id
      WHERE en.student_id = page.id AND en.organization_id = page.organization_id
      ORDER BY sess.starts_on DESC
      LIMIT 1
    ) latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT array_agg(g.full_name ORDER BY g.full_name) AS payers
      FROM guardian_student gs
      JOIN guardian g ON g.id = gs.guardian_id AND g.organization_id = gs.organization_id
      WHERE gs.student_id = page.id AND gs.pays_fees
    ) payer ON ${withGuardians ? sql`TRUE` : sql`FALSE`}
    ${financeLateral(withFinance)}
  )`;

interface ListInput {
  organizationId: string;
  scope: StudentVisibility;
  params: StudentListParams;
  today: string;
}

function listStatement({ organizationId, scope, params, today }: ListInput) {
  const offset = (params.page - 1) * params.pageSize;
  return sql<ListRow>`
    WITH ${visibleStudentsCte({ organizationId, ...scope, today })},
    ${currentTermWindowCte(organizationId)},
    filtered AS (SELECT visible.* FROM visible WHERE ${filterPredicate(params)}),
    ${countsCte},
    page AS (
      SELECT filtered.*, row_number() OVER (ORDER BY ${TAB_ORDERS[params.tab]}) AS position
      FROM filtered
      ORDER BY ${TAB_ORDERS[params.tab]}
      LIMIT ${params.pageSize} OFFSET ${offset}
    ),
    ${rowsCte(params)}
    SELECT counts.*, page_rows.*, ${currencySql(organizationId, params.withFinance)} AS currency
    FROM counts
    LEFT JOIN page_rows ON TRUE
    ORDER BY page_rows.position NULLS LAST`;
}

interface DetailInput extends StudentDetailTarget {
  organizationId: string;
  scope: StudentVisibility;
  today: string;
}

function detailStatement({
  organizationId,
  scope,
  id,
  withFinance,
  today,
}: DetailInput) {
  return sql<RowFacts>`
    WITH ${visibleStudentsCte({ organizationId, ...scope, today, studentId: id })},
    ${currentTermWindowCte(organizationId)},
    page AS (SELECT visible.*, 1 AS position FROM visible),
    ${rowsCte({ withGuardians: false, withFinance })}
    SELECT page_rows.*, ${currencySql(organizationId, withFinance)} AS currency FROM page_rows`;
}

function toStudentRow(row: RowFacts, today: string): StudentRow {
  const facts = {
    notSeenSince: row.not_seen_since,
    exitKind: row.exit_kind,
    newInCurrentSession: row.new_in_session ?? false,
    today,
  };
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    admissionNumber: row.admission_number,
    life: lifeOf(facts),
    dueLeft: isDueToBeLeft(facts),
    isNewIntake: isNewIntake(facts),
    notSeenSince: row.not_seen_since,
    notSeenBy:
      row.not_seen_by === null
        ? null
        : { id: row.not_seen_by, name: row.not_seen_by_name ?? '' },
    weeksAway: weeksAway(facts),
    currentPlacement:
      row.arm_id === null
        ? null
        : {
            armId: row.arm_id,
            className: row.class_name ?? '',
            campusId: row.campus_id,
            campusName: row.campus_name,
          },
    latestClassName: row.latest_class_name,
    effectiveCampus: { id: row.campus_id, name: row.campus_name },
    admittedOn: row.admitted_on,
    exit: toExit(row),
    graduatedSessionName: row.graduated_session_name,
    ...(row.payers === null ? {} : { payers: row.payers }),
    ...toFinance(row),
  };
}

const toCurrency = (row: { currency: string | null }) =>
  row.currency === null ? {} : { currency: row.currency };

const minorOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

function toFinance(
  row: RowFacts
): Pick<
  StudentRow,
  'balanceMinor' | 'chargedThisTermMinor' | 'paidThisTermMinor'
> {
  if (row.balance_minor === null) {
    return {};
  }
  return {
    balanceMinor: Number(row.balance_minor),
    chargedThisTermMinor: minorOrNull(row.charged_minor),
    paidThisTermMinor: minorOrNull(row.paid_minor),
  };
}

function toExit(row: RowFacts): StudentRow['exit'] {
  if (row.exit_kind === null || row.archived_on === null) {
    return null;
  }
  return {
    kind: row.exit_kind,
    on: row.exit_kind === 'left' ? row.last_day : row.archived_on,
    reason: exitReasonLabel(row.exit_reason ?? 'other', row.latest_level_name),
    note: row.exit_note,
    recordedOn: row.archived_on,
  };
}

type TermAbilities = Pick<
  StudentDetail,
  'nextTerm' | 'canMoveForNextTerm' | 'canUndoLeaving'
>;

const NO_TERM: TermFactsRow = {
  current_term_id: null,
  next_id: null,
  next_name: null,
  enrolment_id: null,
  has_next_placement: true,
};

function toTermAbilities(
  row: RowFacts,
  term: TermFactsRow = NO_TERM
): TermAbilities {
  const canPlace =
    term.next_id !== null &&
    term.enrolment_id !== null &&
    !term.has_next_placement;
  return {
    nextTerm:
      term.next_id === null
        ? null
        : { id: term.next_id, name: term.next_name ?? '' },
    canMoveForNextTerm: row.exit_kind === null && canPlace,
    canUndoLeaving: canUndoLeaving({
      exitKind: row.exit_kind,
      archivedTermId: row.archived_term_id,
      currentTermId: term.current_term_id,
    }),
  };
}

const toCounts = (row: CountsRow): StudentCounts => ({
  active: row.active,
  new: row.new,
  inactive: row.inactive,
  left: row.left,
  graduated: row.graduated,
});

const hasStudent = (row: ListRow): row is CountsRow & RowFacts =>
  row.id !== null;

interface TermFactsRow {
  current_term_id: string | null;
  next_id: string | null;
  next_name: string | null;
  enrolment_id: string | null;
  has_next_placement: boolean;
}

interface HistoryRow {
  enrollment_id: string;
  session_id: string;
  session_name: string;
  level_name: string;
  status: string;
  is_new_student: boolean;
}

interface PlacementRow {
  enrollment_id: string;
  term_name: string;
  class_name: string;
  campus_name: string;
}

@Injectable()
export class KyselyStudentRepository extends StudentRepository {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Database,
    private readonly clock: Clock
  ) {
    super();
  }

  async list(
    organizationId: string,
    scope: StudentVisibility,
    params: StudentListParams
  ): Promise<StudentListResult> {
    const today = schoolToday({ organizationId }, this.clock);
    const { rows } = await listStatement({
      organizationId,
      scope,
      params,
      today,
    }).execute(this.db);
    const [first] = rows;
    if (first === undefined) {
      throw new Error('The student list statement returned no rows');
    }
    return {
      items: rows
        .filter((row) => hasStudent(row))
        .map((row) => toStudentRow(row, today)),
      total: first.total,
      counts: toCounts(first),
      ...toCurrency(first),
    };
  }

  async findDetail(
    organizationId: string,
    scope: StudentVisibility,
    { id, withFinance }: StudentDetailTarget
  ): Promise<StudentDetail | undefined> {
    const today = schoolToday({ organizationId }, this.clock);
    const { rows } = await detailStatement({
      organizationId,
      scope,
      id,
      withFinance,
      today,
    }).execute(this.db);
    const [row] = rows;
    if (row === undefined) {
      return undefined;
    }
    const [history, portalLogin, term] = await Promise.all([
      this.history(organizationId, id),
      this.portalLogin(organizationId, row),
      this.termFacts(organizationId, id),
    ]);
    return {
      ...toStudentRow(row, today),
      gender: row.gender,
      dateOfBirth: row.date_of_birth,
      homeCampus: { id: row.home_campus_id, name: row.home_campus_name },
      portalLogin,
      notSeenNote: row.not_seen_note,
      archivedBy:
        row.archived_by === null
          ? null
          : { id: row.archived_by, name: row.archived_by_name ?? '' },
      history,
      ...toTermAbilities(row, term),
      ...toCurrency(row),
    };
  }

  async isVisible(
    organizationId: string,
    scope: StudentVisibility,
    id: string
  ): Promise<boolean> {
    const today = schoolToday({ organizationId }, this.clock);
    const { rows } = await sql<{ id: string }>`
      WITH ${visibleStudentsCte({ organizationId, ...scope, today, studentId: id })}
      SELECT id FROM visible`.execute(this.db);
    return rows.length > 0;
  }

  today(organizationId: string): string {
    return schoolToday({ organizationId }, this.clock);
  }

  async update(
    organizationId: string,
    id: string,
    patch: UpdateStudentInput
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const row = await trx
        .updateTable('student')
        .set({
          ...(patch.firstName === undefined
            ? {}
            : { first_name: patch.firstName }),
          ...(patch.lastName === undefined
            ? {}
            : { last_name: patch.lastName }),
          ...(patch.gender === undefined ? {} : { gender: patch.gender }),
          ...(patch.dateOfBirth === undefined
            ? {}
            : { date_of_birth: patch.dateOfBirth }),
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .where('organization_id', '=', organizationId)
        .returning(['user_id', 'first_name', 'last_name'])
        .executeTakeFirst();
      const userId = row?.user_id ?? null;
      if (row !== undefined && userId !== null) {
        await trx
          .updateTable('user')
          .set({ name: `${row.first_name} ${row.last_name}` })
          .where('id', '=', userId)
          .execute();
      }
    });
  }

  private async termFacts(
    organizationId: string,
    studentId: string
  ): Promise<TermFactsRow | undefined> {
    const { rows } = await sql<TermFactsRow>`
      SELECT
        cur.id AS current_term_id,
        nxt.id AS next_id,
        nxt.name AS next_name,
        en.id AS enrolment_id,
        EXISTS (
          SELECT 1
          FROM enrollment_placement p
          WHERE p.enrollment_id = en.id AND p.term_id = nxt.id
        ) AS has_next_placement
      FROM term cur
      LEFT JOIN term nxt
        ON nxt.organization_id = cur.organization_id
        AND nxt.session_id = cur.session_id
        AND nxt.sequence = cur.sequence + 1
      LEFT JOIN student_enrollment en
        ON en.organization_id = cur.organization_id
        AND en.student_id = ${studentId}::uuid
        AND en.session_id = cur.session_id
        AND en.status = 'active'
      WHERE cur.organization_id = ${organizationId} AND cur.is_current`.execute(
      this.db
    );
    return rows[0];
  }

  private async portalLogin(
    organizationId: string,
    row: RowFacts
  ): Promise<StudentDetail['portalLogin']> {
    const found = await this.db
      .selectFrom('student')
      .innerJoin('user', 'user.id', 'student.user_id')
      .leftJoin('member', (join) =>
        join
          .onRef('member.userId', '=', 'user.id')
          .on('member.organizationId', '=', organizationId)
      )
      .select(['user.username', 'member.role'])
      .where('student.id', '=', row.id)
      .where('student.organization_id', '=', organizationId)
      .executeTakeFirst();
    const username = found?.username ?? null;
    if (username === null) {
      return null;
    }
    const roles = (found?.role ?? '').split(',').map((role) => role.trim());
    return { username, active: roles.includes('student') };
  }

  private async history(
    organizationId: string,
    studentId: string
  ): Promise<StudentHistory[]> {
    const enrolments = await sql<HistoryRow>`
      SELECT
        e.id AS enrollment_id,
        sess.id AS session_id,
        sess.name AS session_name,
        lvl.name AS level_name,
        e.status,
        e.is_new_student
      FROM student_enrollment e
      JOIN academic_session sess ON sess.id = e.session_id
      JOIN class_level lvl ON lvl.id = e.class_level_id
      WHERE e.student_id = ${studentId} AND e.organization_id = ${organizationId}
      ORDER BY sess.starts_on DESC`.execute(this.db);
    const placements = await sql<PlacementRow>`
      SELECT
        ep.enrollment_id,
        t.name AS term_name,
        lvl.name || ' ' || arm.name AS class_name,
        campus.name AS campus_name
      FROM enrollment_placement ep
      JOIN student_enrollment e ON e.id = ep.enrollment_id
      JOIN term t ON t.id = ep.term_id
      JOIN class_arm arm ON arm.id = ep.class_arm_id
      JOIN class_level lvl ON lvl.id = arm.class_level_id
      JOIN team campus ON campus.id = ep.campus_id
      WHERE e.student_id = ${studentId} AND e.organization_id = ${organizationId}
      ORDER BY t.starts_on`.execute(this.db);
    return enrolments.rows.map((enrolment) => ({
      sessionId: enrolment.session_id,
      sessionName: enrolment.session_name,
      levelName: enrolment.level_name,
      status: enrollmentStatusSchema.parse(enrolment.status),
      isNew: enrolment.is_new_student,
      placements: placements.rows
        .filter(
          (placement) => placement.enrollment_id === enrolment.enrollment_id
        )
        .map((placement) => ({
          termName: placement.term_name,
          className: placement.class_name,
          campusName: placement.campus_name,
        })),
    }));
  }
}

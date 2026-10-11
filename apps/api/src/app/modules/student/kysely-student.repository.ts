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
import { visibleStudentsCte } from '../../common/students';
import { exitReasonLabel } from './exit-reasons';
import { isDueToBeLeft, isNewIntake, lifeOf, weeksAway } from './lifecycle';
import {
  StudentRepository,
  type StudentListParams,
  type StudentListResult,
} from './student.repository';
import type { StudentScope } from './visibility';

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
  archived_by_name: string | null;
  graduated_session_name: string | null;
  latest_class_name: string | null;
  latest_level_name: string | null;
  payers: string[] | null;
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

const rowsCte = (withGuardians: boolean): RawBuilder<unknown> => sql`
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
      payer.payers
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
  )`;

interface ListInput {
  organizationId: string;
  scope: StudentScope;
  params: StudentListParams;
  today: string;
}

function listStatement({ organizationId, scope, params, today }: ListInput) {
  const offset = (params.page - 1) * params.pageSize;
  return sql<ListRow>`
    WITH ${visibleStudentsCte({ organizationId, ...scope, today })},
    filtered AS (SELECT visible.* FROM visible WHERE ${filterPredicate(params)}),
    ${countsCte},
    page AS (
      SELECT filtered.*, row_number() OVER (ORDER BY ${TAB_ORDERS[params.tab]}) AS position
      FROM filtered
      ORDER BY ${TAB_ORDERS[params.tab]}
      LIMIT ${params.pageSize} OFFSET ${offset}
    ),
    ${rowsCte(params.withGuardians)}
    SELECT counts.*, page_rows.*
    FROM counts
    LEFT JOIN page_rows ON TRUE
    ORDER BY page_rows.position NULLS LAST`;
}

interface DetailInput {
  organizationId: string;
  scope: StudentScope;
  id: string;
  today: string;
}

function detailStatement({ organizationId, scope, id, today }: DetailInput) {
  return sql<RowFacts>`
    WITH ${visibleStudentsCte({ organizationId, ...scope, today, studentId: id })},
    page AS (SELECT visible.*, 1 AS position FROM visible),
    ${rowsCte(false)}
    SELECT page_rows.* FROM page_rows`;
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

const toCounts = (row: CountsRow): StudentCounts => ({
  active: row.active,
  new: row.new,
  inactive: row.inactive,
  left: row.left,
  graduated: row.graduated,
});

const hasStudent = (row: ListRow): row is CountsRow & RowFacts =>
  row.id !== null;

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
    scope: StudentScope,
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
    };
  }

  async findDetail(
    organizationId: string,
    scope: StudentScope,
    id: string
  ): Promise<StudentDetail | undefined> {
    const today = schoolToday({ organizationId }, this.clock);
    const { rows } = await detailStatement({
      organizationId,
      scope,
      id,
      today,
    }).execute(this.db);
    const [row] = rows;
    if (row === undefined) {
      return undefined;
    }
    const [history, portalLogin] = await Promise.all([
      this.history(organizationId, id),
      this.portalLogin(organizationId, row),
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
      nextTerm: null,
      canMoveForNextTerm: false,
      canUndoLeaving: false,
    };
  }

  async update(
    organizationId: string,
    id: string,
    patch: UpdateStudentInput
  ): Promise<void> {
    await this.db
      .updateTable('student')
      .set({
        ...(patch.firstName === undefined
          ? {}
          : { first_name: patch.firstName }),
        ...(patch.lastName === undefined ? {} : { last_name: patch.lastName }),
        ...(patch.gender === undefined ? {} : { gender: patch.gender }),
        ...(patch.dateOfBirth === undefined
          ? {}
          : { date_of_birth: patch.dateOfBirth }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
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

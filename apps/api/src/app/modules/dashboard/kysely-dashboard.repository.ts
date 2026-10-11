import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import {
  DASHBOARD_SAMPLE_SIZE,
  type DashboardRoll,
  type MyClass,
  type Scope,
} from '@eduvault/api-contract';
import { DUE_LEFT_AFTER_DAYS } from '@eduvault/shared';
import { KYSELY_TOKEN, type Database } from '../../common/db/tokens';
import { inScope, visibleStudentsCte } from '../../common/students';
import {
  DashboardRepository,
  type DashboardScope,
  type Named,
  type NotInClass,
  type RolelessMember,
  type Sampled,
} from './dashboard.repository';

interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  not_seen_since: string | null;
  total: number;
}

interface NotInClassRow extends PersonRow {
  without_year: number;
}

interface ArmRow {
  id: string;
  name: string;
  total: number;
}

interface RollRow {
  active: number;
  new_intakes: number;
  inactive: number;
  due_left: number;
  left: number;
  left_this_term: number;
  graduated: number;
}

interface MyClassRow {
  arm_id: string;
  name: string;
  campus_name: string;
  student_count: number;
  is_class_teacher: boolean;
  samples: Named[] | null;
}

const fullName = (row: PersonRow): Named => ({
  id: row.id,
  name: `${row.first_name} ${row.last_name}`,
});

const EMPTY_ROLL: RollRow = {
  active: 0,
  new_intakes: 0,
  inactive: 0,
  due_left: 0,
  left: 0,
  left_this_term: 0,
  graduated: 0,
};

const toRoll = (row: RollRow, campusNames: string[] | null): DashboardRoll => ({
  active: row.active,
  newIntakes: row.new_intakes,
  inactive: row.inactive,
  dueLeft: row.due_left,
  left: row.left,
  leftThisTerm: row.left_this_term,
  graduated: row.graduated,
  campusNames,
});

const countOf = (rows: readonly { total: number }[]): number =>
  rows[0]?.total ?? 0;

@Injectable()
export class KyselyDashboardRepository extends DashboardRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Database) {
    super();
  }

  async hasCurrentTerm(organizationId: string): Promise<boolean> {
    const { rows } = await sql<{ id: string }>`
      SELECT id FROM term
      WHERE organization_id = ${organizationId} AND is_current
      LIMIT 1`.execute(this.db);
    return rows.length > 0;
  }

  async dueLeft(scope: DashboardScope): Promise<Sampled<Named>> {
    const { rows } = await sql<PersonRow>`
      WITH ${visibleStudentsCte(scope)}
      SELECT id, first_name, last_name, not_seen_since, count(*) OVER ()::int AS total
      FROM visible
      WHERE life = 'inactive'
        AND (${scope.today}::date - not_seen_since::date) >= ${DUE_LEFT_AFTER_DAYS}
      ORDER BY not_seen_since, last_name, first_name, id
      LIMIT ${DASHBOARD_SAMPLE_SIZE}`.execute(this.db);
    return { count: countOf(rows), samples: rows.map((row) => fullName(row)) };
  }

  async notSeen(
    scope: DashboardScope
  ): Promise<Sampled<Named & { notSeenSince: string }>> {
    const { rows } = await sql<PersonRow>`
      WITH ${visibleStudentsCte(scope)}
      SELECT id, first_name, last_name, not_seen_since, count(*) OVER ()::int AS total
      FROM visible
      WHERE life = 'active' AND not_seen_since IS NOT NULL
      ORDER BY not_seen_since, last_name, first_name, id
      LIMIT ${DASHBOARD_SAMPLE_SIZE}`.execute(this.db);
    return {
      count: countOf(rows),
      samples: rows.map((row) => ({
        ...fullName(row),
        notSeenSince: row.not_seen_since ?? '',
      })),
    };
  }

  async notInClass(scope: DashboardScope): Promise<NotInClass> {
    const { rows } = await sql<NotInClassRow>`
      WITH ${visibleStudentsCte(scope)},
      unplaced AS (
        SELECT
          v.id,
          v.first_name,
          v.last_name,
          NOT EXISTS (
            SELECT 1
            FROM cur
            JOIN student_enrollment e ON e.session_id = cur.session_id
            WHERE e.student_id = v.id AND e.organization_id = v.organization_id
          ) AS no_year
        FROM visible v
        WHERE v.life = 'active' AND v.arm_id IS NULL
      )
      SELECT
        id,
        first_name,
        last_name,
        NULL AS not_seen_since,
        count(*) OVER ()::int AS total,
        (count(*) FILTER (WHERE no_year) OVER ())::int AS without_year
      FROM unplaced
      ORDER BY last_name, first_name, id
      LIMIT ${DASHBOARD_SAMPLE_SIZE}`.execute(this.db);
    return {
      count: countOf(rows),
      withoutCurrentYearEnrolment: rows[0]?.without_year ?? 0,
      samples: rows.map((row) => fullName(row)),
    };
  }

  async noClassTeacher(scope: DashboardScope): Promise<Sampled<Named>> {
    const { rows } = await sql<ArmRow>`
      SELECT
        a.id,
        l.name || ' ' || a.name AS name,
        count(*) OVER ()::int AS total
      FROM class_arm a
      JOIN class_level l ON l.id = a.class_level_id AND l.organization_id = a.organization_id
      JOIN term cur ON cur.organization_id = a.organization_id AND cur.is_current
      WHERE a.organization_id = ${scope.organizationId}
        AND a.retired_at IS NULL
        AND ${inScope(sql`a.campus_id`, scope.campusScope)}
        AND ${inScope(sql`a.id`, scope.classScope)}
        AND EXISTS (
          SELECT 1
          FROM enrollment_placement p
          JOIN student_enrollment e ON e.id = p.enrollment_id
          JOIN student s ON s.id = e.student_id
          WHERE p.class_arm_id = a.id
            AND p.term_id = cur.id
            AND p.organization_id = a.organization_id
            AND e.status <> 'withdrawn'
            AND s.exit_kind IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM class_arm_teacher t
          WHERE t.class_arm_id = a.id
            AND t.session_id = cur.session_id
            AND t.organization_id = a.organization_id
        )
      ORDER BY l.sequence, a.name, a.id
      LIMIT ${DASHBOARD_SAMPLE_SIZE}`.execute(this.db);
    return {
      count: countOf(rows),
      samples: rows.map((row) => ({ id: row.id, name: row.name })),
    };
  }

  async rolelessMembers(
    organizationId: string,
    campusScope: Scope
  ): Promise<RolelessMember[]> {
    const campus =
      campusScope === 'all'
        ? sql``
        : sql`AND EXISTS (
            SELECT 1
            FROM "teamMember" tm
            WHERE tm."userId" = m."userId"
              AND ${inScope(sql`tm."teamId"`, campusScope)}
          )`;
    const { rows } = await sql<{ id: string; name: string }>`
      SELECT m.id, u.name
      FROM member m
      JOIN "user" u ON u.id = m."userId"
      WHERE m."organizationId" = ${organizationId}
        AND string_to_array(m.role, ',') = ARRAY['member']::text[]
        ${campus}
      ORDER BY u.name, m.id`.execute(this.db);
    return rows.map((row) => ({ memberId: row.id, name: row.name }));
  }

  async roll(scope: DashboardScope): Promise<DashboardRoll> {
    const { rows } = await sql<RollRow>`
      WITH ${visibleStudentsCte(scope)},
      term_start AS (
        SELECT starts_on FROM term
        WHERE organization_id = ${scope.organizationId} AND is_current
        LIMIT 1
      )
      SELECT
        (count(*) FILTER (WHERE life = 'active'))::int AS active,
        (count(*) FILTER (WHERE life = 'active' AND COALESCE(new_in_session, FALSE)))::int AS new_intakes,
        (count(*) FILTER (WHERE life = 'inactive'))::int AS inactive,
        (count(*) FILTER (
          WHERE life = 'inactive'
            AND (${scope.today}::date - not_seen_since::date) >= ${DUE_LEFT_AFTER_DAYS}
        ))::int AS due_left,
        (count(*) FILTER (WHERE life = 'left'))::int AS "left",
        (count(*) FILTER (
          WHERE life = 'left'
            AND archived_on::date >= (SELECT starts_on FROM term_start)
        ))::int AS left_this_term,
        (count(*) FILTER (WHERE life = 'graduated'))::int AS graduated
      FROM visible`.execute(this.db);
    return toRoll(rows[0] ?? EMPTY_ROLL, await this.campusNames(scope));
  }

  private async campusNames(scope: DashboardScope): Promise<string[] | null> {
    if (scope.campusScope === 'all') {
      return null;
    }
    const { rows } = await sql<{ name: string }>`
      SELECT name FROM team
      WHERE "organizationId" = ${scope.organizationId}
        AND ${inScope(sql`id`, scope.campusScope)}
      ORDER BY name`.execute(this.db);
    return rows.map((row) => row.name);
  }

  async myClasses(scope: DashboardScope, userId: string): Promise<MyClass[]> {
    const { rows } = await sql<MyClassRow>`
      WITH ${visibleStudentsCte(scope)}
      SELECT
        a.id AS arm_id,
        l.name || ' ' || a.name AS name,
        campus.name AS campus_name,
        (SELECT count(*) FROM visible v WHERE v.arm_id = a.id AND v.life = 'active')::int AS student_count,
        TRUE AS is_class_teacher,
        (
          SELECT json_agg(json_build_object('id', picked.id, 'name', picked.full_name) ORDER BY picked.last_name, picked.first_name, picked.id)
          FROM (
            SELECT v.id, v.first_name, v.last_name, v.first_name || ' ' || v.last_name AS full_name
            FROM visible v
            WHERE v.arm_id = a.id AND v.life = 'active'
            ORDER BY v.last_name, v.first_name, v.id
            LIMIT ${DASHBOARD_SAMPLE_SIZE}
          ) picked
        ) AS samples
      FROM class_arm a
      JOIN class_level l ON l.id = a.class_level_id AND l.organization_id = a.organization_id
      JOIN team campus ON campus.id = a.campus_id
      JOIN cur ON TRUE
      JOIN class_arm_teacher ct
        ON ct.class_arm_id = a.id
        AND ct.session_id = cur.session_id
        AND ct.organization_id = a.organization_id
        AND ct.user_id = ${userId}
      WHERE a.organization_id = ${scope.organizationId}
        AND a.retired_at IS NULL
        AND ${inScope(sql`a.campus_id`, scope.campusScope)}
      ORDER BY l.sequence, a.name, a.id`.execute(this.db);
    return rows.map((row) => ({
      armId: row.arm_id,
      name: row.name,
      campusName: row.campus_name,
      studentCount: row.student_count,
      isClassTeacher: row.is_class_teacher,
      subjects: [],
      sampleStudents: row.samples ?? [],
    }));
  }
}

import { sql, type RawBuilder } from 'kysely';
import type { CampusScope } from '../campus-scope';
import type { ClassScope } from '../class-scope';
import { effectiveCampusSql } from './effective-campus';
import { inactiveSql } from './student-life-sql';

interface VisibleStudentsOptions {
  organizationId: string;
  campusScope: CampusScope;
  classScope: ClassScope;
  today: string;
  studentId?: string;
}

const idList = (ids: readonly string[]) =>
  sql.join(ids.map((id) => sql`${id}`));

export const inScope = (
  column: RawBuilder<unknown>,
  scope: CampusScope
): RawBuilder<boolean> => {
  if (scope === 'all') {
    return sql<boolean>`TRUE`;
  }
  return scope.length === 0
    ? sql<boolean>`FALSE`
    : sql<boolean>`${column} IN (${idList(scope)})`;
};

const EFFECTIVE_CAMPUS = effectiveCampusSql(
  sql`cp.campus_id`,
  sql`s.campus_id`
);

const VISIBLE_COLUMNS = sql`
        s.id,
        s.organization_id,
        s.first_name,
        s.last_name,
        s.gender,
        s.admission_number,
        s.user_id,
        s.campus_id AS home_campus_id,
        s.not_seen_by,
        s.not_seen_note,
        s.exit_kind,
        s.exit_reason,
        s.exit_note,
        s.graduated_session_id,
        s.archived_at,
        s.archived_by,
        s.archived_term_id,
        to_char(s.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
        to_char(s.admitted_on, 'YYYY-MM-DD') AS admitted_on,
        to_char(s.not_seen_since, 'YYYY-MM-DD') AS not_seen_since,
        to_char(s.last_day, 'YYYY-MM-DD') AS last_day,
        to_char(s.archived_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS archived_on,
        ce.is_new_student AS new_in_session,
        cp.class_arm_id AS arm_id,
        ${EFFECTIVE_CAMPUS} AS campus_id,
        le.class_level_id AS latest_level_id
`;

/** CTE definitions without the leading WITH. With no current term nobody has a placement, so a class-scoped caller sees none. */
export function visibleStudentsCte(
  options: VisibleStudentsOptions
): RawBuilder<unknown> {
  const only =
    options.studentId === undefined
      ? sql``
      : sql`AND s.id = ${options.studentId}`;
  return sql`
    cur AS (
      SELECT term.id AS term_id, term.session_id
      FROM term
      WHERE term.organization_id = ${options.organizationId} AND term.is_current
      LIMIT 1
    ),
    visible AS (
      SELECT
        ${VISIBLE_COLUMNS},
        CASE
          WHEN s.exit_kind IS NOT NULL THEN s.exit_kind
          WHEN ${inactiveSql(options.today, 's.not_seen_since')} THEN 'inactive'
          ELSE 'active'
        END AS life
      FROM student s
      LEFT JOIN cur ON TRUE
      LEFT JOIN student_enrollment ce
        ON ce.student_id = s.id
        AND ce.organization_id = s.organization_id
        AND ce.session_id = cur.session_id
      LEFT JOIN enrollment_placement cp
        ON cp.enrollment_id = ce.id AND cp.term_id = cur.term_id
      LEFT JOIN LATERAL (
        SELECT e.class_level_id
        FROM student_enrollment e
        JOIN academic_session a ON a.id = e.session_id
        WHERE e.student_id = s.id AND e.organization_id = s.organization_id
        ORDER BY a.starts_on DESC
        LIMIT 1
      ) le ON TRUE
      WHERE s.organization_id = ${options.organizationId}
        ${only}
        AND ${inScope(EFFECTIVE_CAMPUS, options.campusScope)}
        AND ${inScope(sql`cp.class_arm_id`, options.classScope)}
    )`;
}

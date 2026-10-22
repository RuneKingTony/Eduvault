import { sql, type RawBuilder } from 'kysely';
import { effectiveCampusSql } from './effective-campus';

/**
 * Finance scope follows where the student is now, not where the charge was prepared.
 * Unlike `visibleStudentsCte` it does not require the enrolment to be in the current
 * session; the two agree because every write inserts a placement for a term of its
 * enrolment's session.
 */
export function currentCampusSql(alias: string): RawBuilder<string> {
  const id = sql.ref(`${alias}.id`);
  const organizationId = sql.ref(`${alias}.organization_id`);
  const homeCampusId = sql.ref(`${alias}.campus_id`);
  const placementCampusId = sql`(
    select placement.campus_id
    from enrollment_placement placement
    join term current_term
      on current_term.id = placement.term_id
      and current_term.organization_id = placement.organization_id
      and current_term.is_current
    join student_enrollment enrollment
      on enrollment.id = placement.enrollment_id
      and enrollment.organization_id = placement.organization_id
    where enrollment.student_id = ${id}
      and enrollment.organization_id = ${organizationId}
    limit 1
  )`;
  return effectiveCampusSql(placementCampusId, homeCampusId);
}

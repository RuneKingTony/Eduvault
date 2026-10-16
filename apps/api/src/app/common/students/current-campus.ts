import { sql, type RawBuilder } from 'kysely';

/** Finance scope follows where the student is now, not where the charge was prepared. */
export function currentCampusSql(alias: string): RawBuilder<string> {
  const id = sql.ref(`${alias}.id`);
  const organizationId = sql.ref(`${alias}.organization_id`);
  const homeCampusId = sql.ref(`${alias}.campus_id`);
  return sql<string>`coalesce((
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
  ), ${homeCampusId})`;
}

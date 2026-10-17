import { sql, type RawBuilder } from 'kysely';

export function studentClassNameSql(alias: string): RawBuilder<string | null> {
  const id = sql.ref(`${alias}.id`);
  const organizationId = sql.ref(`${alias}.organization_id`);
  return sql<string | null>`coalesce((
    select placed_level.name || ' ' || placed_arm.name
    from student_enrollment placed_enrollment
    join enrollment_placement placement
      on placement.enrollment_id = placed_enrollment.id
      and placement.organization_id = placed_enrollment.organization_id
    join term placed_term
      on placed_term.id = placement.term_id
      and placed_term.organization_id = placement.organization_id
      and placed_term.is_current
    join class_arm placed_arm
      on placed_arm.id = placement.class_arm_id
      and placed_arm.organization_id = placement.organization_id
    join class_level placed_level
      on placed_level.id = placed_arm.class_level_id
      and placed_level.organization_id = placed_arm.organization_id
    where placed_enrollment.student_id = ${id}
      and placed_enrollment.organization_id = ${organizationId}
    limit 1
  ), (
    select latest_level.name
    from student_enrollment latest_enrollment
    join academic_session latest_session
      on latest_session.id = latest_enrollment.session_id
      and latest_session.organization_id = latest_enrollment.organization_id
    join class_level latest_level
      on latest_level.id = latest_enrollment.class_level_id
      and latest_level.organization_id = latest_enrollment.organization_id
    where latest_enrollment.student_id = ${id}
      and latest_enrollment.organization_id = ${organizationId}
    order by latest_session.starts_on desc
    limit 1
  ))`;
}

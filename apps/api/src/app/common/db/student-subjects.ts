import type { Database } from './tokens';

export function studentSubjectsOf(
  db: Database,
  organizationId: string,
  enrollmentIds: readonly string[]
) {
  return db
    .selectFrom('student_subject')
    .innerJoin(
      'student_enrollment',
      'student_enrollment.id',
      'student_subject.enrollment_id'
    )
    .where('student_subject.organization_id', '=', organizationId)
    .where('student_subject.enrollment_id', 'in', [...enrollmentIds]);
}

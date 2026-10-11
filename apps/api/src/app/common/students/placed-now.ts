import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

export function placedNow(db: Kysely<DB>, organizationId: string) {
  return db
    .selectFrom('enrollment_placement as ep')
    .innerJoin('term', (join) =>
      join.onRef('term.id', '=', 'ep.term_id').on('term.is_current', '=', true)
    )
    .innerJoin('student_enrollment as en', 'en.id', 'ep.enrollment_id')
    .innerJoin('student', 'student.id', 'en.student_id')
    .where('ep.organization_id', '=', organizationId)
    .where('en.status', '<>', 'withdrawn')
    .where('student.exit_kind', 'is', null);
}

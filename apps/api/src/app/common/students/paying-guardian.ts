import type { Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

export async function payingGuardian(
  db: Kysely<DB>,
  request: { organizationId: string; studentId: string }
): Promise<{ id: string; fullName: string } | undefined> {
  const row = await db
    .selectFrom('guardian_student as gs')
    .innerJoin('guardian as g', (join) =>
      join
        .onRef('g.id', '=', 'gs.guardian_id')
        .onRef('g.organization_id', '=', 'gs.organization_id')
    )
    .select(['g.id', 'g.full_name'])
    .where('gs.organization_id', '=', request.organizationId)
    .where('gs.student_id', '=', request.studentId)
    .where('gs.pays_fees', '=', true)
    .orderBy('gs.created_at')
    .orderBy('gs.id')
    .limit(1)
    .executeTakeFirst();
  return row && { id: row.id, fullName: row.full_name };
}

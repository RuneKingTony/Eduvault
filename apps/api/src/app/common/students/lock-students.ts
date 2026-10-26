import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

/** The journal's student foreign key makes every posting for these students wait for the lock. */
export async function lockStudents(
  trx: Kysely<DB>,
  lock: { organizationId: string; studentIds: readonly string[] }
): Promise<void> {
  if (lock.studentIds.length === 0) {
    return;
  }
  await sql`
    SELECT st.id FROM student st
    WHERE st.organization_id = ${lock.organizationId}
      AND st.id IN (${sql.join(lock.studentIds)})
    ORDER BY st.id
    FOR UPDATE OF st`.execute(trx);
}

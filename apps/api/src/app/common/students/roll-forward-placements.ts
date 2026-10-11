import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../db/db-types';

interface RollForwardInput {
  organizationId: string;
  termId: string;
  sessionId: string;
}

export async function rollForwardPlacements(
  trx: Kysely<DB>,
  input: RollForwardInput
): Promise<void> {
  await sql`
    INSERT INTO enrollment_placement
      (organization_id, enrollment_id, term_id, class_arm_id, campus_id)
    SELECT en.organization_id, en.id, ${input.termId}::uuid, latest.class_arm_id, latest.campus_id
    FROM student_enrollment en
    JOIN LATERAL (
      SELECT ep.class_arm_id, ep.campus_id
      FROM enrollment_placement ep
      JOIN term t ON t.id = ep.term_id
      WHERE ep.enrollment_id = en.id
      ORDER BY t.sequence DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE en.organization_id = ${input.organizationId}
      AND en.session_id = ${input.sessionId}::uuid
      AND en.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM enrollment_placement own
        WHERE own.enrollment_id = en.id AND own.term_id = ${input.termId}::uuid
      )`.execute(trx);
}

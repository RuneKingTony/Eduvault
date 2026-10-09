import type { Pool } from 'pg';
import type { SuspendedSchool } from '@eduvault/api-contract';

export async function findSuspendedSchool(
  pool: Pool,
  organizationId: string
): Promise<SuspendedSchool | null> {
  const result = await pool.query<SuspendedSchool>(
    `SELECT o.id, o.name FROM school_account sa
     JOIN "organization" o ON o.id = sa.organization_id
     WHERE sa.organization_id = $1 AND sa.suspended_at IS NOT NULL`,
    [organizationId]
  );
  return result.rows[0] ?? null;
}

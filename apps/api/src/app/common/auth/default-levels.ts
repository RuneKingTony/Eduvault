import type { Pool } from 'pg';

interface DefaultLevel {
  code: string;
  name: string;
  sequence: number;
}

const ladder = (
  prefix: string,
  label: string,
  { years, offset }: { years: number; offset: number }
): DefaultLevel[] =>
  Array.from({ length: years }, (_, index) => ({
    code: `${prefix}${index + 1}`,
    name: `${label} ${index + 1}`,
    sequence: offset + index + 1,
  }));

export const DEFAULT_LEVELS: readonly DefaultLevel[] = [
  ...ladder('P', 'Primary', { years: 6, offset: 0 }),
  ...ladder('JSS', 'JSS', { years: 3, offset: 6 }),
  ...ladder('SS', 'SS', { years: 3, offset: 9 }),
];

/**
 * Direct SQL, like the starter roles: it runs inside Better Auth's organization
 * hook. Rows go in unlinked and are chained after, so a re-run is a no-op.
 */
export async function insertDefaultLevels(
  pool: Pool,
  organizationId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO class_level (organization_id, code, name, sequence)
       SELECT $1, l.code, l.name, l.sequence
       FROM unnest($2::text[], $3::text[], $4::int[]) AS l(code, name, sequence)
       ON CONFLICT DO NOTHING`,
      [
        organizationId,
        DEFAULT_LEVELS.map((level) => level.code),
        DEFAULT_LEVELS.map((level) => level.name),
        DEFAULT_LEVELS.map((level) => level.sequence),
      ]
    );
    await client.query(
      `UPDATE class_level current
       SET next_level_id = next.id
       FROM class_level next
       WHERE current.organization_id = $1
         AND next.organization_id = current.organization_id
         AND next.sequence = current.sequence + 1
         AND current.next_level_id IS NULL`,
      [organizationId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

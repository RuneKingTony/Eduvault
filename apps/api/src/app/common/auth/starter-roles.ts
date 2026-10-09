import type { Pool } from 'pg';
import { STARTER_ROLES, toPermissionMap } from '@eduvault/policy';

/**
 * Inserts the school's missing starter roles and rewrites the permissions of
 * starter roles nobody has edited. A starter role a school has edited is left
 * alone. Direct SQL: the new owner has no session yet, and Better Auth checks a
 * member's role slug against `organizationRole` when it is assigned.
 */
export async function syncStarterRoles(
  pool: Pool,
  organizationId: string
): Promise<void> {
  for (const role of STARTER_ROLES) {
    const permission = JSON.stringify(toPermissionMap(role.permissions));
    await pool.query(
      `INSERT INTO "organizationRole"
         ("organizationId", role, permission, label, description, source)
       SELECT $1::text, $2::text, $3::text, $4::text, $5::text, 'starter'
       WHERE NOT EXISTS (
         SELECT 1 FROM "organizationRole"
         WHERE "organizationId" = $1::text AND role = $2::text
       )`,
      [organizationId, role.slug, permission, role.label, role.description]
    );
    await pool.query(
      `UPDATE "organizationRole"
       SET permission = $3, "updatedAt" = now()
       WHERE "organizationId" = $1 AND role = $2
         AND source = 'starter' AND "editedAt" IS NULL
         AND permission <> $3`,
      [organizationId, role.slug, permission]
    );
  }
}

import type { Pool } from 'pg';
import { STARTER_ROLES, toPermissionMap } from '@eduvault/policy';

/**
 * Direct SQL: a new owner has no session yet, and Better Auth checks a member's
 * role slug against `organizationRole` when it is assigned.
 */
async function sync(pool: Pool, organizationId: string | null): Promise<void> {
  const slugs = STARTER_ROLES.map((role) => role.slug);
  const permissions = STARTER_ROLES.map((role) =>
    JSON.stringify(toPermissionMap(role.permissions))
  );
  await pool.query(
    `INSERT INTO "organizationRole"
       ("organizationId", role, permission, label, description, source)
     SELECT o.id, r.slug, r.permission, r.label, r.description, 'starter'
     FROM organization o
     CROSS JOIN unnest($2::text[], $3::text[], $4::text[], $5::text[])
       AS r(slug, permission, label, description)
     WHERE $1::text IS NULL OR o.id = $1::text
     ON CONFLICT ("organizationId", role) DO NOTHING`,
    [
      organizationId,
      slugs,
      permissions,
      STARTER_ROLES.map((role) => role.label),
      STARTER_ROLES.map((role) => role.description),
    ]
  );
  await pool.query(
    `UPDATE "organizationRole" o
     SET permission = r.permission, "updatedAt" = now()
     FROM unnest($2::text[], $3::text[]) AS r(slug, permission)
     WHERE o.role = r.slug AND o.source = 'starter' AND o."editedAt" IS NULL
       AND o.permission <> r.permission
       AND ($1::text IS NULL OR o."organizationId" = $1::text)`,
    [organizationId, slugs, permissions]
  );
}

/**
 * Inserts the school's missing starter roles and rewrites the permissions of
 * starter roles nobody has edited. An edited starter role is left alone.
 */
export function syncStarterRoles(
  pool: Pool,
  organizationId: string
): Promise<void> {
  return sync(pool, organizationId);
}

/** Boot runs this so a release's new permissions reach existing schools. */
export function syncAllStarterRoles(pool: Pool): Promise<void> {
  return sync(pool, null);
}

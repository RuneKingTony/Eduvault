import {
  holds,
  parsePermissionMap,
  resolvePermissions,
  splitRoles,
  type Permission,
  type PermissionMap,
} from '@eduvault/policy';
import type { Pool } from 'pg';
import type { Database } from '../db/tokens';

interface RolePermissionRow {
  role: string;
  permission: string;
}

function customRolePermissions(
  rows: readonly RolePermissionRow[]
): Record<string, PermissionMap> {
  const custom: Record<string, PermissionMap> = {};
  for (const row of rows) {
    custom[row.role] = parsePermissionMap(row.permission);
  }
  return custom;
}

export async function schoolRolePermissions(
  db: Database,
  organizationId: string
): Promise<Record<string, PermissionMap>> {
  const rows = await db
    .selectFrom('organizationRole')
    .where('organizationId', '=', organizationId)
    .select(['role', 'permission'])
    .execute();
  return customRolePermissions(rows);
}

export async function loadPermissions(
  db: Pick<Pool, 'query'>,
  organizationId: string,
  roles: readonly string[]
): Promise<PermissionMap> {
  const { rows } = await db.query<RolePermissionRow>(
    `SELECT role, permission FROM "organizationRole"
     WHERE "organizationId" = $1 AND role = ANY($2)`,
    [organizationId, roles]
  );
  return resolvePermissions(roles, customRolePermissions(rows));
}

/** Whether the user is a member of the school now and holds the permission, for work that runs without their session. */
export async function memberHolds(
  db: Database,
  { organizationId, userId }: { organizationId: string; userId: string },
  permission: Permission
): Promise<boolean> {
  const member = await db
    .selectFrom('member')
    .where('organizationId', '=', organizationId)
    .where('userId', '=', userId)
    .select('role')
    .executeTakeFirst();
  if (member === undefined) {
    return false;
  }
  const permissions = resolvePermissions(
    splitRoles(member.role),
    await schoolRolePermissions(db, organizationId)
  );
  return holds(permissions, permission);
}

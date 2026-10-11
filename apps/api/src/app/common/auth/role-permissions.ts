import {
  parsePermissionMap,
  resolvePermissions,
  type PermissionMap,
} from '@eduvault/policy';
import type { Pool } from 'pg';

interface RolePermissionRow {
  role: string;
  permission: string;
}

export function customRolePermissions(
  rows: readonly RolePermissionRow[]
): Record<string, PermissionMap> {
  const custom: Record<string, PermissionMap> = {};
  for (const row of rows) {
    custom[row.role] = parsePermissionMap(row.permission);
  }
  return custom;
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

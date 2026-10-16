import { PORTAL_ROLES } from './members';
import { MEMBER_ROLE, OWNER_ROLE, holds, toPermissions } from './roles';
import type { Permission, PermissionMap } from './statements';

const PORTAL_OWN_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'student:readOwn',
  'invoice:readOwn',
]);

export interface GrantRequest {
  slug: string;
  rolePermissions: PermissionMap;
  assignerPermissions: PermissionMap;
  assignerIsOwner: boolean;
}

export interface GrantCheck {
  allowed: boolean;
  missing: Permission[];
}

export function grantablePermissions(
  assignerPermissions: PermissionMap
): Permission[] {
  return toPermissions(assignerPermissions);
}

export function canGrantRole(request: GrantRequest): GrantCheck {
  const { slug, rolePermissions, assignerPermissions, assignerIsOwner } =
    request;
  if (slug === MEMBER_ROLE) {
    return { allowed: true, missing: [] };
  }
  if (slug === OWNER_ROLE) {
    return { allowed: assignerIsOwner, missing: [] };
  }
  const portal = PORTAL_ROLES.includes(slug);
  const missing = toPermissions(rolePermissions).filter(
    (permission) =>
      !(portal && PORTAL_OWN_PERMISSIONS.has(permission)) &&
      !holds(assignerPermissions, permission)
  );
  return { allowed: missing.length === 0, missing };
}

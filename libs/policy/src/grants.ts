import { MEMBER_ROLE, OWNER_ROLE, holds, toPermissions } from './roles';
import type { Permission, PermissionMap } from './statements';

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
  const missing = toPermissions(rolePermissions).filter(
    (permission) => !holds(assignerPermissions, permission)
  );
  return { allowed: missing.length === 0, missing };
}

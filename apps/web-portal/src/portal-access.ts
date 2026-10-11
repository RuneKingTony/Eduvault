import type { MePermissions } from '@eduvault/api-contract';
import { PORTAL_ROLES, can } from '@eduvault/policy';

/** An owner holds every permission, so the role matters as much as `student:readOwn`. */
export const isPortalUser = (
  access: Pick<MePermissions, 'roles' | 'permissions'>
): boolean =>
  access.roles.some((role) => PORTAL_ROLES.includes(role)) &&
  can(access.permissions, 'student', 'readOwn');

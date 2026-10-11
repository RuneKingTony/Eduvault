import type { MePermissions } from '@eduvault/api-contract';
import { can, isPortalOnly } from '@eduvault/policy';

/** Staff who are also guardians use the portal too, but they keep the shell. */
export const isPortalOnlyAccount = (
  access: Pick<MePermissions, 'roles' | 'permissions'>
): boolean =>
  isPortalOnly(access.roles) && can(access.permissions, 'student', 'readOwn');

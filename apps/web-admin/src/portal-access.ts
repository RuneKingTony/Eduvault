import type { MePermissions } from '@eduvault/api-contract';
import { can, isPortalOnly } from '@eduvault/policy';

/** The complement of the portal's staff screen, so neither app sends the account to the other. */
export const isPortalOnlyAccount = (
  access: Pick<MePermissions, 'roles' | 'permissions'>
): boolean =>
  isPortalOnly(access.roles) && can(access.permissions, 'student', 'readOwn');

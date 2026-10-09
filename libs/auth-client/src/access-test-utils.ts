import type { MePermissions } from '@eduvault/api-contract';
import { STARTER_ROLES, toPermissionMap } from '@eduvault/policy';

export const fakeAccess = (
  overrides: Partial<MePermissions> = {}
): MePermissions => ({
  organizationId: 'org-1',
  roles: ['member'],
  permissions: {},
  campusScope: [],
  classScope: 'all',
  acting: null,
  ...overrides,
});

/** The access of a member holding one starter role, as `/me/permissions` reports it. */
export function accessOfStarter(slug: string): MePermissions {
  const role = STARTER_ROLES.find((candidate) => candidate.slug === slug);
  return fakeAccess({
    roles: [slug],
    permissions: toPermissionMap(role?.permissions ?? []),
    campusScope: 'all',
  });
}

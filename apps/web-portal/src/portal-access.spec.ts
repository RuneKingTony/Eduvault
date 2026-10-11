import { ALL_PERMISSIONS, toPermissionMap } from '@eduvault/policy';
import { isPortalUser } from './portal-access';

const readOwn = toPermissionMap(['student:readOwn']);

describe('isPortalUser', () => {
  it('is true for a student or guardian holding student:readOwn', () => {
    expect(isPortalUser({ roles: ['student'], permissions: readOwn })).toBe(
      true
    );
    expect(
      isPortalUser({ roles: ['member', 'guardian'], permissions: readOwn })
    ).toBe(true);
  });

  it('is false for a portal role that lost student:readOwn', () => {
    expect(isPortalUser({ roles: ['guardian'], permissions: {} })).toBe(false);
  });

  it('is false for staff, an owner included', () => {
    expect(
      isPortalUser({
        roles: ['administrator'],
        permissions: toPermissionMap(['student:read']),
      })
    ).toBe(false);
    expect(
      isPortalUser({
        roles: ['owner'],
        permissions: toPermissionMap(ALL_PERMISSIONS),
      })
    ).toBe(false);
  });
});

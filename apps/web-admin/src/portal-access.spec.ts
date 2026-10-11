import { ALL_PERMISSIONS, toPermissionMap } from '@eduvault/policy';
import { isPortalOnlyAccount } from './portal-access';

const readOwn = toPermissionMap(['student:readOwn']);

describe('isPortalOnlyAccount', () => {
  it('is true for a student or guardian holding student:readOwn', () => {
    expect(
      isPortalOnlyAccount({ roles: ['student'], permissions: readOwn })
    ).toBe(true);
    expect(
      isPortalOnlyAccount({
        roles: ['member', 'guardian'],
        permissions: readOwn,
      })
    ).toBe(true);
  });

  it('is false for staff who are also guardians', () => {
    expect(
      isPortalOnlyAccount({
        roles: ['member', 'guardian', 'teacher'],
        permissions: readOwn,
      })
    ).toBe(false);
  });

  it('is false for staff, an owner included', () => {
    expect(
      isPortalOnlyAccount({
        roles: ['administrator'],
        permissions: toPermissionMap(['student:read']),
      })
    ).toBe(false);
    expect(
      isPortalOnlyAccount({
        roles: ['owner', 'guardian'],
        permissions: toPermissionMap(ALL_PERMISSIONS),
      })
    ).toBe(false);
  });

  it('is false for a portal role that lost student:readOwn, so the portal never sends it back', () => {
    expect(isPortalOnlyAccount({ roles: ['guardian'], permissions: {} })).toBe(
      false
    );
  });
});

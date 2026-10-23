import { canGrantRole, grantablePermissions, toPermissionMap } from './index';

const teacher = toPermissionMap(['student:read']);
const administrator = toPermissionMap(['student:read', 'student:create']);

describe('canGrantRole', () => {
  it('lets anyone grant member', () => {
    expect(
      canGrantRole({
        slug: 'member',
        rolePermissions: {},
        assignerPermissions: {},
        assignerIsOwner: false,
      })
    ).toEqual({ allowed: true, missing: [] });
  });

  it('lets only an owner grant owner', () => {
    const base = {
      slug: 'owner',
      rolePermissions: {},
      assignerPermissions: administrator,
    };
    expect(canGrantRole({ ...base, assignerIsOwner: false }).allowed).toBe(
      false
    );
    expect(canGrantRole({ ...base, assignerIsOwner: true }).allowed).toBe(true);
  });

  it('allows a role whose permissions the assigner holds', () => {
    expect(
      canGrantRole({
        slug: 'teacher',
        rolePermissions: teacher,
        assignerPermissions: administrator,
        assignerIsOwner: false,
      })
    ).toEqual({ allowed: true, missing: [] });
  });

  it('lets an assigner without the permissions grant a portal role', () => {
    for (const slug of ['student', 'guardian']) {
      expect(
        canGrantRole({
          slug,
          rolePermissions: toPermissionMap([
            'student:readOwn',
            'invoice:readOwn',
            'feeLine:readOwn',
            'payment:readOwn',
            'wallet:readOwn',
            'wallet:spend',
          ]),
          assignerPermissions: teacher,
          assignerIsOwner: false,
        })
      ).toEqual({ allowed: true, missing: [] });
    }
  });

  it('still requires the assigner to hold wallet:topUp on a custom staff role', () => {
    expect(
      canGrantRole({
        slug: 'wallet-clerk',
        rolePermissions: toPermissionMap([
          'wallet:readOwn',
          'wallet:spend',
          'wallet:topUp',
        ]),
        assignerPermissions: teacher,
        assignerIsOwner: false,
      })
    ).toEqual({
      allowed: false,
      missing: ['wallet:readOwn', 'wallet:spend', 'wallet:topUp'],
    });
  });

  it('still requires the assigner to hold the own-record fee permissions on a custom staff role', () => {
    const rolePermissions = toPermissionMap([
      'student:read',
      'feeLine:readOwn',
      'payment:readOwn',
    ]);
    expect(
      canGrantRole({
        slug: 'finance-viewer',
        rolePermissions,
        assignerPermissions: teacher,
        assignerIsOwner: false,
      })
    ).toEqual({
      allowed: false,
      missing: ['feeLine:readOwn', 'payment:readOwn'],
    });
    expect(
      canGrantRole({
        slug: 'finance-viewer',
        rolePermissions,
        assignerPermissions: toPermissionMap([
          'student:read',
          'feeLine:readOwn',
          'payment:readOwn',
        ]),
        assignerIsOwner: false,
      })
    ).toEqual({ allowed: true, missing: [] });
  });

  it('still names any other permission added to a portal role', () => {
    for (const slug of ['student', 'guardian']) {
      expect(
        canGrantRole({
          slug,
          rolePermissions: toPermissionMap(['student:readOwn', 'student:read']),
          assignerPermissions: toPermissionMap(['student:create']),
          assignerIsOwner: false,
        })
      ).toEqual({ allowed: false, missing: ['student:read'] });
      expect(
        canGrantRole({
          slug,
          rolePermissions: toPermissionMap(['student:readOwn', 'student:read']),
          assignerPermissions: teacher,
          assignerIsOwner: false,
        })
      ).toEqual({ allowed: true, missing: [] });
    }
  });

  it('names the permissions the assigner lacks', () => {
    expect(
      canGrantRole({
        slug: 'administrator',
        rolePermissions: administrator,
        assignerPermissions: teacher,
        assignerIsOwner: false,
      })
    ).toEqual({ allowed: false, missing: ['student:create'] });
  });
});

describe('removing a role', () => {
  it('refuses a role the assigner lacks and names what is missing', () => {
    const check = canGrantRole({
      slug: 'administrator',
      rolePermissions: administrator,
      assignerPermissions: teacher,
      assignerIsOwner: false,
    });
    expect(check.allowed).toBe(false);
    expect(check.missing).toEqual(['student:create']);
  });

  it('lets only an owner remove owner', () => {
    const request = {
      slug: 'owner',
      rolePermissions: {},
      assignerPermissions: administrator,
    };
    expect(canGrantRole({ ...request, assignerIsOwner: false }).allowed).toBe(
      false
    );
  });
});

describe('grantablePermissions', () => {
  it('lists what the assigner holds', () => {
    expect(grantablePermissions(administrator)).toEqual([
      'student:read',
      'student:create',
    ]);
  });
});

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

describe('grantablePermissions', () => {
  it('lists what the assigner holds', () => {
    expect(grantablePermissions(administrator)).toEqual([
      'student:read',
      'student:create',
    ]);
  });
});

import {
  ALL_PERMISSIONS,
  READ_PERMS,
  STARTER_ROLES,
  can,
  canAny,
  parsePermissionMap,
  resolvePermissions,
  splitRoles,
  splitPermission,
  toPermissionMap,
} from './index';

const starter = (slug: string) => {
  const role = STARTER_ROLES.find((candidate) => candidate.slug === slug);
  if (role === undefined) {
    throw new Error(`no starter role ${slug}`);
  }
  return toPermissionMap(role.permissions);
};

describe('roles', () => {
  it('has the six starter roles', () => {
    expect(STARTER_ROLES.map((role) => role.slug)).toEqual([
      'administrator',
      'teacher',
      'bursar',
      'principal',
      'student',
      'guardian',
    ]);
  });

  it('keeps starter and READ_PERMS sets inside the listed permissions', () => {
    for (const role of STARTER_ROLES) {
      for (const permission of role.permissions) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
    for (const permission of READ_PERMS) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
  });

  it('lets the administrator see and give roles to staff but not add or remove', () => {
    const permissions = starter('administrator');
    expect(can(permissions, 'member', 'read')).toBe(true);
    expect(can(permissions, 'member', 'update')).toBe(true);
    expect(can(permissions, 'member', 'create')).toBe(false);
    expect(can(permissions, 'member', 'delete')).toBe(false);
  });

  it('gives the administrator ac:read and no other ac permission', () => {
    const permissions = starter('administrator');
    expect(can(permissions, 'ac', 'read')).toBe(true);
    expect(permissions.ac).toEqual(['read']);
  });

  it('keeps ac:create, ac:update and ac:delete out of every starter role', () => {
    for (const role of STARTER_ROLES) {
      for (const action of ['ac:create', 'ac:update', 'ac:delete'] as const) {
        expect(role.permissions).not.toContain(action);
      }
    }
  });

  it('has no readOwn in READ_PERMS', () => {
    expect(
      READ_PERMS.filter((permission) => permission.endsWith(':readOwn'))
    ).toEqual([]);
  });

  it('resolves owner to every permission with no custom rows', () => {
    const permissions = resolvePermissions(['owner'], {});
    for (const permission of ALL_PERMISSIONS) {
      const [resource, action] = splitPermission(permission);
      expect(permissions[resource]).toContain(action);
    }
  });

  it('gives the administrator schoolAccount:read, campus management and reach, and the principal team:read', () => {
    const administrator = starter('administrator');
    expect(administrator.schoolAccount).toEqual(['read']);
    expect(administrator.team).toEqual(['read', 'create', 'update']);
    expect(administrator.campus).toEqual(['readAll']);
    expect(starter('principal').team).toEqual(['read']);
  });

  it('parses a stored role that still carries the dropped schoolAccount create and delete', () => {
    expect(
      parsePermissionMap(
        '{"schoolAccount":["read","create","update","delete"],"student":["read"]}'
      )
    ).toEqual({ schoolAccount: ['read', 'update'], student: ['read'] });
  });

  it('gives the owner every ac permission', () => {
    expect(resolvePermissions(['owner'], {}).ac).toEqual([
      'create',
      'read',
      'update',
      'delete',
    ]);
  });

  it('resolves member to nothing', () => {
    expect(resolvePermissions(['member'], {})).toEqual({});
  });

  it('ignores a role with no row', () => {
    expect(resolvePermissions(['ghost', 'constructor'], {})).toEqual({});
  });

  it('unions two roles', () => {
    const permissions = resolvePermissions(['teacher', 'principal'], {
      teacher: starter('teacher'),
      principal: starter('principal'),
    });
    expect(permissions).toEqual({
      student: ['read'],
      team: ['read'],
      campus: ['readAll'],
    });
  });

  it('checks one permission with can', () => {
    const permissions = starter('bursar');
    expect(can(permissions, 'student', 'read')).toBe(true);
    expect(can(permissions, 'student', 'create')).toBe(false);
    expect(can(permissions, 'team', 'read')).toBe(false);
  });

  it('passes canAny with one of several', () => {
    const permissions = starter('bursar');
    expect(canAny(permissions, ['team:read', 'student:read'])).toBe(true);
    expect(canAny(permissions, ['team:read', 'schoolAccount:read'])).toBe(
      false
    );
    expect(canAny(permissions, [])).toBe(false);
  });

  it('parses a stored permission column and drops unknown entries', () => {
    expect(
      parsePermissionMap(
        '{"student":["read","delete"],"ghost":["read"],"team":"read"}'
      )
    ).toEqual({ student: ['read'] });
    expect(parsePermissionMap('not json')).toEqual({});
    expect(parsePermissionMap('[]')).toEqual({});
    expect(parsePermissionMap('null')).toEqual({});
  });

  it('splits a comma-joined role string and ignores blanks', () => {
    expect(splitRoles('teacher, principal,,')).toEqual([
      'teacher',
      'principal',
    ]);
    expect(splitRoles('')).toEqual([]);
    expect(splitRoles(null)).toEqual([]);
    expect(splitRoles(undefined)).toEqual([]);
  });
});

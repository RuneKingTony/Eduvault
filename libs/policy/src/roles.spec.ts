import {
  ALL_PERMISSIONS,
  READ_PERMS,
  STARTER_ROLES,
  can,
  canAny,
  parsePermissionMap,
  resolvePermissions,
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
});

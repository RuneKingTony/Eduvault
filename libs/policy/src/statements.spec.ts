import { ALL_PERMISSIONS, PERM_HELP, SENSITIVE, permLabel } from './index';

describe('permLabel', () => {
  it('splits camelCase actions into words', () => {
    expect(permLabel('campus:readAll')).toBe('Campus reach: read all');
    expect(permLabel('student:create')).toBe('Students: create');
    expect(permLabel('team:read')).toBe('Campuses: read');
    expect(permLabel('member:create')).toBe('Staff: create');
  });
});

describe('statements', () => {
  it('has no student delete', () => {
    expect(ALL_PERMISSIONS).not.toContain('student:delete');
  });

  it('has the member resource and marks adding and removing sensitive', () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'member:create',
        'member:read',
        'member:update',
        'member:delete',
      ])
    );
    expect(SENSITIVE).toEqual(
      expect.arrayContaining(['member:create', 'member:delete'])
    );
    expect(PERM_HELP['member:create']).toBeDefined();
    expect(PERM_HELP['member:update']).toBeDefined();
  });

  it('keeps SENSITIVE and PERM_HELP to listed permissions', () => {
    for (const permission of SENSITIVE) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
    for (const permission of Object.keys(PERM_HELP)) {
      expect(ALL_PERMISSIONS).toContain(permission);
    }
  });
});

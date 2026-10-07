import { can, parseRoles, seesAllCampuses } from './roles';

describe('policy', () => {
  it('lets owner and admin manage students', () => {
    expect(can('owner', 'student', 'create')).toBe(true);
    expect(can('admin', 'student', 'delete')).toBe(true);
  });

  it('limits teachers to reading students', () => {
    expect(can('teacher', 'student', 'read')).toBe(true);
    expect(can('teacher', 'student', 'create')).toBe(false);
    expect(can('teacher', 'schoolAccount', 'read')).toBe(false);
  });

  it('governs campuses through the team permission', () => {
    expect(can('admin', 'team', 'create')).toBe(true);
    expect(can('teacher', 'team', 'create')).toBe(false);
  });

  it('parses comma-separated roles and ignores unknown ones', () => {
    expect(parseRoles('teacher, admin,bogus')).toEqual(['teacher', 'admin']);
    expect(can('teacher,admin', 'student', 'create')).toBe(true);
    expect(can(undefined, 'student', 'read')).toBe(false);
  });

  it('scopes campus visibility by role', () => {
    expect(seesAllCampuses('owner')).toBe(true);
    expect(seesAllCampuses('teacher')).toBe(false);
  });
});

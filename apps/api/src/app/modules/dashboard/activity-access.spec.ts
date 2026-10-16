import { toPermissionMap, type Permission } from '@eduvault/policy';
import { activityAccess } from './activity-access';

const access = (...permissions: Permission[]) =>
  activityAccess(toPermissionMap(permissions));

describe('activityAccess', () => {
  it('shows platform rows only to a member with no permission', () => {
    expect(access()).toEqual({ pillars: ['platform'], foundationSubjects: [] });
  });

  it('opens student rows with student:read', () => {
    expect(access('student:read')).toEqual({
      pillars: ['platform', 'foundation'],
      foundationSubjects: ['student'],
    });
  });

  it('opens school year rows with session:read', () => {
    expect(access('session:read')).toEqual({
      pillars: ['platform', 'foundation'],
      foundationSubjects: ['school_year'],
    });
  });

  it('opens announcement rows with announcement:read', () => {
    expect(access('announcement:read')).toEqual({
      pillars: ['platform', 'foundation'],
      foundationSubjects: ['announcement'],
    });
  });

  it('keeps announcement rows hidden from announcement:create alone', () => {
    expect(access('announcement:create').foundationSubjects).toEqual([]);
  });

  it('opens access rows with member:read', () => {
    expect(access('member:read')).toEqual({
      pillars: ['platform', 'access'],
      foundationSubjects: [],
    });
  });

  it('never opens finance, whatever the member holds', () => {
    const everything = access(
      'student:read',
      'session:read',
      'member:read',
      'feeLine:read',
      'schoolAccount:read'
    );
    expect(everything.pillars).not.toContain('finance');
    expect(everything.foundationSubjects).toEqual(['student', 'school_year']);
  });

  it('hides foundation rows of other subjects', () => {
    expect(access('guardian:read', 'class:read').foundationSubjects).toEqual(
      []
    );
  });
});

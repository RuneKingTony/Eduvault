import { toPermissionMap, type Permission } from '@eduvault/policy';
import { activityAccess } from './activity-access';

const access = (...permissions: Permission[]) => {
  const { pillars, foundationSubjects } = activityAccess(
    toPermissionMap(permissions),
    'viewer'
  );
  return { pillars, foundationSubjects };
};

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

  it('opens finance with invoice:read alone', () => {
    expect(access('invoice:read')).toEqual({
      pillars: ['platform', 'finance'],
      foundationSubjects: [],
    });
  });

  it('opens finance with payment:read alone', () => {
    expect(access('payment:read')).toEqual({
      pillars: ['platform', 'finance'],
      foundationSubjects: [],
    });
  });

  it('keeps finance closed for feeLine:read, schoolAccount:read and adjustment:read', () => {
    const closed = access(
      'feeLine:read',
      'schoolAccount:read',
      'adjustment:read',
      'student:read',
      'session:read',
      'member:read'
    );
    expect(closed.pillars).not.toContain('finance');
    expect(closed.foundationSubjects).toEqual(['student', 'school_year']);
  });

  it('keeps finance closed for teacher-style permissions', () => {
    expect(
      access('class:read', 'guardian:read', 'subject:read').pillars
    ).not.toContain('finance');
  });

  it('keeps finance closed for the own-record finance permissions', () => {
    expect(access('invoice:readOwn', 'payment:readOwn').pillars).not.toContain(
      'finance'
    );
  });

  it('hides foundation rows of other subjects', () => {
    expect(access('guardian:read', 'class:read').foundationSubjects).toEqual(
      []
    );
  });
});

describe('activityAccess for leave events', () => {
  it('names the viewer and whether they approve leave', () => {
    expect(activityAccess(toPermissionMap([]), 'ayo')).toMatchObject({
      viewerId: 'ayo',
      leaveApprover: false,
    });
    expect(
      activityAccess(toPermissionMap(['leave:approve']), 'grace')
    ).toMatchObject({ viewerId: 'grace', leaveApprover: true });
  });

  it('opens no foundation subject and no pillar for leave:approve alone', () => {
    expect(access('leave:approve')).toEqual({
      pillars: ['platform'],
      foundationSubjects: [],
    });
  });
});

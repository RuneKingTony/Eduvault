import { toPermissionMap, type Permission } from '@eduvault/policy';
import { activityAccess } from './activity-access';

const access = (...permissions: Permission[]) => {
  const { pillars, foundationSubjects } = activityAccess(
    toPermissionMap(permissions),
    'viewer'
  );
  return { pillars, foundationSubjects };
};

const finance = (...permissions: Permission[]) =>
  activityAccess(toPermissionMap(permissions), 'viewer');

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

  it('opens round rows with invoice:read alone', () => {
    expect(finance('invoice:read').pillars).toEqual(['platform', 'finance']);
    expect(finance('invoice:read').financeSubjects).toEqual(['billing_run']);
  });

  it('opens payment and cancellation rows with payment:read alone', () => {
    expect(finance('payment:read').pillars).toEqual(['platform', 'finance']);
    expect(finance('payment:read').financeSubjects).toEqual([
      'payment',
      'payment_void',
    ]);
  });

  it('opens adjustment and discount rows with adjustment:read alone', () => {
    expect(finance('adjustment:read').pillars).toEqual(['platform', 'finance']);
    expect(finance('adjustment:read').financeSubjects).toEqual([
      'adjustment',
      'student_discount',
    ]);
  });

  it('opens every finance subject with all three read permissions', () => {
    expect(
      finance('invoice:read', 'payment:read', 'adjustment:read').financeSubjects
    ).toEqual([
      'payment',
      'payment_void',
      'billing_run',
      'adjustment',
      'student_discount',
    ]);
  });

  it('keeps finance closed for finance permissions that read none of its records', () => {
    const closed = access(
      'feeLine:read',
      'schoolAccount:read',
      'adjustment:create',
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

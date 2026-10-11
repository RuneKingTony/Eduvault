import { toPermissionMap } from '@eduvault/policy';
import { selectDashboardView } from './dashboard-view';

describe('selectDashboardView', () => {
  it('shows no access to a member with no permission', () => {
    expect(selectDashboardView({}, 'all')).toBe('none');
  });

  it('gives a class-scoped teacher the teacher view, even with no arms', () => {
    const teacher = toPermissionMap(['student:read', 'class:read']);
    expect(selectDashboardView(teacher, ['arm-1'])).toBe('teacher');
    expect(selectDashboardView(teacher, [])).toBe('teacher');
  });

  it('gives class:readAll the staff view', () => {
    const principal = toPermissionMap(['class:read', 'class:readAll']);
    expect(selectDashboardView(principal, 'all')).toBe('staff');
  });

  it('gives a member with only student:read the staff view', () => {
    expect(selectDashboardView(toPermissionMap(['student:read']), 'all')).toBe(
      'staff'
    );
  });
});

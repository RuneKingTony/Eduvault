import type { MePermissions } from '@eduvault/api-contract';

type DashboardView = 'none' | 'teacher' | 'staff';

/** No finance check yet: no finance permission exists to test. */
export function selectDashboardView(
  permissions: MePermissions['permissions'],
  classScope: MePermissions['classScope']
): DashboardView {
  if (Object.keys(permissions).length === 0) {
    return 'none';
  }
  return classScope === 'all' ? 'staff' : 'teacher';
}

import type { ActivityPage } from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { ActivityAccess } from './activity-access';
import { ActivityRepository } from './activity.repository';
import { ActivityService } from './activity.service';
import type { DashboardScope } from './dashboard.repository';

class FakeActivityRepository extends ActivityRepository {
  calls: { scope: DashboardScope; access: ActivityAccess; page: number }[] = [];

  list(
    scope: DashboardScope,
    access: ActivityAccess,
    page: number
  ): Promise<ActivityPage> {
    this.calls.push({ scope, access, page });
    return Promise.resolve({ items: [], total: 0 });
  }
}

const ctxFor = (permissions: Permission[]) =>
  ({
    organizationId: 'school-a',
    user: { id: 'caller', email: 'c@eduvault.test', name: 'Tunde Bakare' },
    permissions: toPermissionMap(permissions),
    campusScope: ['lekki'],
    classScope: ['arm-1'],
  }) as OrgContext;

const setup = () => {
  const repository = new FakeActivityRepository();
  const clock = new Clock();
  clock.set('2026-10-11');
  return { repository, service: new ActivityService(repository, clock) };
};

describe('ActivityService', () => {
  it('passes the access decision, the caller scopes and the page through', async () => {
    const { repository, service } = setup();
    await service.list(ctxFor(['student:read', 'member:read']), 3);
    expect(repository.calls).toEqual([
      {
        scope: {
          organizationId: 'school-a',
          campusScope: ['lekki'],
          classScope: ['arm-1'],
          today: '2026-10-11',
        },
        access: {
          pillars: ['platform', 'access', 'foundation'],
          foundationSubjects: ['student'],
          financeSubjects: [],
          viewerId: 'caller',
          leaveApprover: false,
        },
        page: 3,
      },
    ]);
  });

  it('still reads platform rows for a member with no permission', async () => {
    const { repository, service } = setup();
    await service.list(ctxFor([]), 1);
    expect(repository.calls[0]?.access).toEqual({
      pillars: ['platform'],
      foundationSubjects: [],
      financeSubjects: [],
      viewerId: 'caller',
      leaveApprover: false,
    });
  });

  it('tells the repository when the caller approves leave', async () => {
    const { repository, service } = setup();
    await service.list(ctxFor(['leave:approve']), 1);
    expect(repository.calls[0]?.access).toMatchObject({
      viewerId: 'caller',
      leaveApprover: true,
    });
  });
});

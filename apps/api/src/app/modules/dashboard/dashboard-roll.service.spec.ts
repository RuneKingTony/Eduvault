import type { DashboardRoll } from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { FakeStudentAccountRepository } from '../student-account/fake-student-account.repository';
import { StudentAccountService } from '../student-account/student-account.service';
import { DashboardRollService } from './dashboard-roll.service';
import type { DashboardService } from './dashboard.service';

const ctxFor = (
  permissions: Permission[],
  campusScope: OrgContext['campusScope'] = 'all'
) =>
  ({
    organizationId: 'school-a',
    user: { id: 'caller', email: 'c@eduvault.test', name: 'Tunde Bakare' },
    permissions: toPermissionMap(permissions),
    campusScope,
  }) as OrgContext;

const ROLL: DashboardRoll = {
  active: 10,
  newIntakes: 2,
  inactive: 1,
  dueLeft: 0,
  left: 3,
  leftThisTerm: 1,
  graduated: 4,
  campusNames: null,
};

const setup = () => {
  const accounts = new FakeStudentAccountRepository();
  const clock = new Clock({ NODE_ENV: 'test' });
  clock.set('2026-10-07');
  const roll = vi.fn(() => Promise.resolve(ROLL));
  const service = new DashboardRollService(
    new StudentAccountService(accounts, clock),
    { roll } as unknown as DashboardService
  );
  return { accounts, service, roll };
};

describe('DashboardRollService.roll', () => {
  it.each(['invoice:read', 'payment:read'] as Permission[])(
    'adds what is owed per bucket, and the former total, for a %s reader',
    async (permission) => {
      const { accounts, service } = setup();
      accounts.owed = {
        active: 500_000,
        newIntakes: 100_000,
        inactive: 20_000,
        left: 40_000,
        graduated: 15_000,
      };

      expect(await service.roll(ctxFor([permission]))).toEqual({
        ...ROLL,
        currency: 'NGN',
        owedMinor: accounts.owed,
        formerOwedMinor: 55_000,
      });
    }
  );

  it('leaves both owed keys out, and asks nothing, without a finance read', async () => {
    const { accounts, service } = setup();

    const roll = await service.roll(ctxFor(['student:read']));

    expect(roll).toEqual(ROLL);
    expect(roll).not.toHaveProperty('owedMinor');
    expect(roll).not.toHaveProperty('formerOwedMinor');
    expect(accounts.scopes).toEqual([]);
  });

  it('reads the owed buckets through the caller’s campus scope', async () => {
    const { accounts, service } = setup();

    await service.roll(ctxFor(['payment:read'], ['lekki']));

    expect(accounts.scopes.map(({ campusScope }) => campusScope)).toEqual([
      ['lekki'],
    ]);
  });
});

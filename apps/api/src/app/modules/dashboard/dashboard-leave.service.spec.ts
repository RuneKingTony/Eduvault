import type { LeaveDto } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { LeaveService } from '../leave/leave.service';
import { DashboardLeaveService } from './dashboard-leave.service';

const leave = (over: Partial<LeaveDto>): LeaveDto => ({
  id: '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11',
  createdBy: 'ayo',
  requesterName: 'Ayo Bassey',
  type: 'annual',
  startsOn: '2026-10-22',
  endsOn: '2026-10-23',
  days: 2,
  reason: 'Family',
  cover: null,
  status: 'approved',
  approvedBy: 'funmi',
  approvedAt: '2026-10-16T08:00:00.000Z',
  rejectedBy: null,
  rejectedAt: null,
  deciderName: 'Funmi Adeyemi',
  rejectionReason: null,
  cancelledBy: null,
  cancelledAt: null,
  cancellerName: null,
  cancellationReason: null,
  createdAt: '2026-10-15T08:00:00.000Z',
  isOwn: true,
  ...over,
});

const setup = (items: LeaveDto[], count = items.length) => {
  const service = {
    unseenDecisions: vi.fn().mockResolvedValue({ items, count }),
  };
  return {
    service,
    tasks: new DashboardLeaveService(service as unknown as LeaveService),
  };
};

const ctxFor = (roles: string[]) =>
  ({ organizationId: 'school-a', roles }) as unknown as OrgContext;

describe('DashboardLeaveService.tasks', () => {
  it('counts the unseen decisions and names the first two', async () => {
    const { tasks } = setup(
      [
        leave({ status: 'cancelled', cancelledBy: 'funmi' }),
        leave({ status: 'rejected', type: 'sick', startsOn: '2026-10-26' }),
        leave({ type: 'study' }),
      ],
      7
    );
    expect(await tasks.tasks(ctxFor(['teacher']))).toEqual([
      {
        kind: 'leaveDecided',
        count: 7,
        items: [
          {
            type: 'annual',
            startsOn: '2026-10-22',
            endsOn: '2026-10-23',
            status: 'cancelled',
          },
          {
            type: 'sick',
            startsOn: '2026-10-26',
            endsOn: '2026-10-23',
            status: 'rejected',
          },
        ],
      },
    ]);
  });

  it('adds nothing when every decision has been seen', async () => {
    const { tasks } = setup([]);
    expect(await tasks.tasks(ctxFor(['teacher']))).toEqual([]);
  });

  it('asks nothing of leave for a portal-only member', async () => {
    const { service, tasks } = setup([leave({})]);
    expect(await tasks.tasks(ctxFor(['guardian']))).toEqual([]);
    expect(service.unseenDecisions).not.toHaveBeenCalled();
  });
});

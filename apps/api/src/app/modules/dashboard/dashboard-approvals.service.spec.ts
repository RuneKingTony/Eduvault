import type { ApprovalItem, ApprovalSummary } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import type { OrgContext } from '../../common/auth';
import type { ApprovalsService } from '../approvals/approvals.service';
import { DashboardApprovalsService } from './dashboard-approvals.service';

const item = (label: string, details: string): ApprovalItem => ({
  kind: 'write_off',
  id: details,
  label,
  details,
  amountMinor: 100,
  amountText: null,
  createdBy: { id: 'chika', name: 'Chika' },
  createdAt: '2026-10-16T08:00:00.000Z',
  campusId: null,
  decide: 'yes',
});

const summaryOf = (
  waitingForMe: number,
  preview: ApprovalItem[]
): ApprovalSummary => ({
  currency: 'NGN',
  waitingForMe,
  byNav: { approvals: waitingForMe, payments: waitingForMe },
  preview,
});

const setup = (summary: ApprovalSummary) => {
  const approvals = { summary: vi.fn().mockResolvedValue(summary) };
  return {
    approvals,
    service: new DashboardApprovalsService(
      approvals as unknown as ApprovalsService
    ),
  };
};

const ctxFor = (approve: boolean) =>
  ({
    organizationId: 'school-a',
    permissions: toPermissionMap(approve ? ['adjustment:approve'] : []),
  }) as unknown as OrgContext;

describe('DashboardApprovalsService.tasks', () => {
  it('counts the waiting requests and names the first two as "{kind}: {details}" material', async () => {
    const { service } = setup(
      summaryOf(3, [
        item(
          'Cancel a payment',
          'RCT-2026-00098 from Mrs Danjuma: Wrong child'
        ),
        item('Cancel a balance', 'Bola Ade: Left the school'),
        item('Refund', 'David Eze: Overpaid'),
      ])
    );

    expect(await service.tasks(ctxFor(true))).toEqual([
      {
        kind: 'approvalsWaiting',
        count: 3,
        items: [
          {
            label: 'Cancel a payment',
            details: 'RCT-2026-00098 from Mrs Danjuma: Wrong child',
          },
          { label: 'Cancel a balance', details: 'Bola Ade: Left the school' },
        ],
      },
    ]);
  });

  it('adds nothing when nothing waits for the viewer', async () => {
    const { service } = setup(summaryOf(0, []));
    expect(await service.tasks(ctxFor(true))).toEqual([]);
  });

  it('asks nothing of the queue for a member who cannot approve', async () => {
    const { approvals, service } = setup(summaryOf(2, []));
    expect(await service.tasks(ctxFor(false))).toEqual([]);
    expect(approvals.summary).not.toHaveBeenCalled();
  });
});

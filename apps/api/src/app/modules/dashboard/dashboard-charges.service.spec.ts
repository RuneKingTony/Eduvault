import type { BillingRunList } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { BillingPlanService } from '../billing/billing-plan.service';
import type { BillingService } from '../billing/billing.service';
import type { TermInfo } from '../billing/billing.repository';
import type { RoundPlan } from '../billing/round-plan';
import { DashboardChargesService } from './dashboard-charges.service';

const term: TermInfo = {
  id: 'term-2',
  name: 'Second term',
  schoolYearName: '2026/2027',
  sessionId: 's1',
  isCurrent: true,
  position: { sessionStartsOn: '2026-09-07', sequence: 2 },
};

const biller = {
  permissions: { invoice: ['bill', 'read'] },
} as unknown as OrgContext;
const reader = { permissions: { invoice: ['read'] } } as unknown as OrgContext;

const planOf = (names: string[], skipped = 0): RoundPlan => ({
  charges: names.map((name, index) => ({
    studentId: `student-${index}`,
    name,
    campusId: 'lekki',
    lines: [],
  })),
  counts: { created: names.length, skipped, none: 0 },
});

const drafts: BillingRunList = {
  currency: 'NGN',
  total: 1,
  items: [
    {
      id: 'run-1',
      number: 'BR-2026-0002',
      termId: 'term-2',
      termName: 'Second term, 2026/2027',
      scope: 'school',
      scopeLabel: 'Whole school',
      chargeCount: 12,
      totalMinor: 1,
      createdBy: 'Chika',
      issuedAt: null,
      status: 'draft',
    },
  ],
};

function setup(over: { term?: TermInfo; plan?: RoundPlan } = {}) {
  const plans = {
    currentTerm: vi.fn().mockResolvedValue('term' in over ? over.term : term),
    plan: vi.fn().mockResolvedValue(over.plan ?? planOf([])),
  };
  const billing = { list: vi.fn().mockResolvedValue(drafts) };
  const service = new DashboardChargesService(
    plans as unknown as BillingPlanService,
    billing as unknown as BillingService
  );
  return { service, plans, billing };
}

describe('DashboardChargesService.tasks', () => {
  it('gives nothing without invoice:bill', async () => {
    const { service, plans } = setup();
    expect(await service.tasks(reader)).toEqual([]);
    expect(plans.plan).not.toHaveBeenCalled();
  });

  it('gives nothing with no current term', async () => {
    const { service } = setup({ term: undefined });
    expect(await service.tasks(biller)).toEqual([]);
  });

  it('names each unsent round and the students a prepare would charge', async () => {
    const { service, billing } = setup({
      plan: planOf([
        'Zed Obi',
        'Ada Obi',
        'Bola Obi',
        'Chi Obi',
        'Dan Obi',
        'Eve Obi',
      ]),
    });
    const tasks = await service.tasks(biller);
    expect(billing.list).toHaveBeenCalledWith(biller, {
      status: 'draft',
      page: 1,
      pageSize: 20,
    });
    expect(tasks).toEqual([
      {
        kind: 'unsentRound',
        runId: 'run-1',
        number: 'BR-2026-0002',
        termName: 'Second term, 2026/2027',
        count: 12,
      },
      {
        kind: 'notCharged',
        count: 6,
        termId: 'term-2',
        termName: 'Second term',
        students: [
          { id: 'student-1', name: 'Ada Obi' },
          { id: 'student-2', name: 'Bola Obi' },
          { id: 'student-3', name: 'Chi Obi' },
          { id: 'student-4', name: 'Dan Obi' },
          { id: 'student-5', name: 'Eve Obi' },
        ],
      },
    ]);
  });

  it('leaves out the uncharged task when everyone is charged', async () => {
    const { service } = setup({ plan: planOf([], 4) });
    const tasks = await service.tasks(biller);
    expect(tasks.map((task) => task.kind)).toEqual(['unsentRound']);
  });
});

import type { BillingRunList } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { BillingPlanService } from '../billing/billing-plan.service';
import type { BillingService } from '../billing/billing.service';
import type { ChargeSummary, TermInfo } from '../billing/billing.repository';
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

const summaryOf = (names: string[], skipped = 0): ChargeSummary => ({
  created: names.length,
  skipped,
  levelIds: [],
  sample: names.map((name, index) => ({ id: `student-${index}`, name })),
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

function setup(over: { term?: TermInfo; summary?: ChargeSummary } = {}) {
  const plans = {
    currentTerm: vi.fn().mockResolvedValue('term' in over ? over.term : term),
    summary: vi.fn().mockResolvedValue(over.summary ?? summaryOf([])),
    plan: vi.fn(),
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
    expect(plans.summary).not.toHaveBeenCalled();
    expect(plans.plan).not.toHaveBeenCalled();
  });

  it('gives nothing with no current term', async () => {
    const { service, plans } = setup({ term: undefined });
    expect(await service.tasks(biller)).toEqual([]);
    expect(plans.summary).not.toHaveBeenCalled();
  });

  it('names each unsent round and the sampled students a prepare would charge', async () => {
    const sample = ['Ada Obi', 'Bola Obi', 'Chi Obi', 'Dan Obi', 'Eve Obi'];
    const { service, billing, plans } = setup({
      summary: { ...summaryOf(sample), created: 6 },
    });
    const tasks = await service.tasks(biller);
    expect(plans.summary).toHaveBeenCalledWith(biller, term, 5);
    expect(plans.plan).not.toHaveBeenCalled();
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
          { id: 'student-0', name: 'Ada Obi' },
          { id: 'student-1', name: 'Bola Obi' },
          { id: 'student-2', name: 'Chi Obi' },
          { id: 'student-3', name: 'Dan Obi' },
          { id: 'student-4', name: 'Eve Obi' },
        ],
      },
    ]);
  });

  it('leaves out the uncharged task when everyone is charged', async () => {
    const { service, plans } = setup({ summary: summaryOf([], 4) });
    const tasks = await service.tasks(biller);
    expect(tasks.map((task) => task.kind)).toEqual(['unsentRound']);
    expect(plans.plan).not.toHaveBeenCalled();
  });
});

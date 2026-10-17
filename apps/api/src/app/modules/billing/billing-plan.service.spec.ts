import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { CampusService } from '../campus/campus.service';
import { BillingPlanService } from './billing-plan.service';
import type {
  BillingRepository,
  ChargeSummary,
  TermInfo,
} from './billing.repository';

const termOf = (id: string, sequence: number): TermInfo => ({
  id,
  name: `Term ${sequence}`,
  schoolYearName: '2026/2027',
  sessionId: 'session-1',
  isCurrent: sequence === 1,
  position: { sessionStartsOn: '2026-09-07', sequence },
});

const first = termOf('term-1', 1);
const second = termOf('term-2', 2);

const ctx = {
  organizationId: 'org-1',
  campusScope: ['lekki'],
} as unknown as OrgContext;

const summaryOf = (
  created: number,
  skipped: number,
  levelIds: string[] = []
): ChargeSummary => ({ created, skipped, levelIds, sample: [] });

function setup(summaries: Record<string, ChargeSummary>) {
  const billing = {
    termsToCharge: vi.fn().mockResolvedValue([first, second]),
    chargeSummary: vi.fn((_scope, term: TermInfo) =>
      Promise.resolve(summaries[term.id])
    ),
    candidates: vi.fn(),
    feeLines: vi.fn(),
    optedIn: vi.fn(),
    discounts: vi.fn(),
    discountsAccountId: vi.fn(),
  };
  const clock = new Clock();
  clock.set('2026-10-07');
  const service = new BillingPlanService(
    billing as unknown as BillingRepository,
    {} as CampusService,
    clock
  );
  return { service, billing };
}

const defaults = async (one: ChargeSummary, two: ChargeSummary) =>
  (await setup({ 'term-1': one, 'term-2': two }).service.terms(ctx)).map(
    (term) => term.isDefault
  );

describe('BillingPlanService.terms', () => {
  it('reads none, partly and all charged from the counts', async () => {
    const { service } = setup({
      'term-1': summaryOf(3, 0),
      'term-2': summaryOf(2, 1),
    });
    expect((await service.terms(ctx)).map((term) => term.charged)).toEqual([
      'none',
      'partly',
    ]);

    const charged = setup({
      'term-1': summaryOf(0, 3),
      'term-2': summaryOf(0, 0),
    });
    expect(
      (await charged.service.terms(ctx)).map((term) => term.charged)
    ).toEqual(['all', 'none']);
  });

  it('defaults to the first term that is not fully charged', async () => {
    expect(await defaults(summaryOf(1, 0), summaryOf(1, 0))).toEqual([
      true,
      false,
    ]);
    expect(await defaults(summaryOf(0, 2), summaryOf(1, 0))).toEqual([
      false,
      true,
    ]);
    expect(await defaults(summaryOf(0, 2), summaryOf(0, 2))).toEqual([
      true,
      false,
    ]);
  });

  it('passes the level ids and term details through', async () => {
    const { service } = setup({
      'term-1': summaryOf(1, 0, ['jss1', 'jss2']),
      'term-2': summaryOf(0, 0, []),
    });
    expect(await service.terms(ctx)).toEqual([
      {
        termId: 'term-1',
        name: 'Term 1',
        schoolYearName: '2026/2027',
        charged: 'none',
        isDefault: true,
        levelIds: ['jss1', 'jss2'],
      },
      {
        termId: 'term-2',
        name: 'Term 2',
        schoolYearName: '2026/2027',
        charged: 'none',
        isDefault: false,
        levelIds: [],
      },
    ]);
  });

  it('counts in SQL for the caller scope without building a plan', async () => {
    const { service, billing } = setup({
      'term-1': summaryOf(1, 0),
      'term-2': summaryOf(0, 1),
    });
    await service.terms(ctx);
    expect(billing.chargeSummary).toHaveBeenCalledWith(
      { organizationId: 'org-1', campusScope: ['lekki'] },
      first,
      { today: '2026-10-07', sampleSize: 0 }
    );
    expect(billing.chargeSummary).toHaveBeenCalledTimes(2);
    expect(billing.candidates).not.toHaveBeenCalled();
    expect(billing.feeLines).not.toHaveBeenCalled();
    expect(billing.discounts).not.toHaveBeenCalled();
  });
});

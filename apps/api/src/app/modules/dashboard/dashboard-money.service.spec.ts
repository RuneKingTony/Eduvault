import type { MoneyAccount, MoneyAccountList } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { BillingPlanService } from '../billing/billing-plan.service';
import type { TermInfo } from '../billing/billing-plan.repository';
import type { InvoiceService } from '../invoice/invoice.service';
import type { MoneyAccountService } from '../money-account/money-account.service';
import { DashboardMoneyService } from './dashboard-money.service';

const account = (overrides: Partial<MoneyAccount>): MoneyAccount => ({
  id: 'ma-1',
  name: 'GTBank current',
  kind: 'bank',
  campusId: null,
  campusName: null,
  bankName: 'GTBank',
  last4: '4417',
  ledgerAccountId: 'la-1',
  ledgerCode: 1210,
  balanceMinor: 9_500_000,
  retiredAt: null,
  ...overrides,
});

const term: TermInfo = {
  id: 'term-2',
  name: 'Second term',
  schoolYearName: '2026/2027',
  sessionId: 's1',
  isCurrent: true,
  position: { sessionStartsOn: '2026-09-07', sequence: 2 },
};

const serviceFor = (list: MoneyAccountList, over: { term?: TermInfo } = {}) => {
  const accounts = { list: vi.fn().mockResolvedValue(list) };
  const plans = {
    currentTerm: vi.fn().mockResolvedValue('term' in over ? over.term : term),
  };
  const invoices = {
    chargedIn: vi
      .fn()
      .mockResolvedValue({ currency: 'NGN', count: 3, totalMinor: 54_000_000 }),
  };
  return new DashboardMoneyService(
    accounts as unknown as MoneyAccountService,
    plans as unknown as BillingPlanService,
    invoices as unknown as InvoiceService
  );
};

const ctx = { organizationId: 'school-a' } as OrgContext;

describe('DashboardMoneyService.summary', () => {
  it('totals the visible active accounts and passes the hidden count on', async () => {
    const service = serviceFor({
      items: [
        account({}),
        account({
          id: 'ma-2',
          name: 'Moniepoint POS',
          kind: 'pos',
          campusId: 'lekki',
          campusName: 'Lekki',
          last4: null,
          balanceMinor: 1_200_000,
        }),
      ],
      hiddenSchoolWideCount: 1,
      currency: 'NGN',
    });
    expect(await service.summary(ctx)).toEqual({
      currency: 'NGN',
      totalMinor: 10_700_000,
      accounts: [
        {
          id: 'ma-1',
          name: 'GTBank current',
          kind: 'bank',
          campusName: null,
          last4: '4417',
          balanceMinor: 9_500_000,
        },
        {
          id: 'ma-2',
          name: 'Moniepoint POS',
          kind: 'pos',
          campusName: 'Lekki',
          last4: null,
          balanceMinor: 1_200_000,
        },
      ],
      hiddenSchoolWide: 1,
    });
  });

  it('leaves retired accounts out of the rows and the total', async () => {
    const service = serviceFor({
      items: [
        account({}),
        account({
          id: 'ma-3',
          balanceMinor: 400_000,
          retiredAt: '2026-10-01T09:00:00.000Z',
        }),
      ],
      hiddenSchoolWideCount: 0,
      currency: 'NGN',
    });
    const money = await service.summary(ctx);
    expect(money.accounts.map((row) => row.id)).toEqual(['ma-1']);
    expect(money.totalMinor).toBe(9_500_000);
  });

  it('answers an empty total with no accounts', async () => {
    const service = serviceFor({
      currency: 'NGN',
      items: [],
      hiddenSchoolWideCount: 0,
    });
    expect(await service.summary(ctx)).toEqual({
      currency: 'NGN',
      totalMinor: 0,
      accounts: [],
      hiddenSchoolWide: 0,
    });
  });
});

describe('DashboardMoneyService.charged', () => {
  const noAccounts: MoneyAccountList = {
    currency: 'NGN',
    items: [],
    hiddenSchoolWideCount: 0,
  };

  it('sums the sent term charges of the current term', async () => {
    const service = serviceFor(noAccounts);
    expect(await service.charged(ctx)).toEqual({
      currency: 'NGN',
      termId: 'term-2',
      termName: 'Second term, 2026/2027',
      chargedMinor: 54_000_000,
      chargeCount: 3,
    });
  });

  it('is null with no current term', async () => {
    const service = serviceFor(noAccounts, { term: undefined });
    expect(await service.charged(ctx)).toBeNull();
  });
});

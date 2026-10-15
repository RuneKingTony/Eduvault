import type { MoneyAccount, MoneyAccountList } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
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

const serviceFor = (list: MoneyAccountList) => {
  const accounts = { list: vi.fn().mockResolvedValue(list) };
  return new DashboardMoneyService(accounts as unknown as MoneyAccountService);
};

const ctx = { organizationId: 'school-a' } as OrgContext;

describe('DashboardMoneyService.money', () => {
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
    expect(await service.money(ctx)).toEqual({
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
    const money = await service.money(ctx);
    expect(money.accounts.map((row) => row.id)).toEqual(['ma-1']);
    expect(money.totalMinor).toBe(9_500_000);
  });

  it('answers an empty total with no accounts', async () => {
    const service = serviceFor({
      currency: 'NGN',
      items: [],
      hiddenSchoolWideCount: 0,
    });
    expect(await service.money(ctx)).toEqual({
      currency: 'NGN',
      totalMinor: 0,
      accounts: [],
      hiddenSchoolWide: 0,
    });
  });
});

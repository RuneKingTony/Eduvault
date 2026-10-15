import { screen } from '@testing-library/react';
import type { DashboardMoney } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { dashboardApi, renderInRouter } from '../../test-dashboard';
import { fakeAccess, ownerAccess } from '../../test-utils';
import { SchoolAccountCard } from './school-account-card';

const money = (overrides: Partial<DashboardMoney> = {}): DashboardMoney => ({
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
  hiddenSchoolWide: 0,
  ...overrides,
});

const scoped = () =>
  fakeAccess({
    roles: ['bursar'],
    permissions: toPermissionMap(['moneyAccount:read']),
    campusScope: ['lekki'],
  });

const renderCard = (
  data: DashboardMoney,
  access: ReturnType<typeof fakeAccess> = ownerAccess()
) => {
  renderInRouter(<SchoolAccountCard />, dashboardApi({ money: data }), access);
};

describe('SchoolAccountCard', () => {
  it('shows the total, the everything-received line and a row per account', async () => {
    renderCard(money());
    expect(await screen.findByText('₦107,000')).toBeInTheDocument();
    expect(screen.getByText('Everything received so far')).toBeInTheDocument();
    expect(screen.getByText('GTBank current')).toBeInTheDocument();
    expect(screen.getByText('School-wide · ending 4417')).toBeInTheDocument();
    expect(screen.getByText('₦95,000')).toBeInTheDocument();
    expect(screen.getByText('Moniepoint POS')).toBeInTheDocument();
    expect(screen.getByText('Lekki')).toBeInTheDocument();
    expect(screen.getByText('₦12,000')).toBeInTheDocument();
    expect(
      screen.queryByText(/school-wide account.* not shown/)
    ).not.toBeInTheDocument();
  });

  it('says it counts only the accounts a campus member can see, and counts the hidden ones', async () => {
    renderCard(
      money({
        totalMinor: 1_200_000,
        accounts: [money().accounts[1]!],
        hiddenSchoolWide: 1,
      }),
      scoped()
    );
    expect(
      await screen.findByText('In the accounts you can see')
    ).toBeInTheDocument();
    expect(screen.getAllByText('₦12,000')).toHaveLength(2);
    expect(
      screen.getByText('1 school-wide account not shown for your campus.')
    ).toBeInTheDocument();
  });

  it('says so in the plural', async () => {
    renderCard(money({ hiddenSchoolWide: 2 }), scoped());
    expect(
      await screen.findByText(
        '2 school-wide accounts not shown for your campus.'
      )
    ).toBeInTheDocument();
  });

  it('says there is nothing to show with no accounts', async () => {
    renderCard(money({ totalMinor: 0, accounts: [] }));
    expect(await screen.findByText('No accounts to show.')).toBeInTheDocument();
    expect(screen.getByText('₦0')).toBeInTheDocument();
  });
});

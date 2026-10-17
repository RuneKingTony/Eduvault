import { screen } from '@testing-library/react';
import type { DashboardStore } from '@eduvault/api-contract';
import { toPermissionMap } from '@eduvault/policy';
import { SHOW_COSTS_KEY } from '../store/use-show-costs';
import { dashboardApi, renderInRouter } from '../../test-dashboard';
import { NO_SALES, termFigures } from '../../test-store';
import { fakeAccess } from '../../test-utils';
import { StoreCard } from './store-card';

const reader = () =>
  fakeAccess({
    roles: ['administrator'],
    permissions: toPermissionMap(['store:read']),
    campusScope: 'all',
  });

const withStore = (store: DashboardStore) => dashboardApi({ store });

describe('StoreCard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows this term’s sales and items, and masks profit and stock value until Show costs is on', async () => {
    renderInRouter(
      <StoreCard />,
      withStore({ stockValueMinor: 70_000_000, ...termFigures() }),
      reader()
    );

    expect(await screen.findByText('₦27,000')).toBeVisible();
    expect(screen.getByText('3 students served')).toBeVisible();
    expect(screen.getByText('9')).toBeVisible();
    expect(screen.getByText('This term')).toBeVisible();
    expect(screen.getByText('Hidden · turn on Show costs')).toBeVisible();
    expect(screen.getAllByLabelText('Hidden')).toHaveLength(2);
    expect(screen.getByText('At cost')).toBeVisible();
    expect(screen.queryByText('₦700,000')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Store' })).toHaveAttribute(
      'href',
      '/finance/store'
    );
  });

  it('shows profit and the stock value once Show costs was switched on', async () => {
    localStorage.setItem(SHOW_COSTS_KEY, 'true');
    renderInRouter(
      <StoreCard />,
      withStore({ stockValueMinor: 70_000_000, ...termFigures() }),
      reader()
    );

    expect(await screen.findByText('₦700,000')).toBeVisible();
    expect(screen.getByText('₦7,000')).toBeVisible();
    expect(screen.getByText('Sales minus cost')).toBeVisible();
    expect(screen.queryByLabelText('Hidden')).not.toBeInTheDocument();
  });

  it('reads zero sales as zeros before anything is sold', async () => {
    localStorage.setItem(SHOW_COSTS_KEY, 'true');
    renderInRouter(
      <StoreCard />,
      withStore({ stockValueMinor: 0, ...NO_SALES }),
      reader()
    );

    expect(await screen.findByText('0 students served')).toBeVisible();
    expect(screen.getAllByText('₦0')).toHaveLength(3);
  });
});

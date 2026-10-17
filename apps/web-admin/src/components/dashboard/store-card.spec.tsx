import { screen } from '@testing-library/react';
import { toPermissionMap } from '@eduvault/policy';
import { SHOW_COSTS_KEY } from '../store/use-show-costs';
import { dashboardApi, renderInRouter } from '../../test-dashboard';
import { fakeAccess } from '../../test-utils';
import { StoreCard } from './store-card';

const reader = () =>
  fakeAccess({
    roles: ['administrator'],
    permissions: toPermissionMap(['store:read']),
    campusScope: 'all',
  });

describe('StoreCard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('masks the stock value until Show costs is on', async () => {
    renderInRouter(
      <StoreCard />,
      dashboardApi({ store: { stockValueMinor: 70_000_000 } }),
      reader()
    );
    expect(await screen.findByText('₦ ••••')).toBeInTheDocument();
    expect(screen.getByLabelText('Hidden')).toBeInTheDocument();
    expect(screen.getByText('At cost')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Store' })).toHaveAttribute(
      'href',
      '/finance/store'
    );
  });

  it('shows the stock value once Show costs was switched on', async () => {
    localStorage.setItem(SHOW_COSTS_KEY, 'true');
    renderInRouter(
      <StoreCard />,
      dashboardApi({ store: { stockValueMinor: 70_000_000 } }),
      reader()
    );
    expect(await screen.findByText('₦700,000')).toBeInTheDocument();
  });
});

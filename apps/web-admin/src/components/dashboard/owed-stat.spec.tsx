import { screen } from '@testing-library/react';
import { dashboardApi, finance, renderInRouter } from '../../test-dashboard';
import { OwedStat } from './owed-stat';

describe('OwedStat', () => {
  it('shows what is still owed and links to Who owes', async () => {
    renderInRouter(<OwedStat />, dashboardApi());
    expect(await screen.findByText('Still owed')).toBeInTheDocument();
    expect(screen.getByText('₦250,000')).toBeInTheDocument();
    expect(screen.getByText('9 students owe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Still owed/ })).toHaveAttribute(
      'href',
      '/finance/accounts'
    );
  });

  it('says one student owes', async () => {
    renderInRouter(
      <OwedStat />,
      dashboardApi({ finance: finance({ owingStudents: 1 }) })
    );
    expect(await screen.findByText('1 student owes')).toBeInTheDocument();
  });

  it('shows the owed figure to a reader who cannot see what was received', async () => {
    renderInRouter(
      <OwedStat />,
      dashboardApi({
        finance: { currency: 'NGN', owedMinor: 0, owingStudents: 0 },
      })
    );
    expect(await screen.findByText('Still owed')).toBeInTheDocument();
    expect(screen.getByText('0 students owe')).toBeInTheDocument();
  });

  it('shows nothing with no current term', async () => {
    const api = dashboardApi({ finance: null });
    renderInRouter(<OwedStat />, api);
    await vi.waitFor(() => {
      expect(api.dashboard.finance).toHaveBeenCalled();
    });
    expect(screen.queryByText('Still owed')).not.toBeInTheDocument();
  });

  it('shows its own error', async () => {
    const api = dashboardApi();
    api.dashboard.finance.mockRejectedValue(new Error('Finance is down'));
    renderInRouter(<OwedStat />, api);
    expect(await screen.findByText('Finance is down')).toBeInTheDocument();
  });
});

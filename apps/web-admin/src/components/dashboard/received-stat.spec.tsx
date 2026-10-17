import { screen } from '@testing-library/react';
import { dashboardApi, finance, renderInRouter } from '../../test-dashboard';
import { ReceivedStat } from './received-stat';

describe('ReceivedStat', () => {
  it('shows what was received and links to Payments', async () => {
    renderInRouter(<ReceivedStat />, dashboardApi());
    expect(await screen.findByText('Received')).toBeInTheDocument();
    expect(screen.getByText('₦900,000')).toBeInTheDocument();
    expect(screen.getByText('12 payments')).toBeInTheDocument();
    expect(screen.getByText('Received').closest('a')).toHaveAttribute(
      'href',
      '/finance/payments'
    );
  });

  it('says payment, not payments, for one', async () => {
    renderInRouter(
      <ReceivedStat />,
      dashboardApi({ finance: finance({ paymentCount: 1 }) })
    );
    expect(await screen.findByText('1 payment')).toBeInTheDocument();
  });

  it('shows nothing when the answer leaves the received fields out', async () => {
    const api = dashboardApi({
      finance: {
        currency: 'NGN',
        owedMinor: 25_000_000,
        owingStudents: 9,
      },
    });
    renderInRouter(<ReceivedStat />, api);
    await vi.waitFor(() => {
      expect(api.dashboard.finance).toHaveBeenCalled();
    });
    expect(screen.queryByText('Received')).not.toBeInTheDocument();
  });

  it('shows nothing with no current term', async () => {
    const api = dashboardApi({ finance: null });
    renderInRouter(<ReceivedStat />, api);
    await vi.waitFor(() => {
      expect(api.dashboard.finance).toHaveBeenCalled();
    });
    expect(screen.queryByText('Received')).not.toBeInTheDocument();
  });

  it('shows its own error', async () => {
    const api = dashboardApi();
    api.dashboard.finance.mockRejectedValue(new Error('Finance is down'));
    renderInRouter(<ReceivedStat />, api);
    expect(await screen.findByText('Finance is down')).toBeInTheDocument();
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ActivityItem } from '@eduvault/api-contract';
import { dashboardApi, renderInRouter } from '../../test-dashboard';
import { ActivityCard } from './activity-card';

const item = (n: number): ActivityItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  occurredAt: '2026-10-07T09:05:00.000Z',
  pillar: 'foundation',
  text: `Event ${n}`,
});

describe('ActivityCard', () => {
  it('starts collapsed with the total in a badge', async () => {
    const api = dashboardApi({
      activity: { items: [item(1)], total: 1 },
    });
    renderInRouter(<ActivityCard />, api);
    expect(await screen.findByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('Event 1')).not.toBeInTheDocument();
  });

  it('shows the Lagos time, the pillar and the text once opened', async () => {
    const api = dashboardApi({ activity: { items: [item(1)], total: 1 } });
    renderInRouter(<ActivityCard />, api);
    fireEvent.click(await screen.findByText('Recent activity'));
    expect(await screen.findByText('Event 1')).toBeInTheDocument();
    expect(screen.getByText('2026-10-07 10:05')).toBeInTheDocument();
    expect(screen.getByText('Foundation')).toBeInTheDocument();
  });

  it('pages ten at a time', async () => {
    const api = dashboardApi({
      activity: {
        items: Array.from({ length: 10 }, (_, n) => item(n + 1)),
        total: 12,
      },
    });
    renderInRouter(<ActivityCard />, api);
    fireEvent.click(await screen.findByText('Recent activity'));
    fireEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() => {
      expect(api.activity.list).toHaveBeenCalledWith({ query: { page: 2 } });
    });
  });

  it('says there is no activity yet', async () => {
    renderInRouter(<ActivityCard />, dashboardApi());
    fireEvent.click(await screen.findByText('Recent activity'));
    expect(await screen.findByText('No activity yet')).toBeInTheDocument();
  });

  it('shows its own error', async () => {
    const api = dashboardApi();
    api.activity.list.mockRejectedValue(new Error('Activity is unavailable'));
    renderInRouter(<ActivityCard />, api);
    expect(
      await screen.findByText('Activity is unavailable')
    ).toBeInTheDocument();
  });
});

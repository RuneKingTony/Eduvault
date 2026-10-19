import { screen } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import {
  NOTICE_ID,
  SECOND_NOTICE_ID,
  announcementSummary,
  dashboardApi,
  renderInRouter,
} from '../../test-dashboard';
import { fakeAccess, starterAccess } from '../../test-utils';
import { AnnouncementsCard } from './announcements-card';

describe('AnnouncementsCard', () => {
  it('asks for four items and lists each with its date and tag', async () => {
    const api = dashboardApi({
      announcements: [
        announcementSummary({ id: NOTICE_ID, title: 'PTA meeting' }),
        announcementSummary({
          id: SECOND_NOTICE_ID,
          title: 'Fees due',
          tag: 'fees',
          publishedOn: '2026-10-01',
        }),
      ],
    });
    renderInRouter(<AnnouncementsCard />, api, starterAccess('administrator'));
    expect(await screen.findByText('PTA meeting')).toBeInTheDocument();
    expect(screen.getByText('9 Oct 2026 · Event')).toBeInTheDocument();
    expect(screen.getByText('1 Oct 2026 · Fees')).toBeInTheDocument();
    expect(api.announcements.feed).toHaveBeenCalledWith({
      query: { limit: 4 },
    });
  });

  it('marks a pinned item and tones its bell', async () => {
    const api = dashboardApi({
      announcements: [announcementSummary({ pinned: true })],
    });
    renderCard(api);
    expect(
      await screen.findByText('9 Oct 2026 · Event · Pinned')
    ).toBeInTheDocument();
    expect(document.querySelector('li svg')).toHaveClass('text-warning');
  });

  it('keeps an unpinned bell muted', async () => {
    renderCard(dashboardApi({ announcements: [announcementSummary()] }));
    await screen.findByText('PTA meeting');
    expect(document.querySelector('li svg')).toHaveClass(
      'text-muted-foreground'
    );
  });

  it('links All to the page only for someone with announcement:read', async () => {
    renderInRouter(
      <AnnouncementsCard />,
      dashboardApi(),
      starterAccess('administrator')
    );
    expect(await screen.findByRole('link', { name: 'All' })).toHaveAttribute(
      'href',
      '/announcements'
    );
  });

  it('hides All from a member without announcement:read', async () => {
    renderCard(dashboardApi({ announcements: [announcementSummary()] }));
    await screen.findByText('PTA meeting');
    expect(screen.queryByRole('link', { name: 'All' })).not.toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    renderCard(dashboardApi());
    expect(await screen.findByText('No announcements')).toBeInTheDocument();
  });

  it('shows its own error', async () => {
    const api = dashboardApi();
    api.announcements.feed.mockRejectedValue(
      new ApiError(500, { code: 'InternalError', message: 'Feed is down' })
    );
    renderCard(api);
    expect(await screen.findByText('Feed is down')).toBeInTheDocument();
  });
});

function renderCard(api: ReturnType<typeof dashboardApi>) {
  renderInRouter(
    <AnnouncementsCard />,
    api,
    fakeAccess({ roles: ['teacher'], permissions: { class: ['read'] } })
  );
}

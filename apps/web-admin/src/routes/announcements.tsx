import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { AnnouncementsPage } from '../pages/announcements-page';
import { announcementsQueryOptions } from '../queries';

export const Route = createFileRoute('/announcements')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/announcements');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...announcementsQueryOptions(api, 'published', 1),
      staleTime: 'static',
    });
  },
  component: AnnouncementsPage,
});

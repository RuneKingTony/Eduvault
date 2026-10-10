import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { SchoolProfilePage } from '../pages/school-profile-page';
import { schoolProfileQueryOptions } from '../queries';

export const Route = createFileRoute('/settings/profile')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/settings/profile');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...schoolProfileQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: SchoolProfilePage,
});

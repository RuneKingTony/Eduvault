import { createFileRoute } from '@tanstack/react-router';
import { CampusesPage } from '../pages/campuses-page';
import { campusesQueryOptions } from '../queries';

export const Route = createFileRoute('/campuses')({
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...campusesQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: CampusesPage,
});

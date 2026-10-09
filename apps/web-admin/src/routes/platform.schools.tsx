import { createFileRoute } from '@tanstack/react-router';
import { PlatformSchoolsPage } from '../pages/platform-schools-page';
import { platformSchoolsQueryOptions } from '../queries';

export const Route = createFileRoute('/platform/schools')({
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...platformSchoolsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: PlatformSchoolsPage,
});

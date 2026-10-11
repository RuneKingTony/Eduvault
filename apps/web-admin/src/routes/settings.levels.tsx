import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { LevelsPage } from '../pages/levels-page';
import { classLevelsQueryOptions } from '../queries';

export const Route = createFileRoute('/settings/levels')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/settings/levels');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...classLevelsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: LevelsPage,
});

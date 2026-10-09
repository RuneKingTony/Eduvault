import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { FeesPage } from '../pages/fees-page';
import { feeSchedulesQueryOptions } from '../queries';

export const Route = createFileRoute('/fees')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/fees');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...feeSchedulesQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: FeesPage,
});

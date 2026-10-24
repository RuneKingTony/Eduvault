import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { OnlinePaymentsPage } from '../pages/online-payments-page';
import { gatewayConnectionQueryOptions } from '../queries';

export const Route = createFileRoute('/settings/online-payments')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/settings/online-payments');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...gatewayConnectionQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: OnlinePaymentsPage,
});

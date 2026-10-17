import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { PaymentRulesPage } from '../pages/payment-rules-page';
import { schoolSettingsQueryOptions } from '../queries';

export const Route = createFileRoute('/settings/payment-rules')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/settings/payment-rules');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...schoolSettingsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: PaymentRulesPage,
});

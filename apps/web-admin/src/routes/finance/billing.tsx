import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { parseBillingSearch } from '../../billing-search';
import { BillingPage } from '../../pages/billing-page';
import { billingRunsQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/billing')({
  validateSearch: parseBillingSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/billing');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...billingRunsQueryOptions(api, 1),
      staleTime: 'static',
    });
  },
  component: BillingRoute,
});

function BillingRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <BillingPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}

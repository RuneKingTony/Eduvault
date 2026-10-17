import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { PaymentsPage } from '../../pages/payments-page';
import { parsePaymentsSearch } from '../../payments-search';
import { paymentsQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/payments')({
  validateSearch: parsePaymentsSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/payments');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...paymentsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: PaymentsRoute,
});

function PaymentsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PaymentsPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}

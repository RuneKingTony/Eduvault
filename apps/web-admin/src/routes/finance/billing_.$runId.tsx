import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { parseRunSearch } from '../../billing-search';
import { BillingRunPage } from '../../pages/billing-run-page';
import { billingRunQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/billing_/$runId')({
  validateSearch: parseRunSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/billing');
  },
  loader: async ({ context: { queryClient, api }, params: { runId } }) => {
    await queryClient
      .query({ ...billingRunQueryOptions(api, runId, 1), staleTime: 'static' })
      .catch(() => undefined);
  },
  component: BillingRunRoute,
});

function BillingRunRoute() {
  const { runId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <BillingRunPage
      key={runId}
      runId={runId}
      page={search.page ?? 1}
      onPage={(page) => {
        void navigate({
          search: { page: page > 1 ? page : undefined },
          replace: true,
        });
      }}
      onBack={() => {
        void navigate({
          to: '/finance/billing',
          search: { page: undefined, prepare: undefined },
        });
      }}
    />
  );
}

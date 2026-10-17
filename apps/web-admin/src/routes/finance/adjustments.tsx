import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { parseAdjustmentsSearch } from '../../adjustments-search';
import { PaymentsLayout } from '../../components/finance-layout';
import { AdjustmentsPage } from '../../pages/adjustments-page';
import { adjustmentsQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/adjustments')({
  validateSearch: parseAdjustmentsSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/adjustments');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...adjustmentsQueryOptions(api, 1),
      staleTime: 'static',
    });
  },
  component: AdjustmentsRoute,
});

function AdjustmentsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PaymentsLayout>
      <AdjustmentsPage
        search={search}
        onSearchChange={(next) => {
          void navigate({ search: next, replace: true });
        }}
      />
    </PaymentsLayout>
  );
}

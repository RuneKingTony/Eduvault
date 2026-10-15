import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { parseFeesSearch } from '../../fees-search';
import { OtherFeesPage } from '../../pages/other-fees-page';
import { schoolYearsQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/other-fees')({
  validateSearch: parseFeesSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/other-fees');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...schoolYearsQueryOptions(api, 1),
      staleTime: 'static',
    });
  },
  component: OtherFeesRoute,
});

function OtherFeesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <OtherFeesPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}

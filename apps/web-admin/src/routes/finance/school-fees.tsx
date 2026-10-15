import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { parseFeesSearch } from '../../fees-search';
import { SchoolFeesPage } from '../../pages/school-fees-page';
import { schoolYearsQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/school-fees')({
  validateSearch: parseFeesSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/school-fees');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...schoolYearsQueryOptions(api, 1),
      staleTime: 'static',
    });
  },
  component: SchoolFeesRoute,
});

function SchoolFeesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <SchoolFeesPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { parseAccountsSearch } from '../../accounts-search';
import { WhoOwesPage } from '../../pages/who-owes-page';
import { balancesQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/accounts')({
  validateSearch: parseAccountsSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/accounts');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...balancesQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: AccountsRoute,
});

function AccountsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WhoOwesPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}

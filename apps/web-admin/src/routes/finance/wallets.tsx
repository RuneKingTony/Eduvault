import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { WalletsPage } from '../../pages/wallets-page';
import { walletsQueryOptions } from '../../queries';
import { parseWalletsSearch } from '../../wallets-search';

export const Route = createFileRoute('/finance/wallets')({
  validateSearch: parseWalletsSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/wallets');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...walletsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: WalletsRoute,
});

function WalletsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WalletsPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}

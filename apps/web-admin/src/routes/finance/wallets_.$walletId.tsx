import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { WalletPage } from '../../pages/wallet-page';
import { walletQueryOptions } from '../../queries';
import { parseWalletSearch } from '../../wallets-search';

export const Route = createFileRoute('/finance/wallets_/$walletId')({
  validateSearch: parseWalletSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/wallets');
  },
  loader: async ({ context: { queryClient, api }, params: { walletId } }) => {
    await queryClient
      .query({ ...walletQueryOptions(api, walletId), staleTime: 'static' })
      .catch(() => undefined);
  },
  component: WalletRoute,
});

function WalletRoute() {
  const { walletId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WalletPage
      key={walletId}
      walletId={walletId}
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}

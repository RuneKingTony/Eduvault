import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { FinanceLayout } from '../../components/finance-layout';
import { parseLedgerSearch } from '../../ledger-search';
import { MoneyCategoriesPage } from '../../pages/money-categories-page';
import { ledgerAccountsQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/ledger')({
  validateSearch: parseLedgerSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/ledger');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...ledgerAccountsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: MoneyCategoriesRoute,
});

function MoneyCategoriesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <FinanceLayout>
      <MoneyCategoriesPage
        tab={search.tab === 'journal' ? 'journal' : 'categories'}
        onTabChange={(tab) => {
          void navigate({
            search: { tab: tab === 'journal' ? 'journal' : undefined },
            replace: true,
          });
        }}
      />
    </FinanceLayout>
  );
}

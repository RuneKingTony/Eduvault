import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { FinanceLayout } from '../../components/finance-layout';
import { moneyAccountsLanding } from '../../money-accounts-access';
import { MoneyAccountsPage } from '../../pages/money-accounts-page';
import { moneyAccountsQueryOptions } from '../../queries';
import { redirectTo } from '../../redirect-to';

export const Route = createFileRoute('/finance/money-accounts')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/money-accounts');
    if (moneyAccountsLanding(context.access) === '/finance/ledger') {
      redirectTo('/finance/ledger');
    }
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...moneyAccountsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: MoneyAccountsRoute,
});

function MoneyAccountsRoute() {
  return (
    <FinanceLayout>
      <MoneyAccountsPage />
    </FinanceLayout>
  );
}

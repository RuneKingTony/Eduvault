import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { CreditMigrationPage } from '../../pages/credit-migration-page';
import { creditMigrationQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/wallets_/credit-migration')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/wallets/credit-migration');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient
      .query({ ...creditMigrationQueryOptions(api), staleTime: 'static' })
      .catch(() => undefined);
  },
  component: CreditMigrationPage,
});

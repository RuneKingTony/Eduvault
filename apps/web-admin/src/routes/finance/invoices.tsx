import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { parseInvoicesSearch } from '../../invoices-search';
import { InvoicesPage } from '../../pages/invoices-page';
import { invoicesQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/invoices')({
  validateSearch: parseInvoicesSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/invoices');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...invoicesQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: InvoicesRoute,
});

function InvoicesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <InvoicesPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}

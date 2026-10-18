import { createFileRoute } from '@tanstack/react-router';
import { can } from '@eduvault/policy';
import { requireGate } from '../../access';
import { parseInvoicesSearch } from '../../invoices-search';
import { InvoicesPage } from '../../pages/invoices-page';
import {
  currentTermQueryOptions,
  feeTypesQueryOptions,
  invoicesQueryOptions,
} from '../../queries';

export const Route = createFileRoute('/finance/invoices')({
  validateSearch: parseInvoicesSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/invoices');
  },
  loaderDeps: ({ search }) => ({ adding: search.new === 1 }),
  loader: async ({ context: { queryClient, api, access }, deps }) => {
    const sheet =
      deps.adding || can(access?.permissions ?? {}, 'invoice', 'charge');
    await Promise.all([
      queryClient.query({
        ...invoicesQueryOptions(api),
        staleTime: 'static',
      }),
      ...(sheet
        ? [
            queryClient
              .query({ ...currentTermQueryOptions(api), staleTime: 'static' })
              .catch(() => undefined),
            queryClient
              .query({ ...feeTypesQueryOptions(api), staleTime: 'static' })
              .catch(() => undefined),
          ]
        : []),
    ]);
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

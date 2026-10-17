import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { InvoicePage } from '../../pages/invoice-page';
import { invoiceQueryOptions } from '../../queries';
import { searchFor } from '../../route-search-defaults';

export const Route = createFileRoute('/finance/invoices_/$invoiceId')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/invoices');
  },
  loader: async ({ context: { queryClient, api }, params: { invoiceId } }) => {
    await queryClient
      .query({ ...invoiceQueryOptions(api, invoiceId), staleTime: 'static' })
      .catch(() => undefined);
  },
  component: InvoiceRoute,
});

function InvoiceRoute() {
  const { invoiceId } = Route.useParams();
  const navigate = Route.useNavigate();
  return (
    <InvoicePage
      key={invoiceId}
      invoiceId={invoiceId}
      onBack={() => {
        void navigate({
          to: '/finance/invoices',
          search: searchFor('/finance/invoices'),
        });
      }}
    />
  );
}

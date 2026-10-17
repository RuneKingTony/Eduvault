import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { parseReceiptSearch } from '../../payments-search';
import { ReceiptPage } from '../../pages/receipt-page';
import { paymentQueryOptions } from '../../queries';

export const Route = createFileRoute('/finance/payments_/$paymentId')({
  validateSearch: parseReceiptSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/payments');
  },
  loader: async ({ context: { queryClient, api }, params: { paymentId } }) => {
    await queryClient
      .query({ ...paymentQueryOptions(api, paymentId), staleTime: 'static' })
      .catch(() => undefined);
  },
  component: ReceiptRoute,
});

function ReceiptRoute() {
  const { paymentId } = Route.useParams();
  const { recorded } = Route.useSearch();
  return (
    <ReceiptPage
      key={paymentId}
      paymentId={paymentId}
      recorded={recorded === 1}
    />
  );
}

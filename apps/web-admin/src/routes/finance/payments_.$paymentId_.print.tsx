import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { ReceiptPrintPage } from '../../pages/receipt-print-page';
import {
  paymentQueryOptions,
  schoolProfileQueryOptions,
  schoolSettingsQueryOptions,
} from '../../queries';

export const Route = createFileRoute('/finance/payments_/$paymentId_/print')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/payments');
  },
  loader: async ({ context: { queryClient, api }, params: { paymentId } }) => {
    await Promise.all([
      queryClient
        .query({ ...paymentQueryOptions(api, paymentId), staleTime: 'static' })
        .catch(() => undefined),
      queryClient.query({
        ...schoolProfileQueryOptions(api),
        staleTime: 'static',
      }),
      queryClient.query({
        ...schoolSettingsQueryOptions(api),
        staleTime: 'static',
      }),
    ]);
  },
  component: PrintRoute,
});

function PrintRoute() {
  const { paymentId } = Route.useParams();
  return <ReceiptPrintPage key={paymentId} paymentId={paymentId} />;
}

import { useQuery } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
import type { Invoice } from '@eduvault/api-contract';
import { Alert, AlertDescription } from '@eduvault/ui';
import { useApi } from '../api';
import {
  BackButton,
  DetailCrumbs,
  DetailNotFound,
  DetailPage,
} from '../components/detail-page';
import { InvoiceHeader } from '../components/invoices/invoice-header';
import { InvoiceJournalCard } from '../components/invoices/invoice-journal-card';
import { InvoiceLinesCard } from '../components/invoices/invoice-lines-card';
import {
  AmountDueCard,
  InvoiceDetailsCard,
} from '../components/invoices/invoice-side-cards';
import { invoiceQueryOptions } from '../queries';

function Crumbs({ last, onBack }: { last: string; onBack: () => void }) {
  return (
    <DetailCrumbs
      parent={
        <button type="button" onClick={onBack}>
          Charges
        </button>
      }
      last={last}
    />
  );
}

function InvoiceNotFound({ onBack }: { onBack: () => void }) {
  return (
    <DetailNotFound
      heading="Not found"
      crumbs={<Crumbs last="Not found" onBack={onBack} />}
      title="No charge here"
      back={<BackButton label="Back to charges" onBack={onBack} />}
    />
  );
}

function InvoiceBody({
  invoice,
  onBack,
}: {
  invoice: Invoice;
  onBack: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <Crumbs last={invoice.number ?? 'Prepared'} onBack={onBack} />
      <InvoiceHeader invoice={invoice} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <InvoiceLinesCard invoice={invoice} />
          {invoice.journal === null ? (
            <Alert>
              <InfoIcon />
              <AlertDescription>
                Nothing is recorded in the books until these charges are sent.
              </AlertDescription>
            </Alert>
          ) : (
            <InvoiceJournalCard
              journal={invoice.journal}
              currency={invoice.currency}
            />
          )}
        </div>
        <div className="flex flex-col gap-4">
          <AmountDueCard invoice={invoice} />
          <InvoiceDetailsCard invoice={invoice} />
        </div>
      </div>
    </section>
  );
}

export function InvoicePage({
  invoiceId,
  onBack,
}: {
  invoiceId: string;
  onBack: () => void;
}) {
  const invoice = useQuery(invoiceQueryOptions(useApi(), invoiceId));
  return (
    <DetailPage
      queries={[invoice]}
      notFound={<InvoiceNotFound onBack={onBack} />}
    >
      {([data]) => <InvoiceBody invoice={data} onBack={onBack} />}
    </DetailPage>
  );
}

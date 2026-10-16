import { useQuery } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
import { ApiError, type Invoice } from '@eduvault/api-contract';
import {
  Alert,
  AlertDescription,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  ErrorMessage,
  NotFoundState,
  PageSkeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { KIND_LABELS } from '../components/billing/billing-text';
import { StatusBadge } from '../components/billing/status-badge';
import { InvoiceJournalCard } from '../components/invoices/invoice-journal-card';
import { InvoiceLinesCard } from '../components/invoices/invoice-lines-card';
import {
  AmountDueCard,
  InvoiceDetailsCard,
} from '../components/invoices/invoice-side-cards';
import { invoiceQueryOptions } from '../queries';

function Crumbs({ last, onBack }: { last: string; onBack: () => void }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <button type="button" onClick={onBack}>
              Charges
            </button>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{last}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function InvoiceNotFound({ onBack }: { onBack: () => void }) {
  return (
    <section className="flex flex-col gap-4">
      <Crumbs last="Not found" onBack={onBack} />
      <h1>Not found</h1>
      <NotFoundState
        title="No charge here"
        description="It may have been moved, or it may belong to a campus you don’t look after."
      >
        <Button type="button" variant="outline" onClick={onBack}>
          Back to charges
        </Button>
      </NotFoundState>
    </section>
  );
}

function InvoiceHeader({ invoice }: { invoice: Invoice }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="flex items-center gap-2">
        {invoice.number ?? 'Prepared charge'}
        <StatusBadge status={invoice.status} />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="About this charge"
              className="text-muted-foreground"
            >
              <InfoIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            A charge that has been sent never changes. A mistake is fixed with
            an approved fee reduction.
          </TooltipContent>
        </Tooltip>
      </h1>
      <p className="text-sm text-muted-foreground">
        {[
          KIND_LABELS[invoice.kind],
          invoice.student.name,
          invoice.student.armName,
        ]
          .filter((part): part is string => part !== null)
          .join(' · ')}
      </p>
    </header>
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
  if (invoice.error instanceof ApiError && invoice.error.status === 404) {
    return <InvoiceNotFound onBack={onBack} />;
  }
  if (invoice.isError) {
    return <ErrorMessage error={invoice.error} />;
  }
  if (invoice.data === undefined) {
    return <PageSkeleton rows={2} />;
  }
  return <InvoiceBody invoice={invoice.data} onBack={onBack} />;
}

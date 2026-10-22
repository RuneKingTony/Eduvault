import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BanIcon, CheckCircle2Icon, InfoIcon } from 'lucide-react';
import type { Payment } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { fmtDate, money } from '@eduvault/shared';
import { Alert, AlertDescription, Badge, Button } from '@eduvault/ui';
import { useApi } from '../api';
import {
  DetailCrumbs,
  DetailNotFound,
  DetailPage,
} from '../components/detail-page';
import { InvoiceJournalCard } from '../components/invoices/invoice-journal-card';
import { STATUS_LABELS } from '../components/payments/payment-text';
import {
  PaymentsLink,
  PrintReceiptButton,
} from '../components/payments/payment-links';
import {
  RequestVoidDialog,
  canRequestVoid,
} from '../components/payments/request-void-dialog';
import {
  AllocationCard,
  ReceiptDetailsCard,
} from '../components/payments/receipt-cards';
import { VoidCallout } from '../components/payments/void-callouts';
import { paymentQueryOptions } from '../queries';

function Crumbs({ last }: { last: string }) {
  return (
    <DetailCrumbs parent={<PaymentsLink>Payments</PaymentsLink>} last={last} />
  );
}

function BackToPayments() {
  return (
    <Button asChild variant="outline">
      <PaymentsLink>Back to payments</PaymentsLink>
    </Button>
  );
}

function ReceiptNotFound() {
  return (
    <DetailNotFound
      heading="Not found"
      crumbs={<Crumbs last="Not found" />}
      title="No receipt here"
      back={<BackToPayments />}
    />
  );
}

function Summary({ payment }: { payment: Payment }) {
  const amount = money(payment.amountMinor, payment.currency);
  const rest = `from ${payment.payerName} on ${fmtDate(payment.paidOn)}`;
  return payment.status === 'voided' ? (
    <p className="text-sm text-muted-foreground">
      <span className="line-through">{amount}</span> {rest}
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">
      {amount} {rest}
    </p>
  );
}

function ReceiptHeader({
  payment,
  onRequestVoid,
}: {
  payment: Payment;
  onRequestVoid: () => void;
}) {
  const permitted = useCan('payment', 'void');
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          Receipt {payment.receiptNumber}
          <Badge variant={payment.status === 'posted' ? 'success' : 'outline'}>
            {STATUS_LABELS[payment.status]}
          </Badge>
        </h1>
        <Summary payment={payment} />
      </div>
      <div className="flex flex-wrap gap-2">
        <PrintReceiptButton paymentId={payment.id} />
        {canRequestVoid(payment, permitted) ? (
          <Button type="button" variant="destructive" onClick={onRequestVoid}>
            <BanIcon />
            Request void
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function Journals({ payment }: { payment: Payment }) {
  return (
    <>
      {payment.entry === null ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Nothing is recorded in the books for this payment.
          </AlertDescription>
        </Alert>
      ) : (
        <InvoiceJournalCard
          journal={payment.entry}
          currency={payment.currency}
        />
      )}
      {payment.voidEntry === null ? null : (
        <InvoiceJournalCard
          journal={payment.voidEntry}
          currency={payment.currency}
          note="(cancellation)"
        />
      )}
    </>
  );
}

function ReceiptBody({
  payment,
  recorded,
}: {
  payment: Payment;
  recorded: boolean;
}) {
  const [voiding, setVoiding] = useState(false);
  return (
    <section className="flex flex-col gap-4">
      <Crumbs last={payment.receiptNumber} />
      <ReceiptHeader
        payment={payment}
        onRequestVoid={() => {
          setVoiding(true);
        }}
      />
      {recorded ? (
        <Alert>
          <CheckCircle2Icon />
          <AlertDescription>
            Payment recorded. Entering it again by mistake will not record it
            twice.
          </AlertDescription>
        </Alert>
      ) : null}
      <VoidCallout payment={payment} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <AllocationCard payment={payment} />
          <Journals payment={payment} />
        </div>
        <ReceiptDetailsCard payment={payment} />
      </div>
      <RequestVoidDialog
        payment={payment}
        open={voiding}
        onOpenChange={setVoiding}
      />
    </section>
  );
}

export function ReceiptPage({
  paymentId,
  recorded = false,
}: {
  paymentId: string;
  recorded?: boolean;
}) {
  const payment = useQuery(paymentQueryOptions(useApi(), paymentId));
  return (
    <DetailPage queries={[payment]} notFound={<ReceiptNotFound />}>
      {([data]) => <ReceiptBody payment={data} recorded={recorded} />}
    </DetailPage>
  );
}

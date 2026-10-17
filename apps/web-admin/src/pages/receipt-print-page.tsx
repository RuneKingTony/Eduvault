import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { PrinterIcon } from 'lucide-react';
import {
  ApiError,
  type Payment,
  type SchoolProfile,
  PAYMENT_METHOD_LABELS,
} from '@eduvault/api-contract';
import { fmtDate, initials, logoSrc, money } from '@eduvault/shared';
import {
  Button,
  ErrorMessage,
  NotFoundState,
  PageSkeleton,
  SchoolCrest,
} from '@eduvault/ui';
import { useApi } from '../api';
import { BackToReceiptButton } from '../components/payments/payment-links';
import { API_URL } from '../env';
import {
  paymentQueryOptions,
  schoolProfileQueryOptions,
  schoolSettingsQueryOptions,
} from '../queries';

function Facts({ payment }: { payment: Payment }) {
  const rows: [string, string][] = [
    ['Paid on', fmtDate(payment.paidOn)],
    ['Payer', payment.payerName],
    ['How they paid', PAYMENT_METHOD_LABELS[payment.method]],
    ['Our reference', payment.reference],
    ...(payment.providerReference === null
      ? []
      : [
          ['Bank or POS reference', payment.providerReference] as [
            string,
            string,
          ],
        ]),
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Letterhead({ profile }: { profile: SchoolProfile }) {
  const contact = [profile.address, profile.city, profile.phone]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
  return (
    <header className="flex items-center gap-3 border-b pb-3">
      <SchoolCrest
        name={profile.name}
        initials={initials(profile.name)}
        logoUrl={logoSrc(API_URL, profile.logoUrl)}
        className="size-12"
      />
      <div className="flex flex-col">
        <p className="text-lg font-semibold">{profile.name}</p>
        <p className="text-xs text-muted-foreground">{contact}</p>
      </div>
    </header>
  );
}

function Lines({ payment }: { payment: Payment }) {
  const { currency } = payment;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="py-1 font-normal">Student</th>
          <th className="py-1 font-normal">Class</th>
          <th className="py-1 text-right font-normal">Amount</th>
        </tr>
      </thead>
      <tbody>
        {payment.allocations.map((row) => (
          <tr key={row.studentId} className="border-b">
            <td className="py-1">{row.studentName}</td>
            <td className="py-1">{row.className ?? ''}</td>
            <td className="py-1 text-right tabular-nums">
              {money(row.amountMinor, currency)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="py-1 font-medium" colSpan={2}>
            Total
          </td>
          <td className="py-1 text-right font-medium tabular-nums">
            {money(payment.amountMinor, currency)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function Sheet({
  payment,
  profile,
  footer,
}: {
  payment: Payment;
  profile: SchoolProfile;
  footer: string;
}) {
  return (
    <article className="mx-auto flex w-full max-w-[148mm] flex-col gap-4 bg-background p-6 text-foreground">
      <Letterhead profile={profile} />
      <h2 className="flex items-center gap-2 text-base font-semibold">
        Receipt {payment.receiptNumber}
        {payment.status === 'voided' ? (
          <span className="rounded-sm border border-destructive px-1.5 text-xs text-destructive">
            Cancelled
          </span>
        ) : null}
      </h2>
      <Facts payment={payment} />
      <Lines payment={payment} />
      {payment.recordedBy === null ? null : (
        <p className="text-sm">Recorded by {payment.recordedBy}</p>
      )}
      <p className="border-t pt-3 text-center text-sm text-muted-foreground">
        {footer}
      </p>
    </article>
  );
}

function PrintBody({
  payment,
  profile,
  footer,
}: {
  payment: Payment;
  profile: SchoolProfile;
  footer: string;
}) {
  useEffect(() => {
    globalThis.print();
  }, []);
  return (
    <section className="flex flex-col gap-4 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <BackToReceiptButton paymentId={payment.id} />
        <Button
          type="button"
          onClick={() => {
            globalThis.print();
          }}
        >
          <PrinterIcon />
          Print receipt
        </Button>
      </div>
      <div className="rounded-lg border">
        <Sheet payment={payment} profile={profile} footer={footer} />
      </div>
      {createPortal(
        <div
          data-print-slips
          data-print-receipt
          className="hidden bg-background print:block"
        >
          <Sheet payment={payment} profile={profile} footer={footer} />
        </div>,
        document.body
      )}
    </section>
  );
}

export function ReceiptPrintPage({ paymentId }: { paymentId: string }) {
  const api = useApi();
  const payment = useQuery(paymentQueryOptions(api, paymentId));
  const profile = useQuery(schoolProfileQueryOptions(api));
  const settings = useQuery(schoolSettingsQueryOptions(api));
  if (payment.error instanceof ApiError && payment.error.status === 404) {
    return (
      <NotFoundState
        title="No receipt here"
        description="It may have been moved, or it may belong to a campus you don’t look after."
      />
    );
  }
  const failure = payment.error ?? profile.error ?? settings.error;
  if (failure !== null) {
    return <ErrorMessage error={failure} />;
  }
  if (
    payment.data === undefined ||
    profile.data === undefined ||
    settings.data === undefined
  ) {
    return <PageSkeleton rows={2} />;
  }
  return (
    <PrintBody
      payment={payment.data}
      profile={profile.data}
      footer={settings.data.receiptFooter}
    />
  );
}

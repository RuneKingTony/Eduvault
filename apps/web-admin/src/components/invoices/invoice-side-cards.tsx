import { Link } from '@tanstack/react-router';
import { InfoIcon } from 'lucide-react';
import type { Invoice } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { fmtTimestamp, money } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { NOT_NUMBERED } from '../billing/billing-text';

function Row({
  label,
  hint,
  strong = false,
  children,
}: {
  label: string;
  hint?: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 text-sm ${strong ? 'font-semibold' : ''}`}
    >
      <dt className="flex items-center gap-1 text-muted-foreground">
        {label}
        {hint === undefined ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${label.toLowerCase()}`}
                className="text-muted-foreground"
              >
                <InfoIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        )}
      </dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

function issuedText(invoice: Invoice): string {
  if (invoice.issuedAt === null) {
    return '—';
  }
  const when = fmtTimestamp(invoice.issuedAt);
  return invoice.issuedBy === null ? when : `${when} by ${invoice.issuedBy}`;
}

export function AmountDueCard({ invoice }: { invoice: Invoice }) {
  const { currency } = invoice;
  return (
    <Card>
      <CardHeader>
        <p className="text-sm text-muted-foreground">Due at issue</p>
        <CardTitle className="text-2xl tabular-nums">
          {money(invoice.dueAtIssueMinor, currency)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2">
          <Row label="This charge">{money(invoice.totalMinor, currency)}</Row>
          <Row
            label="Brought forward"
            hint="What the family already owed before this charge was sent."
          >
            {money(invoice.broughtForwardMinor, currency)}
          </Row>
          <Row label="Balance today" strong>
            {money(invoice.balanceTodayMinor, currency)}
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}

function SourceRow({ invoice }: { invoice: Invoice }) {
  const canOpen = useCan('store', 'read');
  const { source } = invoice;
  if (source === null) {
    return null;
  }
  return (
    <Row label="Source">
      {canOpen ? (
        <Link
          to="/finance/store"
          search={{ tab: 'sold', sale: source.id }}
          className="font-mono underline-offset-4 hover:underline"
        >
          {source.number}
        </Link>
      ) : (
        <span className="font-mono">{source.number}</span>
      )}
    </Row>
  );
}

export function InvoiceDetailsCard({ invoice }: { invoice: Invoice }) {
  const { billingRun } = invoice;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2">
          <Row label="Number">
            {invoice.number === null ? (
              <span className="text-muted-foreground">{NOT_NUMBERED}</span>
            ) : (
              <span className="font-mono">{invoice.number}</span>
            )}
          </Row>
          <Row label="Term">{invoice.termName}</Row>
          <Row label="Sent with">
            {billingRun === null ? (
              '—'
            ) : (
              <Link
                to="/finance/billing/$runId"
                params={{ runId: billingRun.id }}
                search={{ page: undefined }}
                className="font-mono underline-offset-4 hover:underline"
              >
                {billingRun.number}
              </Link>
            )}
          </Row>
          <SourceRow invoice={invoice} />
          <Row label="Issued">{issuedText(invoice)}</Row>
          <Row label="Charged to">
            {invoice.chargedTo === null
              ? '—'
              : `${invoice.chargedTo.name} (${invoice.chargedTo.relationship})`}
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}

import { Link } from '@tanstack/react-router';
import type { InvoiceSummary } from '@eduvault/api-contract';
import { fmtDate, money } from '@eduvault/shared';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { KIND_LABELS } from '../billing/billing-text';
import { StatusBadge } from '../billing/status-badge';
import { PersonAvatar } from '../person-avatar';

function InvoiceRow({
  invoice,
  currency,
}: {
  invoice: InvoiceSummary;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/finance/invoices/$invoiceId"
          params={{ invoiceId: invoice.id }}
          className="flex items-center gap-2"
        >
          <PersonAvatar name={invoice.studentName} />
          <span className="flex flex-col">
            <span className="font-medium">{invoice.studentName}</span>
            {invoice.number === null ? (
              <span className="text-xs text-muted-foreground">Draft</span>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {invoice.number}
              </span>
            )}
          </span>
        </Link>
      </TableCell>
      <TableCell>{fmtDate(invoice.date)}</TableCell>
      <TableCell>
        <Badge variant={invoice.kind === 'term' ? 'secondary' : 'outline'}>
          {KIND_LABELS[invoice.kind]}
        </Badge>
      </TableCell>
      <TableCell className="max-w-64 truncate">{invoice.forText}</TableCell>
      <TableCell className="tabular-nums">
        {money(invoice.totalMinor, currency)}
      </TableCell>
      <TableCell>
        <StatusBadge status={invoice.status} />
      </TableCell>
    </TableRow>
  );
}

export function InvoicesTable({
  invoices,
  currency,
}: {
  invoices: readonly InvoiceSummary[];
  currency: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>For</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <InvoiceRow key={invoice.id} invoice={invoice} currency={currency} />
        ))}
      </TableBody>
    </Table>
  );
}

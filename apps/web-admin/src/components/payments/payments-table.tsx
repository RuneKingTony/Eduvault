import { Link } from '@tanstack/react-router';
import { BanknoteIcon, CreditCardIcon, LandmarkIcon } from 'lucide-react';
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type PaymentSummary,
} from '@eduvault/api-contract';
import { fmtDate, money } from '@eduvault/shared';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@eduvault/ui';
import { PersonAvatar } from '../person-avatar';
import { STATUS_LABELS } from './payment-text';

const ICONS: Record<PaymentMethod, typeof BanknoteIcon> = {
  cash: BanknoteIcon,
  transfer: LandmarkIcon,
  pos: CreditCardIcon,
};

const MAX_AVATARS = 3;

function RowLink({
  payment,
  first = false,
  children,
}: {
  payment: PaymentSummary;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/finance/payments/$paymentId"
      params={{ paymentId: payment.id }}
      search={{ recorded: undefined }}
      className="block"
      {...(first ? {} : { tabIndex: -1, 'aria-hidden': true })}
    >
      {children}
    </Link>
  );
}

function Students({
  payment,
  currency,
}: {
  payment: PaymentSummary;
  currency: string;
}) {
  const shown = payment.allocations.slice(0, MAX_AVATARS);
  const more = payment.allocations.length - shown.length;
  const detail = payment.allocations
    .map((row) => `${row.studentName}: ${money(row.amountMinor, currency)}`)
    .join(', ');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center -space-x-1">
          {shown.map((row) => (
            <PersonAvatar key={row.studentId} name={row.studentName} />
          ))}
          {more > 0 ? (
            <span className="pl-2 text-xs text-muted-foreground">+{more}</span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

function PaymentRow({
  payment,
  currency,
}: {
  payment: PaymentSummary;
  currency: string;
}) {
  const Icon = ICONS[payment.method];
  const cancelled = payment.status === 'voided';
  return (
    <TableRow>
      <TableCell>
        <RowLink payment={payment} first>
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            <span className="flex flex-col">
              <span className="font-mono text-sm">{payment.receiptNumber}</span>
              <span className="text-xs text-muted-foreground">
                {fmtDate(payment.paidOn)} ·{' '}
                {PAYMENT_METHOD_LABELS[payment.method]}
              </span>
            </span>
          </span>
        </RowLink>
      </TableCell>
      <TableCell>
        <RowLink payment={payment}>{payment.payerName}</RowLink>
      </TableCell>
      <TableCell>
        <Students payment={payment} currency={currency} />
      </TableCell>
      <TableCell>
        <RowLink payment={payment}>{payment.moneyAccount.label}</RowLink>
      </TableCell>
      <TableCell
        className={cn(
          'font-semibold tabular-nums',
          cancelled && 'text-muted-foreground line-through'
        )}
      >
        <RowLink payment={payment}>
          {money(payment.amountMinor, currency)}
        </RowLink>
      </TableCell>
      <TableCell>
        <Badge variant={payment.status === 'posted' ? 'success' : 'outline'}>
          {STATUS_LABELS[payment.status]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

export function PaymentsTable({
  payments,
  currency,
}: {
  payments: readonly PaymentSummary[];
  currency: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Receipt</TableHead>
          <TableHead>Payer</TableHead>
          <TableHead>For</TableHead>
          <TableHead>Into</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((payment) => (
          <PaymentRow key={payment.id} payment={payment} currency={currency} />
        ))}
      </TableBody>
    </Table>
  );
}

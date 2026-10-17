import { Link } from '@tanstack/react-router';
import { BanIcon } from 'lucide-react';
import type { PaymentVoidItem, PaymentVoidList } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { FinancePager } from '../money/query-state';
import { AskedBy, ReasonCell, SeeInApprovals, StatusCell } from './status-cell';

function VoidRow({
  row,
  currency,
}: {
  row: PaymentVoidItem;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2">
          <BanIcon className="size-4 text-muted-foreground" />
          <span className="flex flex-col">
            <Link
              to="/finance/payments/$paymentId"
              params={{ paymentId: row.payment.id }}
              search={{ recorded: undefined }}
              className="font-mono text-sm hover:underline"
            >
              {row.payment.receiptNumber}
            </Link>
            <span className="text-xs text-muted-foreground">
              {row.payment.payerName}
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell className="font-semibold tabular-nums">
        {money(row.amountMinor, currency)}
      </TableCell>
      <TableCell>
        <ReasonCell reason={row.reason} rejectionReason={row.rejectionReason} />
      </TableCell>
      <TableCell>
        <AskedBy name={row.createdBy} />
      </TableCell>
      <TableCell>
        <StatusCell status={row.status} approvedBy={row.approvedBy} />
      </TableCell>
      <TableCell className="text-right">
        {row.status === 'submitted' ? <SeeInApprovals /> : null}
      </TableCell>
    </TableRow>
  );
}

export function VoidsTab({
  list,
  page,
  onPage,
}: {
  list: PaymentVoidList;
  page: number;
  onPage: (page: number) => void;
}) {
  if (list.items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BanIcon />
          </EmptyMedia>
          <EmptyTitle>No voids requested</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receipt</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Requested by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <span className="sr-only">Approvals</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.items.map((row) => (
            <VoidRow key={row.id} row={row} currency={list.currency} />
          ))}
        </TableBody>
      </Table>
      <FinancePager page={page} total={list.total} onPage={onPage} />
    </>
  );
}

import { Link } from '@tanstack/react-router';
import { HandCoinsIcon, Undo2Icon, WalletIcon } from 'lucide-react';
import {
  APPROVAL_KIND_LABELS,
  type WalletRequest,
  type WalletRequestList,
} from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Empty,
  EmptyDescription,
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
import {
  AskedBy,
  ReasonCell,
  SeeInApprovals,
  StatusCell,
} from '../adjustments/status-cell';
import { searchFor } from '../../route-search-defaults';
import { FinancePager } from '../money/query-state';

function RequestKind({ row }: { row: WalletRequest }) {
  const Icon = row.kind === 'wallet_refund' ? Undo2Icon : HandCoinsIcon;
  const detail =
    row.kind === 'wallet_refund'
      ? `To ${row.parentEmail}`
      : `Top-up ${row.topUp.reference}`;
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex flex-col">
        <span className="font-medium">{APPROVAL_KIND_LABELS[row.kind]}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </span>
  );
}

function RequestRow({
  row,
  currency,
}: {
  row: WalletRequest;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <RequestKind row={row} />
      </TableCell>
      <TableCell>
        <Link
          to="/finance/wallets/$walletId"
          params={{ walletId: row.wallet.id }}
          search={searchFor('/finance/wallets/$walletId')}
          className="hover:underline"
        >
          {row.wallet.guardianName}
        </Link>
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
        <StatusCell status={row.status} approvedBy={row.decidedBy} />
      </TableCell>
      <TableCell className="text-right">
        {row.status === 'submitted' ? <SeeInApprovals /> : null}
      </TableCell>
    </TableRow>
  );
}

export function RequestsTab({
  list,
  page,
  onPage,
}: {
  list: WalletRequestList;
  page: number;
  onPage: (page: number) => void;
}) {
  if (list.items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WalletIcon />
          </EmptyMedia>
          <EmptyTitle>No requests yet</EmptyTitle>
          <EmptyDescription>
            Refunds and cancelled top-ups that someone asks for wait here for a
            second person to approve them.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Request</TableHead>
            <TableHead>Family</TableHead>
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
            <RequestRow key={row.id} row={row} currency={list.currency} />
          ))}
        </TableBody>
      </Table>
      <FinancePager page={page} total={list.total} onPage={onPage} />
    </>
  );
}

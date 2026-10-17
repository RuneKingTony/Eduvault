import { Link } from '@tanstack/react-router';
import { FileIcon, UsersIcon } from 'lucide-react';
import {
  PAYMENT_METHOD_LABELS,
  type Payment,
  type PaymentAllocation,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { fmtDate, money } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { searchFor } from '../../route-search-defaults';
import { API_URL } from '../../env';
import { PersonAvatar } from '../person-avatar';
import { BalanceBadge } from './balance-badge';

function AllocationRow({
  row,
  currency,
}: {
  row: PaymentAllocation;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2">
          <PersonAvatar name={row.studentName} />
          <span className="flex flex-col">
            {row.inScope ? (
              <Link
                to="/finance/accounts/$studentId"
                params={{ studentId: row.studentId }}
                search={searchFor('/finance/accounts/$studentId')}
                className="font-medium hover:underline"
              >
                {row.studentName}
              </Link>
            ) : (
              <span className="font-medium">{row.studentName}</span>
            )}
            {row.className === null ? null : (
              <span className="text-xs text-muted-foreground">
                {row.className}
              </span>
            )}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {money(row.amountMinor, currency)}
      </TableCell>
      <TableCell className="text-right">
        {row.balanceMinor === null ? null : (
          <BalanceBadge balanceMinor={row.balanceMinor} currency={currency} />
        )}
      </TableCell>
    </TableRow>
  );
}

export function AllocationCard({ payment }: { payment: Payment }) {
  const { currency } = payment;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-4 text-muted-foreground" />
          Allocation
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead className="text-right">Balance now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payment.allocations.map((row) => (
              <AllocationRow
                key={row.studentId}
                row={row}
                currency={currency}
              />
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {money(payment.amountMinor, currency)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function SaleRow({ payment }: { payment: Payment }) {
  const canOpen = useCan('store', 'read');
  const { storeSale } = payment;
  if (storeSale === null) {
    return null;
  }
  return (
    <Row label="Store sale">
      {canOpen ? (
        <Link
          to="/finance/store"
          search={{ tab: 'sold', sale: storeSale.id }}
          className="font-mono underline-offset-4 hover:underline"
        >
          {storeSale.number}
        </Link>
      ) : (
        <span className="font-mono">{storeSale.number}</span>
      )}
    </Row>
  );
}

function ProofRow({ payment }: { payment: Payment }) {
  const label = payment.method === 'pos' ? 'POS slip' : 'Proof of transfer';
  if (payment.proof === null) {
    return payment.method === 'transfer' ? (
      <Row label={label}>
        Not uploaded (recorded before uploads were required)
      </Row>
    ) : null;
  }
  return (
    <Row label={label}>
      <a
        href={`${API_URL}/files/${payment.proof.fileId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
      >
        <FileIcon className="size-3.5" />
        {payment.proof.fileName}
      </a>
    </Row>
  );
}

export function ReceiptDetailsCard({ payment }: { payment: Payment }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipt</CardTitle>
        <CardDescription>
          Recorded {fmtDate(payment.recordedAt)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2">
          <Row label="Receipt no.">
            <span className="font-mono">{payment.receiptNumber}</span>
          </Row>
          <Row label="Reference">
            <span className="font-mono">{payment.reference}</span>
          </Row>
          <Row label="Provider ref.">{payment.providerReference ?? '—'}</Row>
          <Row label="Method">{PAYMENT_METHOD_LABELS[payment.method]}</Row>
          <Row label="Into">{payment.moneyAccount.label}</Row>
          <Row label="Recorded by">{payment.recordedBy ?? '—'}</Row>
          <SaleRow payment={payment} />
          <ProofRow payment={payment} />
        </dl>
      </CardContent>
    </Card>
  );
}

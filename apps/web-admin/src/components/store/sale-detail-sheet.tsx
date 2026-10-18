import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FileIcon, PackageIcon } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, type Sale } from '@eduvault/api-contract';
import { useCan, useCanAny } from '@eduvault/auth-client';
import { FINANCE_READ_GATE } from '@eduvault/policy';
import { fmtDate, naira } from '@eduvault/shared';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { API_URL } from '../../env';
import { storeSaleQueryOptions } from '../../queries';
import { Fact } from './fact';
import { SheetPending } from './sheet-pending';

interface SaleDetailSheetProps {
  saleId: string | undefined;
  onClose: () => void;
  onStatement: (studentId: string) => void;
}

function LinesTable({ sale }: { sale: Sale }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Unit price</TableHead>
          <TableHead>Line total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sale.lines.map((line) => (
          <TableRow key={line.itemId}>
            <TableCell>{line.displayName}</TableCell>
            <TableCell className="tabular-nums">{line.quantity}</TableCell>
            <TableCell className="tabular-nums">
              {naira(line.unitPriceMinor)}
            </TableCell>
            <TableCell className="tabular-nums">
              {naira(line.amountMinor)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="font-semibold tabular-nums">
            {naira(sale.totalMinor)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function PaymentFacts({ sale }: { sale: Sale }) {
  const canReadPayments = useCan('payment', 'read');
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Fact label="Receipt">
        {canReadPayments ? (
          <Link
            to="/finance/payments/$paymentId"
            params={{ paymentId: sale.paymentId }}
            search={{ recorded: undefined }}
            className="font-mono underline-offset-4 hover:underline"
          >
            {sale.receiptNumber}
          </Link>
        ) : (
          <span className="font-mono">{sale.receiptNumber}</span>
        )}
        {' · '}
        {PAYMENT_METHOD_LABELS[sale.method]}
      </Fact>
      {sale.proof === null ? null : (
        <Fact label="Payment receipt">
          {canReadPayments ? (
            <a
              href={`${API_URL}/files/${sale.proof.fileId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              <FileIcon className="size-3.5" />
              {sale.proof.fileName}
            </a>
          ) : (
            `Receipt uploaded: ${sale.proof.fileName}`
          )}
        </Fact>
      )}
    </dl>
  );
}

function SaleBody({
  sale,
  onClose,
  onStatement,
}: {
  sale: Sale;
  onClose: () => void;
  onStatement: (studentId: string) => void;
}) {
  const canSeeStatement = useCanAny(FINANCE_READ_GATE);
  return (
    <>
      <div className="flex flex-col gap-4 overflow-y-auto px-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Date">{fmtDate(sale.soldOn)}</Fact>
          <Fact label="Student">
            {sale.student.name}
            {sale.student.className === null
              ? ''
              : ` · ${sale.student.className}`}
          </Fact>
          <Fact label="Campus">{sale.campusName}</Fact>
          <Fact label="Sold by">{sale.soldBy ?? '—'}</Fact>
        </dl>
        <LinesTable sale={sale} />
        <PaymentFacts sale={sale} />
      </div>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
        {canSeeStatement ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onStatement(sale.student.id);
            }}
          >
            Statement
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
}

function Loaded({
  saleId,
  onClose,
  onStatement,
}: {
  saleId: string;
  onClose: () => void;
  onStatement: (studentId: string) => void;
}) {
  const sale = useQuery(storeSaleQueryOptions(useApi(), saleId));
  if (sale.data === undefined) {
    return <SheetPending error={sale.error} />;
  }
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 font-mono">
          <PackageIcon aria-hidden="true" />
          {sale.data.number}
        </SheetTitle>
        <SheetDescription>Sold at the store and paid in full.</SheetDescription>
      </SheetHeader>
      <SaleBody sale={sale.data} onClose={onClose} onStatement={onStatement} />
    </>
  );
}

export function SaleDetailSheet({
  saleId,
  onClose,
  onStatement,
}: SaleDetailSheetProps) {
  return (
    <Sheet
      open={saleId !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className="sm:max-w-xl">
        {saleId === undefined ? null : (
          <Loaded saleId={saleId} onClose={onClose} onStatement={onStatement} />
        )}
      </SheetContent>
    </Sheet>
  );
}

import type { ReactNode } from 'react';
import type { WalletMovement } from '@eduvault/api-contract';
import { fmtLagosDateTime } from '@eduvault/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@eduvault/ui';
import { walletMoney } from './wallet-text';

export function Fact({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-sm break-all' : 'text-sm'}>
        {children}
      </dd>
    </div>
  );
}

export function TraceButton({
  movement,
  currency,
}: {
  movement: WalletMovement;
  currency: string;
}) {
  const { source } = movement;
  if (source?.type !== 'monnify') {
    return null;
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto p-0 text-xs"
        >
          Trace
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trace</DialogTitle>
          <DialogDescription>
            How this money reached the wallet, from Monnify to the books.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Monnify reference" mono>
            {source.transactionReference}
          </Fact>
          <Fact label="Payment reference" mono>
            {source.paymentReference}
          </Fact>
          <Fact label="Signature check">Valid</Fact>
          <Fact label="Confirmation">
            Checked with Monnify on {fmtLagosDateTime(source.confirmedAt)}
          </Fact>
          <Fact label="Paid on">{fmtLagosDateTime(source.paidAt)}</Fact>
          <Fact label="Paid by the family">
            {walletMoney(source.grossMinor, currency)}
          </Fact>
          <Fact label="Monnify fee">
            {walletMoney(source.feeMinor, currency)}
          </Fact>
          <Fact label="Credited to the wallet">
            {walletMoney(source.netMinor, currency)}
          </Fact>
          <Fact label="Journal entry" mono>
            {movement.reference}
          </Fact>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

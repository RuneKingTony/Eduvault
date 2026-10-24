import { useState } from 'react';
import { CheckIcon, CopyIcon, PlusIcon } from 'lucide-react';
import type { Wallet } from '@eduvault/api-contract';
import {
  Button,
  Fact,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@eduvault/ui';

function CopyAccountNumber({ accountNumber }: { accountNumber: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label="Copy account number"
      onClick={() => {
        void navigator.clipboard.writeText(accountNumber).then(
          () => {
            setCopied(true);
          },
          () => {
            setCopied(false);
          }
        );
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function Account({
  account,
}: {
  account: NonNullable<Wallet['reservedAccount']>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Transfer from any bank app to this account. What arrives reaches the
        wallet by itself.
      </p>
      <dl className="flex flex-col gap-3">
        <Fact label="Bank">{account.bankName}</Fact>
        <div className="flex items-end justify-between gap-3">
          <Fact label="Account number" mono>
            {account.accountNumber}
          </Fact>
          <CopyAccountNumber accountNumber={account.accountNumber} />
        </div>
        <Fact label="Account name">{account.accountName}</Fact>
      </dl>
    </div>
  );
}

function Unavailable({ connected }: { connected: boolean }) {
  return (
    <p className="text-sm text-muted-foreground">
      {connected
        ? 'Your family’s account isn’t ready yet. Ask the school office to set it up, or pay them directly and ask for a top-up to be recorded.'
        : 'Online payments aren’t switched on at the school. Pay the school office directly and ask for a top-up to be recorded.'}
    </p>
  );
}

export function TopUpMenu({ wallet }: { wallet: Wallet }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button">
          <PlusIcon />
          Top up
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {wallet.reservedAccount === null ? (
          <Unavailable connected={wallet.gatewayConnected} />
        ) : (
          <Account account={wallet.reservedAccount} />
        )}
      </PopoverContent>
    </Popover>
  );
}

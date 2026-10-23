import type { Wallet } from '@eduvault/api-contract';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@eduvault/ui';
import { walletMoney } from './wallet-text';

function Figure({
  title,
  hint,
  minor,
  currency,
}: {
  title: string;
  hint: string;
  minor: number;
  currency: string;
}) {
  return (
    <Card role="group" aria-label={title}>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {walletMoney(minor, currency)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function BalanceCards({ wallet }: { wallet: Wallet }) {
  const { currency } = wallet;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Figure
        title="Balance"
        hint="Everything the family has paid in and not yet used."
        minor={wallet.balanceMinor}
        currency={currency}
      />
      <Figure
        title="Set aside"
        hint="Kept for a named child’s charges."
        minor={wallet.setAsideMinor}
        currency={currency}
      />
      <Figure
        title="Free to use"
        hint="Can pay any of the children’s charges."
        minor={wallet.freeMinor}
        currency={currency}
      />
    </div>
  );
}

import { WalletIcon } from 'lucide-react';
import type { Wallet } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { walletMoney } from '@eduvault/shared';
import { Button, WalletFigure } from '@eduvault/ui';
import { AutoPaySwitch } from './auto-pay-switch';
import { TopUpMenu } from './top-up-menu';

export function WalletSection({
  wallet,
  onPay,
}: {
  wallet: Wallet;
  onPay: () => void;
}) {
  const canSpend = useCan('wallet', 'spend');
  const { currency } = wallet;
  return (
    <section aria-label="Wallet" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>Wallet</h2>
        <div className="flex flex-wrap items-center gap-2">
          {canSpend ? (
            <Button type="button" variant="outline" onClick={onPay}>
              <WalletIcon />
              Pay from wallet
            </Button>
          ) : null}
          <TopUpMenu wallet={wallet} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <WalletFigure
          title="Balance"
          hint="Everything you have paid in and not yet used."
          value={walletMoney(wallet.balanceMinor, currency)}
        />
        <WalletFigure
          title="Free to use"
          hint="Can pay any of your children’s charges."
          value={walletMoney(wallet.freeMinor, currency)}
        />
        <WalletFigure
          title="Set aside"
          hint="Kept for a named child’s charges."
          value={walletMoney(wallet.setAsideMinor, currency)}
        />
      </div>
      <AutoPaySwitch wallet={wallet} />
    </section>
  );
}

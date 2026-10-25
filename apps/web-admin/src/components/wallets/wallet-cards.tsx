import type { Wallet } from '@eduvault/api-contract';
import { walletMoney } from '@eduvault/shared';
import { WalletFigure, cn } from '@eduvault/ui';

export function BalanceCards({ wallet }: { wallet: Wallet }) {
  const { currency } = wallet;
  return (
    <div
      className={cn(
        'grid gap-4',
        wallet.heldMinor > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
      )}
    >
      <WalletFigure
        title="Balance"
        hint="Everything the family has paid in and not yet used."
        value={walletMoney(wallet.balanceMinor, currency)}
      />
      <WalletFigure
        title="Set aside"
        hint="Kept for a named child’s charges."
        value={walletMoney(wallet.setAsideMinor, currency)}
      />
      {wallet.heldMinor > 0 ? (
        <WalletFigure
          title="Held for requests"
          hint="Waiting for a second person to approve a refund or a cancelled top-up."
          value={walletMoney(wallet.heldMinor, currency)}
        />
      ) : null}
      <WalletFigure
        title="Free to use"
        hint="Can pay any of the children’s charges."
        value={walletMoney(wallet.freeMinor, currency)}
      />
    </div>
  );
}

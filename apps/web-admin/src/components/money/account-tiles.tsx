import { money } from '@eduvault/shared';
import type { MoneyAccount } from '@eduvault/api-contract';
import { Badge, cn } from '@eduvault/ui';
import { KindIcon } from './kind-icon';
import { KIND_LABELS, tileSubline } from './money-text';

function Tile({
  account,
  currency,
  selected,
  onSelect,
}: {
  account: MoneyAccount;
  currency: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => {
          onSelect(account.id);
        }}
        className={cn(
          'flex w-full flex-col gap-1 rounded-xl border bg-card p-4 text-left hover:bg-muted/50',
          selected ? 'border-primary ring-1 ring-primary' : null,
          account.retiredAt === null ? null : 'opacity-70'
        )}
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <KindIcon kind={account.kind} className="size-4" />
          {KIND_LABELS[account.kind]}
          {account.retiredAt === null ? null : (
            <Badge variant="secondary">Retired</Badge>
          )}
        </span>
        <span className="font-medium">{account.name}</span>
        <span className="text-lg font-semibold tabular-nums">
          {money(account.balanceMinor, currency)}
        </span>
        <span className="text-xs text-muted-foreground">
          {tileSubline(account)}
        </span>
      </button>
    </li>
  );
}

export function AccountTiles({
  accounts,
  currency,
  selectedId,
  onSelect,
}: {
  accounts: readonly MoneyAccount[];
  currency: string;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((account) => (
        <Tile
          key={account.id}
          account={account}
          currency={currency}
          selected={account.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

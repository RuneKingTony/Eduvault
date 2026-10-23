import { Link } from '@tanstack/react-router';
import type { WalletSummary } from '@eduvault/api-contract';
import { countOf } from '@eduvault/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { searchFor } from '../../route-search-defaults';
import { PersonAvatar } from '../person-avatar';
import { walletMoney } from './wallet-text';

function RowLink({
  wallet,
  first = false,
  children,
}: {
  wallet: WalletSummary;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/finance/wallets/$walletId"
      params={{ walletId: wallet.id }}
      search={searchFor('/finance/wallets/$walletId')}
      className="block"
      {...(first ? {} : { tabIndex: -1, 'aria-hidden': true })}
    >
      {children}
    </Link>
  );
}

function WalletRow({
  wallet,
  currency,
}: {
  wallet: WalletSummary;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <RowLink wallet={wallet} first>
          <span className="flex items-center gap-2">
            <PersonAvatar name={wallet.guardianName} />
            <span className="flex flex-col">
              <span className="font-medium">{wallet.guardianName}</span>
              <span className="text-xs text-muted-foreground">
                {wallet.guardianPhone}
              </span>
            </span>
          </span>
        </RowLink>
      </TableCell>
      <TableCell>
        <RowLink wallet={wallet}>
          {countOf(wallet.childCount, 'child', 'children')}
        </RowLink>
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        <RowLink wallet={wallet}>
          {walletMoney(wallet.balanceMinor, currency)}
        </RowLink>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <RowLink wallet={wallet}>
          {walletMoney(wallet.setAsideMinor, currency)}
        </RowLink>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <RowLink wallet={wallet}>
          {walletMoney(wallet.freeMinor, currency)}
        </RowLink>
      </TableCell>
    </TableRow>
  );
}

export function WalletsTable({
  wallets,
  currency,
}: {
  wallets: readonly WalletSummary[];
  currency: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Family</TableHead>
          <TableHead>Children</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead className="text-right">Set aside</TableHead>
          <TableHead className="text-right">Free to use</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {wallets.map((wallet) => (
          <WalletRow key={wallet.id} wallet={wallet} currency={currency} />
        ))}
      </TableBody>
    </Table>
  );
}

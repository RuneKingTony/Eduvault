import { Link } from '@tanstack/react-router';
import { UsersIcon } from 'lucide-react';
import type { Wallet, WalletChild } from '@eduvault/api-contract';
import { walletMoney } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { searchFor } from '../../route-search-defaults';
import { PersonAvatar } from '../person-avatar';

function ChildRow({
  child,
  currency,
}: {
  child: WalletChild;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2">
          <PersonAvatar name={child.name} />
          <span className="flex flex-col">
            {child.inScope ? (
              <Link
                to="/finance/accounts/$studentId"
                params={{ studentId: child.studentId }}
                search={searchFor('/finance/accounts/$studentId')}
                className="font-medium hover:underline"
              >
                {child.name}
              </Link>
            ) : (
              <span className="font-medium">{child.name}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {child.admissionNumber}
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {walletMoney(Math.max(0, child.owedMinor), currency)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {walletMoney(child.earmarkMinor, currency)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {walletMoney(child.spendableMinor, currency)}
      </TableCell>
    </TableRow>
  );
}

export function ChildrenCard({ wallet }: { wallet: Wallet }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-4 text-muted-foreground" />
          Children
        </CardTitle>
        <CardDescription>
          What each child owes, what is set aside for them, and the most their
          charges can take from the wallet now.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Child</TableHead>
              <TableHead className="text-right">Owes</TableHead>
              <TableHead className="text-right">Set aside</TableHead>
              <TableHead className="text-right">Can use</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wallet.children.map((child) => (
              <ChildRow
                key={child.studentId}
                child={child}
                currency={wallet.currency}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

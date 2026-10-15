import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { WalletIcon } from 'lucide-react';
import type { DashboardMoney } from '@eduvault/api-contract';
import { usePermissions } from '@eduvault/auth-client';
import { money } from '@eduvault/shared';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorMessage,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { dashboardMoneyQueryOptions } from '../../queries';
import { KindIcon } from '../money/kind-icon';
import { hiddenFooterText, tileSubline } from '../money/money-text';
import { CardSkeleton } from './card-states';

function AccountRow({
  account,
  currency,
}: {
  account: DashboardMoney['accounts'][number];
  currency: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-center gap-3">
        <KindIcon
          kind={account.kind}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{account.name}</span>
          <span className="text-xs text-muted-foreground">
            {tileSubline(account)}
          </span>
        </span>
      </span>
      <span className="font-medium tabular-nums">
        {money(account.balanceMinor, currency)}
      </span>
    </li>
  );
}

export function SchoolAccountCard() {
  const dashboard = useQuery(dashboardMoneyQueryOptions(useApi()));
  const { campusScope } = usePermissions();
  if (dashboard.isPending) {
    return <CardSkeleton rows={3} />;
  }
  if (dashboard.data === undefined) {
    return <ErrorMessage error={dashboard.error} />;
  }
  const { currency, totalMinor, accounts, hiddenSchoolWide } = dashboard.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WalletIcon aria-hidden="true" />
          School account
        </CardTitle>
        <CardDescription>
          {campusScope === 'all'
            ? 'Everything received so far'
            : 'In the accounts you can see'}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/finance/money-accounts">Accounts</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-semibold tabular-nums">
          {money(totalMinor, currency)}
        </p>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts to show.</p>
        ) : (
          <ul className="divide-y">
            {accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                currency={currency}
              />
            ))}
          </ul>
        )}
        {hiddenSchoolWide > 0 ? (
          <p className="text-xs text-muted-foreground">
            {hiddenFooterText(hiddenSchoolWide)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

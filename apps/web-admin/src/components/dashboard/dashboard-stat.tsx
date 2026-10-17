import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, ErrorMessage } from '@eduvault/ui';
import { NO_ACCOUNT_FILTERS } from '../../accounts-search';
import { NO_INVOICE_FILTERS } from '../../invoices-search';
import { NO_PAYMENT_FILTERS } from '../../payments-search';
import { CardSkeleton } from './card-states';

type StatTarget =
  | '/students'
  | '/classes'
  | '/finance/invoices'
  | '/finance/payments'
  | '/finance/accounts';

function searchFor(to: StatTarget) {
  if (to === '/finance/invoices') {
    return { search: NO_INVOICE_FILTERS };
  }
  if (to === '/finance/payments') {
    return { search: NO_PAYMENT_FILTERS };
  }
  return to === '/finance/accounts' ? { search: NO_ACCOUNT_FILTERS } : {};
}

export function StatCard({
  label,
  value,
  sub,
  to,
  children,
}: {
  label: string;
  value: string | number;
  sub: string;
  to?: StatTarget;
  children?: ReactNode;
}) {
  const body = (
    <CardContent className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-sm text-muted-foreground">{sub}</span>
      {children}
    </CardContent>
  );
  return (
    <Card>
      {to === undefined ? (
        body
      ) : (
        <Link
          to={to}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
          {...searchFor(to)}
        >
          {body}
        </Link>
      )}
    </Card>
  );
}

export const StatSkeleton = () => <CardSkeleton rows={1} />;

export function NullableStat<T>({
  query,
  children,
}: {
  query: UseQueryResult<T | null>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return <StatSkeleton />;
  }
  if (query.data === undefined) {
    return <ErrorMessage error={query.error} />;
  }
  return <>{query.data === null ? null : children(query.data)}</>;
}

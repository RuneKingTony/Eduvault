import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, ErrorMessage } from '@eduvault/ui';
import { hasSearchDefaults, searchFor } from '../../route-search-defaults';
import { CardSkeleton } from './card-states';

type StatTarget =
  | '/students'
  | '/classes'
  | '/finance/invoices'
  | '/finance/payments'
  | '/finance/accounts';

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
  const linkSearch =
    to !== undefined && hasSearchDefaults(to) ? { search: searchFor(to) } : {};
  return (
    <Card>
      {to === undefined ? (
        body
      ) : (
        <Link
          to={to}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
          {...linkSearch}
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

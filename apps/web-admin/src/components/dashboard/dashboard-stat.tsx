import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent } from '@eduvault/ui';
import { NO_INVOICE_FILTERS } from '../../invoices-search';
import { CardSkeleton } from './card-states';

const searchFor = (to: string) =>
  to === '/finance/invoices'
    ? {
        search: NO_INVOICE_FILTERS,
      }
    : {};

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
  to?: '/students' | '/classes' | '/finance/invoices';
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

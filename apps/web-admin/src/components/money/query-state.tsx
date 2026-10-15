import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { FINANCE_PAGE_SIZE } from '@eduvault/api-contract';
import { ErrorMessage, NumberedPager, Skeleton } from '@eduvault/ui';

export function QueryState<T>({
  query,
  skeletonClassName = 'h-24',
  children,
}: {
  query: Pick<UseQueryResult<T>, 'isPending' | 'data' | 'error'>;
  skeletonClassName?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading" className="px-4">
        <Skeleton className={`${skeletonClassName} w-full`} />
      </div>
    );
  }
  if (query.data === undefined) {
    return (
      <div className="px-4">
        <ErrorMessage error={query.error} />
      </div>
    );
  }
  return <>{children(query.data)}</>;
}

export function FinancePager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return total > FINANCE_PAGE_SIZE ? (
    <NumberedPager
      page={page}
      total={total}
      pageSize={FINANCE_PAGE_SIZE}
      onPage={onPage}
    />
  ) : null;
}

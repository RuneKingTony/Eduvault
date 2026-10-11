import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';
import { DayOffRow, type DayOffRowProps } from './day-off-row';
import { ErrorMessage } from './error-message';

export interface DayOffListRow extends DayOffRowProps {
  key: string;
}

export interface DayOffListProps {
  rows: readonly DayOffListRow[] | undefined;
  isPending: boolean;
  error: unknown;
  className?: string;
}

export function DayOffList({
  rows,
  isPending,
  error,
  className,
}: DayOffListProps) {
  if (isPending) {
    return (
      <Skeleton role="status" aria-label="Loading" className="h-16 w-full" />
    );
  }
  if (rows === undefined) {
    return <ErrorMessage error={error} />;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No holidays ahead</p>;
  }
  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {rows.map(({ key, ...row }) => (
        <DayOffRow key={key} {...row} />
      ))}
    </ul>
  );
}

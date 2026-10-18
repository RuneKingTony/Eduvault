import { ErrorMessage, Skeleton } from '@eduvault/ui';

export function SheetPending({ error = null }: { error?: Error | null }) {
  return error === null ? (
    <div role="status" aria-label="Loading" className="px-4">
      <Skeleton className="h-48 w-full" />
    </div>
  ) : (
    <div className="px-4">
      <ErrorMessage error={error} />
    </div>
  );
}

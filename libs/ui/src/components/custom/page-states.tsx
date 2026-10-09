import type { ReactNode } from 'react';
import { SearchXIcon } from 'lucide-react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../ui/empty';
import { Skeleton } from '../ui/skeleton';

export function NotFoundState({ children }: { children?: ReactNode }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>
          We couldn’t find that page. It may have been moved.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{children}</EmptyContent>
    </Empty>
  );
}

export function PageSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  );
}

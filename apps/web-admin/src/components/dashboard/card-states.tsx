import { Card, CardContent, CardHeader, Skeleton } from '@eduvault/ui';

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card role="status" aria-label="Loading">
      <CardHeader>
        <Skeleton className="h-5 w-1/3" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

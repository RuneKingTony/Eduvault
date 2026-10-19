import type { ReactNode } from 'react';
import { Card, CardContent, cn } from '@eduvault/ui';

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  tone?: 'destructive' | 'success';
}) {
  return (
    <Card role="group" aria-label={label}>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            'text-2xl font-semibold',
            tone === 'destructive' && 'text-destructive',
            tone === 'success' && 'text-success'
          )}
        >
          {value}
        </span>
        <span className="truncate text-sm text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}

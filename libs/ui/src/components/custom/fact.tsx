import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Fact({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm', mono && 'font-mono break-all')}>
        {children}
      </dd>
    </div>
  );
}

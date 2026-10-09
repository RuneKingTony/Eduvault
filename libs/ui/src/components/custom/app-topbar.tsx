import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface AppTopbarProps {
  start?: ReactNode;
  end?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function AppTopbar({ start, end, children, className }: AppTopbarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-13 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur-md',
        className
      )}
    >
      {start}
      <div className="min-w-0 flex-1">{children}</div>
      {end}
    </header>
  );
}

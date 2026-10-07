import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type DivProps = HTMLAttributes<HTMLDivElement>;

export const Card = ({ className, ...props }: DivProps) => (
  <div
    className={cn(
      'flex flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-xs',
      className
    )}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: DivProps) => (
  <div className={cn('flex flex-col gap-1', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: DivProps) => (
  <div
    className={cn('font-heading leading-none font-semibold', className)}
    {...props}
  />
);

export const CardDescription = ({ className, ...props }: DivProps) => (
  <div className={cn('text-sm text-muted-foreground', className)} {...props} />
);

export const CardContent = ({ className, ...props }: DivProps) => (
  <div className={className} {...props} />
);

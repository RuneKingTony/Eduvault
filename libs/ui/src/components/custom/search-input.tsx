import type { ComponentProps } from 'react';
import { SearchIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Input } from '../ui/input';

export function SearchInput({
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'>) {
  return (
    <div className={cn('relative', className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-8" {...props} />
    </div>
  );
}

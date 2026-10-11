import { cn } from '../../lib/utils';

export interface DayOffRowProps {
  month: string;
  day: number;
  name: string;
  subline: string;
  relative: string;
  highlighted?: boolean;
}

export function DayOffRow({
  month,
  day,
  name,
  subline,
  relative,
  highlighted = false,
}: DayOffRowProps) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-md p-2',
        highlighted && 'bg-muted'
      )}
    >
      <span className="flex w-12 shrink-0 flex-col items-center rounded-md border bg-card py-1 text-xs">
        <span className="text-muted-foreground uppercase">{month}</span>
        <span className="text-base font-semibold">{day}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{name}</span>
        <span className="text-sm text-muted-foreground">{subline}</span>
      </span>
      <span className="text-sm text-muted-foreground">{relative}</span>
    </li>
  );
}

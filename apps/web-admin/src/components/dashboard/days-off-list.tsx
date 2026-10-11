import { useQuery } from '@tanstack/react-query';
import { ErrorMessage, Skeleton } from '@eduvault/ui';
import { addDays, fmtDate, relativeDays, type DayOff } from '@eduvault/shared';
import { useApi } from '../../api';
import { daysOffQueryOptions } from '../../queries';

type DaysOffCopy = 'staff' | 'portal';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAYS_OFF_LIMIT = 200;

const weekday = (date: string): string =>
  DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';

const dayOfMonth = (date: string): number => Number(date.slice(8, 10));

const monthOf = (date: string): string => fmtDate(date).split(' ')[1] ?? '';

export function daysOffSubline(dayOff: DayOff, copy: DaysOffCopy): string {
  if (dayOff.kind === 'break') {
    const resume = fmtDate(dayOff.resume ?? addDays(dayOff.end, 1));
    return copy === 'portal' ? `School resumes ${resume}` : `Resumes ${resume}`;
  }
  const span =
    dayOff.days > 1
      ? `${weekday(dayOff.start)} – ${weekday(dayOff.end)}`
      : weekday(dayOff.start);
  if (copy === 'portal') {
    return `${span} · no school`;
  }
  const off = dayOff.days > 1 ? `${dayOff.days} days off` : '1 day off';
  return `${span} · ${off}`;
}

function DayOffRow({
  dayOff,
  copy,
  today,
  next,
}: {
  dayOff: DayOff;
  copy: DaysOffCopy;
  today: string;
  next: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-md p-2 ${next ? 'bg-muted' : ''}`}
    >
      <span className="flex w-12 shrink-0 flex-col items-center rounded-md border bg-card py-1 text-xs">
        <span className="text-muted-foreground uppercase">
          {monthOf(dayOff.start)}
        </span>
        <span className="text-base font-semibold">
          {dayOfMonth(dayOff.start)}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{dayOff.name}</span>
        <span className="text-sm text-muted-foreground">
          {daysOffSubline(dayOff, copy)}
        </span>
      </span>
      <span className="text-sm text-muted-foreground">
        {relativeDays(today, dayOff.start)}
      </span>
    </li>
  );
}

export function DaysOffList({
  copy,
  today,
}: {
  copy: DaysOffCopy;
  today: string;
}) {
  const daysOff = useQuery(daysOffQueryOptions(useApi(), DAYS_OFF_LIMIT));
  if (daysOff.isPending) {
    return (
      <Skeleton role="status" aria-label="Loading" className="h-16 w-full" />
    );
  }
  if (daysOff.data === undefined) {
    return <ErrorMessage error={daysOff.error} />;
  }
  if (daysOff.data.length === 0) {
    return <p className="text-sm text-muted-foreground">No holidays ahead</p>;
  }
  return (
    <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
      {daysOff.data.map((dayOff, index) => (
        <DayOffRow
          key={`${dayOff.name}-${dayOff.start}`}
          dayOff={dayOff}
          copy={copy}
          today={today}
          next={index === 0}
        />
      ))}
    </ul>
  );
}

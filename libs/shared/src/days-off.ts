import { addDays, relativeDays, type DayOff } from './calendar';
import { fmtDate } from './date';

export type DaysOffCopy = 'staff' | 'portal';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const weekday = (date: string): string =>
  DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';

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

const dayOfMonth = (date: string): number => Number(date.slice(8, 10));

const monthOf = (date: string): string => fmtDate(date).split(' ')[1] ?? '';

export const dayOffRows = (
  daysOff: readonly DayOff[],
  copy: DaysOffCopy,
  today: string
) =>
  daysOff.map((dayOff, index) => ({
    key: `${dayOff.name}-${dayOff.start}`,
    month: monthOf(dayOff.start),
    day: dayOfMonth(dayOff.start),
    name: dayOff.name,
    subline: daysOffSubline(dayOff, copy),
    relative: relativeDays(today, dayOff.start),
    highlighted: index === 0,
  }));

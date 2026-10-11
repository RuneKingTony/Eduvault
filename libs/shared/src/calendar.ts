const MS_PER_DAY = 86_400_000;
const FIRST_MONDAY_OFFSET = 8;
const FRIDAY = 5;
const DAYS_IN_WEEK = 7;
const MERGE_WITHIN_DAYS = 3;
const MIN_TERM_GAP = 7;
const MAX_TERM_GAP = 21;
const TERM_GAP_SHARE = 0.18;
const DAYS_IN_SCHOOL_WEEK = 5;
const SHOW_DAYS_BELOW = 14;
const SHOW_WEEKS_BELOW = 70;
const DAYS_IN_MONTH = 30;

export const YEAR_NAME_ERROR =
  'Write the year as two years in a row, for example 2028/2029.';

const YEAR_NAME = /^(?<first>\d{4})\/(?<second>\d{4})$/;

const TERM_NAMES = ['First term', 'Second term', 'Third term'] as const;
const BREAK_NAMES = [
  'Christmas break',
  'Easter break',
  'End-of-term break',
] as const;

export interface DateSpan {
  startsOn: string;
  endsOn: string;
}

export interface SplitTerm extends DateSpan {
  sequence: 1 | 2 | 3;
  name: string;
}

export interface DayOff {
  kind: 'holiday' | 'break';
  name: string;
  start: string;
  end: string;
  days: number;
  resume?: string;
}

export interface CalendarTerm extends DateSpan {
  id: string;
  sessionId: string;
  sequence: number;
}

export interface CalendarHoliday {
  date: string;
  name: string;
}

function toMs(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return ms;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return new Date(toMs(date)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return toIso(toMs(date) + days * MS_PER_DAY);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / MS_PER_DAY);
}

export function isWeekend(date: string): boolean {
  const day = weekday(date);
  return day === 0 || day === 6;
}

export function firstMondayOnOrAfter(date: string): string {
  return addDays(date, (FIRST_MONDAY_OFFSET - weekday(date)) % DAYS_IN_WEEK);
}

export function lastFridayOnOrBefore(date: string): string {
  return addDays(
    date,
    -((weekday(date) - FRIDAY + DAYS_IN_WEEK) % DAYS_IN_WEEK)
  );
}

export function splitTerms(startsOn: string, endsOn: string): SplitTerm[] {
  const third = Math.floor(daysBetween(startsOn, endsOn) / 3);
  const gap = Math.min(
    MAX_TERM_GAP,
    Math.max(MIN_TERM_GAP, Math.round(third * TERM_GAP_SHARE))
  );
  const termStart = (index: number) =>
    firstMondayOnOrAfter(
      index === 0
        ? startsOn
        : addDays(startsOn, index * third + Math.ceil(gap / 2))
    );
  const termEnd = (index: number) =>
    lastFridayOnOrBefore(
      index === 2
        ? endsOn
        : addDays(startsOn, (index + 1) * third - Math.floor(gap / 2))
    );
  return [1, 2, 3].map((sequence) => ({
    sequence: sequence as 1 | 2 | 3,
    name: TERM_NAMES[sequence - 1] ?? '',
    startsOn: termStart(sequence - 1),
    endsOn: termEnd(sequence - 1),
  }));
}

export function schoolDays(
  startsOn: string,
  endsOn: string,
  holidayDates: readonly string[]
): number {
  const holidays = new Set(holidayDates);
  let count = 0;
  for (let day = startsOn; day <= endsOn; day = addDays(day, 1)) {
    if (!isWeekend(day) && !holidays.has(day)) {
      count += 1;
    }
  }
  return count;
}

export function schoolDaysSoFar(
  term: DateSpan,
  holidayDates: readonly string[],
  today: string
): number {
  if (today < term.startsOn) {
    return 0;
  }
  const upTo = today < term.endsOn ? today : term.endsOn;
  return schoolDays(term.startsOn, upTo, holidayDates);
}

export function newYearDefaults(
  latest: { endsOn: string } | null,
  today: string
): { name: string; startsOn: string; endsOn: string } {
  const year = Number((latest?.endsOn ?? today).slice(0, 4));
  return {
    name: `${year}/${year + 1}`,
    startsOn: firstMondayOnOrAfter(`${year}-09-06`),
    endsOn: lastFridayOnOrBefore(`${year + 1}-07-28`),
  };
}

export function yearNameError(name: string): string | null {
  const groups = YEAR_NAME.exec(name)?.groups;
  if (groups === undefined) {
    return YEAR_NAME_ERROR;
  }
  return Number(groups['second']) === Number(groups['first']) + 1
    ? null
    : YEAR_NAME_ERROR;
}

function mergeHolidays(
  holidays: readonly CalendarHoliday[],
  today: string
): DayOff[] {
  const open = new Map<string, DayOff>();
  const merged: DayOff[] = [];
  const upcoming = holidays
    .filter((holiday) => holiday.date >= today)
    .toSorted((a, b) => a.date.localeCompare(b.date));
  for (const { date, name } of upcoming) {
    const group = open.get(name);
    if (
      group !== undefined &&
      daysBetween(group.end, date) <= MERGE_WITHIN_DAYS
    ) {
      group.end = date;
      group.days += 1;
    } else {
      const entry: DayOff = {
        kind: 'holiday',
        name,
        start: date,
        end: date,
        days: 1,
      };
      open.set(name, entry);
      merged.push(entry);
    }
  }
  return merged;
}

function termBreaks(terms: readonly CalendarTerm[], today: string): DayOff[] {
  const ordered = terms.toSorted((a, b) =>
    a.startsOn.localeCompare(b.startsOn)
  );
  const breaks: DayOff[] = [];
  for (const [index, term] of ordered.entries()) {
    const next = ordered[index + 1];
    if (next === undefined) {
      break;
    }
    const start = addDays(term.endsOn, 1);
    const end = addDays(next.startsOn, -1);
    if (start <= end && end >= today) {
      breaks.push({
        kind: 'break',
        name: BREAK_NAMES[term.sequence - 1] ?? 'Break',
        start,
        end,
        days: schoolDays(start, end, []),
        resume: next.startsOn,
      });
    }
  }
  return breaks;
}

export function daysOff(options: {
  terms: readonly CalendarTerm[];
  holidays: readonly CalendarHoliday[];
  today: string;
  limit: number;
}): DayOff[] {
  return [
    ...mergeHolidays(options.holidays, options.today),
    ...termBreaks(options.terms, options.today),
  ]
    .toSorted((a, b) => a.start.localeCompare(b.start))
    .slice(0, options.limit);
}

export function yearStartingNext<
  Y extends { id: string; startsOn: string; endsOn: string },
>(years: readonly Y[], currentYearId: string): Y | undefined {
  const current = years.find((year) => year.id === currentYearId);
  return current === undefined
    ? undefined
    : years
        .filter((year) => year.startsOn > current.endsOn)
        .toSorted((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
}

export function canMakeCurrent(
  term: Pick<CalendarTerm, 'id' | 'sessionId' | 'sequence'>,
  context: {
    currentTerm: Pick<CalendarTerm, 'id' | 'sessionId'> | null;
    years: readonly { id: string; startsOn: string; endsOn: string }[];
  }
): boolean {
  const { currentTerm, years } = context;
  if (currentTerm === null || term.id === currentTerm.id) {
    return false;
  }
  if (term.sessionId === currentTerm.sessionId) {
    return true;
  }
  return (
    term.sequence === 1 &&
    yearStartingNext(years, currentTerm.sessionId)?.id === term.sessionId
  );
}

export function termWeek(done: number): number {
  return Math.max(1, Math.ceil(done / DAYS_IN_SCHOOL_WEEK));
}

export function termWeeks(total: number): number {
  return Math.ceil(total / DAYS_IN_SCHOOL_WEEK);
}

export function termPercentDone(done: number, total: number): number {
  return total === 0 ? 0 : (done / total) * 100;
}

function dayLabel(days: number, otherwise: () => string): string {
  if (days <= 0) {
    return 'Today';
  }
  return days === 1 ? 'Tomorrow' : otherwise();
}

export function relativeDays(from: string, to: string): string {
  const days = daysBetween(from, to);
  return dayLabel(days, () => {
    if (days < SHOW_DAYS_BELOW) {
      return `in ${days} days`;
    }
    return days < SHOW_WEEKS_BELOW
      ? `in ${Math.round(days / DAYS_IN_WEEK)} weeks`
      : `in ${Math.round(days / DAYS_IN_MONTH)} months`;
  });
}

export function daysUntilLabel(from: string, to: string): string {
  const days = daysBetween(from, to);
  return dayLabel(days, () => `${days} days`);
}

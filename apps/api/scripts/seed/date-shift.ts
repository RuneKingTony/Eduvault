const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

/** The prototype's "today", a Wednesday; every seeded date is relative to it. */
export const PROTOTYPE_TODAY = '2026-10-07';

const toDay = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00Z`);

const formatDay = (day: number): string =>
  new Date(day).toISOString().slice(0, 10);

/** Whole weeks, in days, so the seeded "today" stays a Wednesday. */
export function seedOffsetDays(
  now: Date = new Date(),
  seedToday?: string
): number {
  const runDay =
    seedToday === undefined
      ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      : toDay(seedToday);
  const weeks = Math.floor(
    (runDay - toDay(PROTOTYPE_TODAY)) / DAY_MS / WEEK_DAYS
  );
  return weeks * WEEK_DAYS;
}

export function shiftDate(isoDate: string, offsetDays: number): string {
  return formatDay(toDay(isoDate) + offsetDays * DAY_MS);
}

const DAY_MS = 86_400_000;

export const INACTIVE_AFTER_DAYS = 35;

/** Due to be marked Left this many days after `not_seen_since` (35 + 98). */
export const DUE_LEFT_AFTER_DAYS = 133;

const daysAfter = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

export const inactiveFrom = (notSeenSince: string): string =>
  daysAfter(notSeenSince, INACTIVE_AFTER_DAYS);

export const dueLeftOn = (notSeenSince: string): string =>
  daysAfter(notSeenSince, DUE_LEFT_AFTER_DAYS);

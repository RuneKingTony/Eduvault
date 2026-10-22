import { addDays, daysBetween } from './calendar';

export const INACTIVE_AFTER_DAYS = 35;

/** Due to be marked Left this many days after `not_seen_since` (35 + 98). */
export const DUE_LEFT_AFTER_DAYS = 133;

export const inactiveFrom = (notSeenSince: string): string =>
  addDays(notSeenSince, INACTIVE_AFTER_DAYS);

export const dueLeftOn = (notSeenSince: string): string =>
  addDays(notSeenSince, DUE_LEFT_AFTER_DAYS);

/** Whole days since the student was last seen; throws on a malformed date. */
export const daysAway = (notSeenSince: string, today: string): number =>
  daysBetween(notSeenSince, today);

export const isInactiveByAbsence = (
  notSeenSince: string | null,
  today: string
): boolean =>
  notSeenSince !== null && daysAway(notSeenSince, today) >= INACTIVE_AFTER_DAYS;

export const isDueLeftByAbsence = (
  notSeenSince: string | null,
  today: string
): boolean =>
  notSeenSince !== null && daysAway(notSeenSince, today) >= DUE_LEFT_AFTER_DAYS;

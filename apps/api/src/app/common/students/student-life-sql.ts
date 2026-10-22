import { sql, type RawBuilder } from 'kysely';
import { DUE_LEFT_AFTER_DAYS, INACTIVE_AFTER_DAYS } from '@eduvault/shared';

const absentFor = (
  days: number,
  today: string,
  notSeenSince: string
): RawBuilder<boolean> =>
  sql<boolean>`(${sql.ref(notSeenSince)} IS NOT NULL AND (${today}::date - ${sql.ref(notSeenSince)}::date) >= ${days})`;

/** SQL form of `isInactiveByAbsence`: false when the student was never marked away. The cast lets a text column, as the visible-students CTE exposes it, take part. */
export const inactiveSql = (
  today: string,
  notSeenSince: string
): RawBuilder<boolean> => absentFor(INACTIVE_AFTER_DAYS, today, notSeenSince);

/** SQL form of `isDueLeftByAbsence`. */
export const dueLeftSql = (
  today: string,
  notSeenSince: string
): RawBuilder<boolean> => absentFor(DUE_LEFT_AFTER_DAYS, today, notSeenSince);

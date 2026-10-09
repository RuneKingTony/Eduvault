import { lagosDateOf } from './time';

const EMPTY = '—';
const RANGE_SEPARATOR = '–';
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const ISO_DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/;

/** `7 Oct 2026` from the `YYYY-MM-DD` part, with no timezone conversion. */
export function fmtDate(isoDate: string | null | undefined): string {
  if (isoDate === null || isoDate === undefined) {
    return EMPTY;
  }
  const groups = ISO_DATE.exec(isoDate)?.groups;
  const month = MONTHS[Number(groups?.['month']) - 1];
  if (groups === undefined || month === undefined) {
    throw new RangeError(`Invalid calendar date: ${isoDate}`);
  }
  return `${Number(groups['day'])} ${month} ${groups['year']}`;
}

export function fmtDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const from = fmtDate(start);
  const to = fmtDate(end);
  return from === to ? from : `${from} ${RANGE_SEPARATOR} ${to}`;
}

/** A timestamp shown as the calendar date it falls on in Lagos. */
export function fmtTimestamp(timestamp: string | Date | null | undefined) {
  return timestamp === null || timestamp === undefined
    ? EMPTY
    : fmtDate(lagosDateOf(timestamp));
}

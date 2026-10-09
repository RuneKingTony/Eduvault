const LAGOS_TIME_ZONE = 'Africa/Lagos';

const lagosParts = new Intl.DateTimeFormat('en-US', {
  timeZone: LAGOS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const lagosClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: LAGOS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Calendar date (`YYYY-MM-DD`) a timestamp falls on in Lagos. */
export function lagosDateOf(timestamp: string | Date): string {
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`Invalid timestamp: ${String(timestamp)}`);
  }
  const parts = lagosParts.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function fmtLagosDateTime(timestamp: string | Date): string {
  return `${lagosDateOf(timestamp)} ${lagosClock.format(new Date(timestamp))}`;
}

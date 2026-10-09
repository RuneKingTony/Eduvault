const LAGOS_TIME_ZONE = 'Africa/Lagos';

const lagosParts = new Intl.DateTimeFormat('en-US', {
  timeZone: LAGOS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date (`YYYY-MM-DD`) a timestamp falls on in Lagos. */
export function lagosDateOf(timestamp: string | Date): string {
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`Invalid timestamp: ${String(timestamp)}`);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    lagosParts.formatToParts(instant).find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

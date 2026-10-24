const DECIMAL = /^(\d+)(?:\.(\d{1,2})0*)?$/;
const OFFSET_MS = 60 * 60 * 1000;

/** Monnify sends naira with decimals, as a number or a string; money here is whole kobo, so read the digits, not a float. */
export function nairaToMinor(value: number | string): number | undefined {
  const match = DECIMAL.exec(String(value).trim());
  if (match === null) {
    return undefined;
  }
  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

const ISO = /^\d{4}-\d{2}-\d{2}T/;
const SQL_STYLE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const DAY_FIRST =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/i;

const lagos = (parts: number[]): Date => {
  const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] =
    parts;
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - OFFSET_MS
  );
};

function sqlStyle(text: string): Date | undefined {
  const match = SQL_STYLE.exec(text);
  return match === null ? undefined : lagos(match.slice(1, 7).map(Number));
}

function dayFirst(text: string): Date | undefined {
  const match = DAY_FIRST.exec(text);
  if (match === null) {
    return undefined;
  }
  const [day, month, year, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  const afternoon = match[7]?.toUpperCase() === 'PM';
  return lagos([
    year ?? 0,
    month ?? 1,
    day ?? 1,
    ((hour ?? 0) % 12) + (afternoon ? 12 : 0),
    minute ?? 0,
    second ?? 0,
  ]);
}

function iso(text: string): Date | undefined {
  const parsed = ISO.test(text) ? new Date(text) : undefined;
  return parsed === undefined || Number.isNaN(parsed.getTime())
    ? undefined
    : parsed;
}

/** Monnify writes times in Lagos with no zone, in one of two layouts; anything else falls back to `fallback`. */
export function monnifyDate(value: string, fallback: Date): Date {
  const text = value.trim();
  return iso(text) ?? sqlStyle(text) ?? dayFirst(text) ?? fallback;
}

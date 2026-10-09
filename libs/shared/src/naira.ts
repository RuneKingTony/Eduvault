const MINUS = '−';
const KOBO_PER_NAIRA = 100;

const groupedNaira = new Intl.NumberFormat('en-NG');

export interface NairaOptions {
  kobo?: boolean;
  paren?: boolean;
  plus?: boolean;
}

export function naira(minor: number, opts: NairaOptions = {}): string {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Expected whole minor units, got ${minor}`);
  }
  const absolute = Math.abs(minor);
  const whole = Math.trunc(absolute / KOBO_PER_NAIRA);
  const kobo = absolute % KOBO_PER_NAIRA;
  const fraction =
    kobo === 0 && opts.kobo !== true ? '' : `.${String(kobo).padStart(2, '0')}`;
  const body = `₦${groupedNaira.format(whole)}${fraction}`;

  if (minor < 0) {
    return opts.paren === true ? `(${body})` : `${MINUS}${body}`;
  }
  return minor > 0 && opts.plus === true ? `+${body}` : body;
}

const NAIRA_INPUT = /^(?<whole>\d{1,3}(?:,\d{3})+|\d+)(?:\.(?<kobo>\d{1,2}))?$/;

/** No float ever holds a kobo: the integer and fraction parts are read as strings. */
export function parseNaira(input: string): number | undefined {
  const groups = NAIRA_INPUT.exec(input.trim())?.groups;
  if (groups === undefined) {
    return undefined;
  }
  const whole = Number(groups['whole']?.replaceAll(',', ''));
  const kobo = Number((groups['kobo'] ?? '').padEnd(2, '0'));
  const minor = whole * KOBO_PER_NAIRA + kobo;
  return Number.isSafeInteger(minor) ? minor : undefined;
}

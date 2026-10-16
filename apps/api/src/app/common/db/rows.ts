export const iso = (value: Date | string): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

export const isoOrNull = (value: Date | string | null): string | null =>
  value === null ? null : iso(value);

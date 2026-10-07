export const iso = (value: Date | string): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

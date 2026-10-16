import { sql } from 'kysely';

export const iso = (value: Date | string): string =>
  (value instanceof Date ? value : new Date(value)).toISOString();

export const isoOrNull = (value: Date | string | null): string | null =>
  value === null ? null : iso(value);

export const day = (column: string) =>
  sql<string>`to_char(${sql.ref(column)}, 'YYYY-MM-DD')`;

export const nullableDay = (column: string) =>
  sql<string | null>`to_char(${sql.ref(column)}, 'YYYY-MM-DD')`;

export const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );

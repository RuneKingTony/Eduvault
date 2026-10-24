import { createHash } from 'node:crypto';

export const hashCanonical = (canonical: unknown): string =>
  createHash('sha256').update(JSON.stringify(canonical)).digest('hex');

export const sortedByFirst = <T extends readonly [string, ...unknown[]]>(
  rows: readonly T[]
): T[] => rows.toSorted(([a], [b]) => a.localeCompare(b));

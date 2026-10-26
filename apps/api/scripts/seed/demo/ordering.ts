export const oldestFirst = <T>(
  rows: readonly T[],
  daysAgo: (row: T) => number
): T[] => rows.toSorted((left, right) => daysAgo(right) - daysAgo(left));

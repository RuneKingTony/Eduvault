export const textOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const text = String(value).trim();
  return text === '' ? undefined : text;
};

export const pageOf = (value: unknown): number | undefined => {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? page : undefined;
};

export const oneOf = <T extends string>(
  options: readonly T[],
  value: unknown
): T | undefined => options.find((option) => option === value);

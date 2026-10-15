const PG_UNIQUE_VIOLATION = '23505';

export function uniqueViolation(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const { code, constraint } = error as {
    code?: unknown;
    constraint?: unknown;
  };
  return code === PG_UNIQUE_VIOLATION && typeof constraint === 'string'
    ? constraint
    : undefined;
}

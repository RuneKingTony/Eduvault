export interface MembersSearch {
  q?: string;
  role?: string;
  page?: number;
  add?: 1;
}

const textOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const text = String(value).trim();
  return text === '' ? undefined : text;
};

/** Search params arrive as parsed JSON, so "123" may be the number 123. */
export function parseMembersSearch(
  search: Record<string, unknown>
): MembersSearch {
  const page = Number(search['page']);
  return {
    q: textOf(search['q']),
    role: textOf(search['role']),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    add: textOf(search['add']) === '1' ? 1 : undefined,
  };
}

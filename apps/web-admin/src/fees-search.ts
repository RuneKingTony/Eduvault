export interface FeesSearch {
  term?: string;
  type?: string;
  add?: 1;
}

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

export function parseFeesSearch(search: Record<string, unknown>): FeesSearch {
  return {
    term: textOf(search['term']),
    type: textOf(search['type']),
    add: search['add'] === 1 || search['add'] === '1' ? 1 : undefined,
  };
}

import { textOf } from '@eduvault/shared';
import { parsePage } from './search-page';

export interface MembersSearch {
  q?: string;
  role?: string;
  page?: number;
  add?: 1;
}

/** Search params arrive as parsed JSON, so "123" may be the number 123. */
export function parseMembersSearch(
  search: Record<string, unknown>
): MembersSearch {
  return {
    q: textOf(search['q']),
    role: textOf(search['role']),
    page: parsePage(search),
    add: textOf(search['add']) === '1' ? 1 : undefined,
  };
}

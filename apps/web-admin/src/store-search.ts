import { ITEM_KINDS, type ItemKind } from '@eduvault/api-contract';
import { oneOf, pageOf, textOf } from '@eduvault/shared';

export interface StoreSearch {
  tab?: 'deliveries';
  campus?: string;
  q?: string;
  kind?: ItemKind;
  low?: 1;
  retired?: 1;
  page?: number;
  deliver?: 1;
  add?: 1;
}

const flagOf = (value: unknown): 1 | undefined =>
  textOf(value) === '1' ? 1 : undefined;

export function parseStoreSearch(search: Record<string, unknown>): StoreSearch {
  return {
    tab: search['tab'] === 'deliveries' ? 'deliveries' : undefined,
    campus: textOf(search['campus']),
    q: textOf(search['q']),
    kind: oneOf(ITEM_KINDS, search['kind']),
    low: flagOf(search['low']),
    retired: flagOf(search['retired']),
    page: pageOf(search['page']),
    deliver: flagOf(search['deliver']),
    add: flagOf(search['add']),
  };
}

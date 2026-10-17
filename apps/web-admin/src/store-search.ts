import { ITEM_KINDS, type ItemKind } from '@eduvault/api-contract';
import { oneOf, pageOf, textOf } from '@eduvault/shared';

export interface StoreSearch {
  tab?: 'deliveries' | 'sold' | 'counts';
  campus?: string;
  q?: string;
  kind?: ItemKind;
  low?: 1;
  retired?: 1;
  page?: number;
  deliver?: 1;
  add?: 1;
  sell?: 1;
  count?: 1;
  sale?: string;
}

const flagOf = (value: unknown): 1 | undefined =>
  textOf(value) === '1' ? 1 : undefined;

const TABS = ['deliveries', 'sold', 'counts'] as const;

export function parseStoreSearch(search: Record<string, unknown>): StoreSearch {
  return {
    tab: oneOf(TABS, search['tab']),
    campus: textOf(search['campus']),
    q: textOf(search['q']),
    kind: oneOf(ITEM_KINDS, search['kind']),
    low: flagOf(search['low']),
    retired: flagOf(search['retired']),
    page: pageOf(search['page']),
    deliver: flagOf(search['deliver']),
    add: flagOf(search['add']),
    sell: flagOf(search['sell']),
    count: flagOf(search['count']),
    sale: textOf(search['sale']),
  };
}

import { BALANCE_FILTERS, type BalanceFilter } from '@eduvault/api-contract';
import { oneOf, pageOf, textOf } from '@eduvault/shared';

export interface AccountsSearch {
  filter?: BalanceFilter;
  q?: string;
  page?: number;
}

export const NO_ACCOUNT_FILTERS = {
  filter: undefined,
  q: undefined,
  page: undefined,
} as const satisfies AccountsSearch;

export function parseAccountsSearch(
  search: Record<string, unknown>
): AccountsSearch {
  const filter = oneOf(BALANCE_FILTERS, search['filter']);
  return {
    filter: filter === 'owing' ? undefined : filter,
    q: textOf(search['q']),
    page: pageOf(search['page']),
  };
}

export interface StatementSearch {
  view?: 'family';
  page?: number;
}

export function parseStatementSearch(
  search: Record<string, unknown>
): StatementSearch {
  return {
    view: search['view'] === 'family' ? 'family' : undefined,
    page: pageOf(search['page']),
  };
}

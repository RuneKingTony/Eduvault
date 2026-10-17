import type { AccountsSearch } from './accounts-search';
import type { BillingSearch } from './billing-search';
import type { InvoicesSearch } from './invoices-search';
import type { PaymentsSearch } from './payments-search';

interface RouteSearch {
  '/finance/billing': BillingSearch;
  '/finance/invoices': InvoicesSearch;
  '/finance/payments': PaymentsSearch;
  '/finance/accounts': AccountsSearch;
}

type DefaultSearch<S> = {
  readonly [K in keyof Required<S>]: undefined;
};

export const SEARCH_DEFAULTS = {
  '/finance/billing': { page: undefined, prepare: undefined },
  '/finance/invoices': {
    q: undefined,
    kind: undefined,
    status: undefined,
    page: undefined,
  },
  '/finance/payments': {
    q: undefined,
    status: undefined,
    page: undefined,
    record: undefined,
  },
  '/finance/accounts': { filter: undefined, q: undefined, page: undefined },
} as const satisfies {
  [To in keyof RouteSearch]: DefaultSearch<RouteSearch[To]>;
};

export const hasSearchDefaults = (to: string): to is keyof RouteSearch =>
  Object.hasOwn(SEARCH_DEFAULTS, to);

/** Every key of the route's search, so a link to it never inherits the current page's params. */
export function searchFor<To extends keyof RouteSearch>(
  to: To,
  overrides: RouteSearch[To] = {}
): RouteSearch[To] {
  return { ...SEARCH_DEFAULTS[to], ...overrides };
}

export const prepareChargesTarget = () =>
  ({
    to: '/finance/billing',
    search: searchFor('/finance/billing', { prepare: 1 }),
  }) as const;

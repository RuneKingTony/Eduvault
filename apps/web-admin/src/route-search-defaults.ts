import type { AccountsSearch, StatementSearch } from './accounts-search';
import type { AdjustmentsSearch } from './adjustments-search';
import type { BillingSearch } from './billing-search';
import type { FeesSearch } from './fees-search';
import type { InvoicesSearch } from './invoices-search';
import type { PaymentsSearch } from './payments-search';
import type { WalletSearch, WalletsSearch } from './wallets-search';

interface RouteSearch {
  '/finance/billing': BillingSearch;
  '/finance/invoices': InvoicesSearch;
  '/finance/payments': PaymentsSearch;
  '/finance/wallets': WalletsSearch;
  '/finance/wallets/$walletId': WalletSearch;
  '/finance/accounts': AccountsSearch;
  '/finance/accounts/$studentId': StatementSearch;
  '/finance/adjustments': AdjustmentsSearch;
  '/finance/school-fees': FeesSearch;
  '/finance/other-fees': FeesSearch;
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
    new: undefined,
  },
  '/finance/payments': {
    q: undefined,
    status: undefined,
    page: undefined,
    record: undefined,
  },
  '/finance/wallets': { tab: undefined, q: undefined, page: undefined },
  '/finance/wallets/$walletId': {
    page: undefined,
    topup: undefined,
    refund: undefined,
  },
  '/finance/accounts': { filter: undefined, q: undefined, page: undefined },
  '/finance/accounts/$studentId': {
    view: undefined,
    page: undefined,
    term: undefined,
  },
  '/finance/adjustments': {
    tab: undefined,
    page: undefined,
    new: undefined,
    kind: undefined,
    student: undefined,
    amount: undefined,
  },
  '/finance/school-fees': { term: undefined, type: undefined, add: undefined },
  '/finance/other-fees': { term: undefined, type: undefined, add: undefined },
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

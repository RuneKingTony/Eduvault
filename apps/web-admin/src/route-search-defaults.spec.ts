import { parseBillingSearch } from './billing-search';
import { parseInvoicesSearch } from './invoices-search';
import {
  prepareChargesTarget,
  hasSearchDefaults,
  SEARCH_DEFAULTS,
  searchFor,
} from './route-search-defaults';

describe('hasSearchDefaults', () => {
  it('is true for the routes in the registry and false for others', () => {
    expect(hasSearchDefaults('/finance/billing')).toBe(true);
    expect(hasSearchDefaults('/finance/invoices')).toBe(true);
    expect(hasSearchDefaults('/students')).toBe(false);
    expect(hasSearchDefaults('toString')).toBe(false);
  });
});

describe('SEARCH_DEFAULTS', () => {
  it('matches, key for key, what each route parses from an empty query string', () => {
    expect(SEARCH_DEFAULTS['/finance/billing']).toStrictEqual(
      parseBillingSearch({})
    );
    expect(SEARCH_DEFAULTS['/finance/invoices']).toStrictEqual(
      parseInvoicesSearch({})
    );
  });
});

describe('searchFor', () => {
  it('returns the defaults without overrides', () => {
    expect(searchFor('/finance/billing')).toEqual(
      SEARCH_DEFAULTS['/finance/billing']
    );
    expect(searchFor('/finance/invoices')).toEqual(
      SEARCH_DEFAULTS['/finance/invoices']
    );
  });

  it('lets overrides win over the defaults', () => {
    expect(searchFor('/finance/billing', { prepare: 1 })).toEqual({
      page: undefined,
      prepare: 1,
    });
    expect(searchFor('/finance/invoices', { status: 'draft' })).toEqual({
      q: undefined,
      kind: undefined,
      status: 'draft',
      page: undefined,
    });
  });

  it('does not mutate the defaults', () => {
    searchFor('/finance/billing', { prepare: 1 });
    expect(SEARCH_DEFAULTS['/finance/billing'].prepare).toBeUndefined();
  });
});

describe('prepareChargesTarget', () => {
  it('opens the billing page with the prepare sheet and no other search', () => {
    expect(prepareChargesTarget()).toStrictEqual({
      to: '/finance/billing',
      search: { page: undefined, prepare: 1 },
    });
  });
});

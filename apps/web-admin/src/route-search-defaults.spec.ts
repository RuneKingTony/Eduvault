import { parseAccountsSearch, parseStatementSearch } from './accounts-search';
import { parseAdjustmentsSearch } from './adjustments-search';
import { parseBillingSearch } from './billing-search';
import { parseFeesSearch } from './fees-search';
import { parseInvoicesSearch } from './invoices-search';
import { parsePaymentsSearch } from './payments-search';
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
    expect(hasSearchDefaults('/finance/adjustments')).toBe(true);
    expect(hasSearchDefaults('/finance/accounts/$studentId')).toBe(true);
    expect(hasSearchDefaults('/finance/school-fees')).toBe(true);
    expect(hasSearchDefaults('/finance/other-fees')).toBe(true);
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
    expect(SEARCH_DEFAULTS['/finance/payments']).toStrictEqual(
      parsePaymentsSearch({})
    );
    expect(SEARCH_DEFAULTS['/finance/accounts']).toStrictEqual(
      parseAccountsSearch({})
    );
    expect(SEARCH_DEFAULTS['/finance/adjustments']).toStrictEqual(
      parseAdjustmentsSearch({})
    );
    expect(SEARCH_DEFAULTS['/finance/accounts/$studentId']).toStrictEqual(
      parseStatementSearch({})
    );
    expect(SEARCH_DEFAULTS['/finance/school-fees']).toStrictEqual(
      parseFeesSearch({})
    );
    expect(SEARCH_DEFAULTS['/finance/other-fees']).toStrictEqual(
      parseFeesSearch({})
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

  it('merges overrides over the fees and adjustments defaults', () => {
    expect(searchFor('/finance/school-fees', { term: 't1' })).toEqual({
      term: 't1',
      type: undefined,
      add: undefined,
    });
    expect(searchFor('/finance/adjustments', { tab: 'voids' })).toEqual({
      tab: 'voids',
      page: undefined,
      new: undefined,
      kind: undefined,
      student: undefined,
      amount: undefined,
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

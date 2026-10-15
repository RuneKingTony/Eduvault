import { parseLedgerSearch } from './ledger-search';

describe('parseLedgerSearch', () => {
  it('keeps the journal tab and drops everything else', () => {
    expect(parseLedgerSearch({ tab: 'journal' })).toEqual({ tab: 'journal' });
    expect(parseLedgerSearch({ tab: 'categories' })).toEqual({
      tab: undefined,
    });
    expect(parseLedgerSearch({ tab: 3 })).toEqual({ tab: undefined });
    expect(parseLedgerSearch({})).toEqual({ tab: undefined });
  });
});

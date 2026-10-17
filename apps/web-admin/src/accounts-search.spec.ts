import { parseAccountsSearch, parseStatementSearch } from './accounts-search';

describe('parseAccountsSearch', () => {
  it('keeps a known filter other than the default, text and a page', () => {
    expect(
      parseAccountsSearch({ filter: 'owing_gone', q: ' ada ', page: '3' })
    ).toEqual({ filter: 'owing_gone', q: 'ada', page: 3 });
  });

  it('leaves the default Owing filter and unknown values out', () => {
    expect(parseAccountsSearch({ filter: 'owing' }).filter).toBeUndefined();
    expect(parseAccountsSearch({ filter: 'rich' }).filter).toBeUndefined();
    expect(parseAccountsSearch({ q: ' ', page: 1 })).toEqual({
      filter: undefined,
      q: undefined,
      page: undefined,
    });
  });
});

describe('parseStatementSearch', () => {
  it('survives a reload with the family view and a page', () => {
    expect(parseStatementSearch({ view: 'family', page: 2 })).toEqual({
      view: 'family',
      page: 2,
    });
  });

  it('ignores any other view', () => {
    expect(parseStatementSearch({ view: 'child' })).toEqual({
      view: undefined,
      page: undefined,
    });
  });
});

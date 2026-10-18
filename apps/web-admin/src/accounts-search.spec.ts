import {
  parseAccountsSearch,
  parseStatementSearch,
  withTerm,
} from './accounts-search';

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
      term: undefined,
    });
  });

  it('ignores any other view', () => {
    expect(parseStatementSearch({ view: 'child' })).toEqual({
      view: undefined,
      page: undefined,
      term: undefined,
    });
  });

  it('keeps a term and drops a blank one', () => {
    expect(parseStatementSearch({ term: ' t-1 ', page: 2 })).toEqual({
      view: undefined,
      page: 2,
      term: 't-1',
    });
    expect(parseStatementSearch({ term: ' ' }).term).toBeUndefined();
  });
});

describe('withTerm', () => {
  it('sets the term and goes back to the first page', () => {
    expect(withTerm({ page: 3 }, 't-1')).toEqual({
      page: undefined,
      term: 't-1',
    });
  });

  it('clears the term for the whole history and still resets the page', () => {
    expect(withTerm({ term: 't-1', page: 2 }, undefined)).toEqual({
      page: undefined,
      term: undefined,
    });
  });

  it('leaves the family view as it was', () => {
    expect(withTerm({ view: 'family' }, 't-1').view).toBe('family');
  });
});

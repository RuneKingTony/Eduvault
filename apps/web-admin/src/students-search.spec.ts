import { parseStudentsSearch } from './students-search';

describe('parseStudentsSearch', () => {
  it('keeps a tab, text, filters, a page above one and the admit flag', () => {
    expect(
      parseStudentsSearch({
        tab: 'inactive',
        q: ' ada ',
        campusId: 'c1',
        levelId: 'l1',
        page: 3,
        admit: 1,
      })
    ).toEqual({
      tab: 'inactive',
      q: 'ada',
      campusId: 'c1',
      levelId: 'l1',
      page: 3,
      admit: 1,
    });
  });

  it('reads numbers that the router parsed from the query string', () => {
    expect(parseStudentsSearch({ q: 123, page: '2', admit: '1' })).toEqual({
      tab: undefined,
      q: '123',
      campusId: undefined,
      levelId: undefined,
      page: 2,
      admit: 1,
    });
  });

  it('leaves the default tab out and drops blanks, page one and anything unusable', () => {
    expect(
      parseStudentsSearch({ tab: 'active', q: ' ', page: 1, admit: 2 })
    ).toEqual({
      tab: undefined,
      q: undefined,
      campusId: undefined,
      levelId: undefined,
      page: undefined,
      admit: undefined,
    });
    expect(parseStudentsSearch({ tab: 'archived' }).tab).toBeUndefined();
    expect(parseStudentsSearch({ page: 'x' }).page).toBeUndefined();
  });
});

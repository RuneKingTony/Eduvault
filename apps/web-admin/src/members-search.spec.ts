import { parseMembersSearch } from './members-search';

describe('parseMembersSearch', () => {
  it('keeps text, a page above one and the add flag', () => {
    expect(
      parseMembersSearch({ q: ' ada ', role: 'teacher', page: 3, add: 1 })
    ).toEqual({ q: 'ada', role: 'teacher', page: 3, add: 1 });
  });

  it('reads numbers that the router parsed from the query string', () => {
    expect(parseMembersSearch({ q: 123, page: '2', add: '1' })).toEqual({
      q: '123',
      role: undefined,
      page: 2,
      add: 1,
    });
  });

  it('drops blanks, page one and anything unusable', () => {
    expect(parseMembersSearch({ q: ' ', role: {}, page: 1, add: 2 })).toEqual({
      q: undefined,
      role: undefined,
      page: undefined,
      add: undefined,
    });
    expect(parseMembersSearch({ page: 'x' }).page).toBeUndefined();
  });
});

import { pageOf, parseSubjectsSearch, tabOf } from './subjects-search';

describe('parseSubjectsSearch', () => {
  it('keeps a known tab and a page after the first', () => {
    expect(parseSubjectsSearch({ tab: 'teachers', page: '3' })).toEqual({
      tab: 'teachers',
      page: 3,
    });
    expect(parseSubjectsSearch({ tab: 'by-level' }).tab).toBe('by-level');
  });

  it('drops the catalogue tab, page 1 and anything unknown', () => {
    expect(parseSubjectsSearch({ tab: 'catalogue', page: 1 })).toEqual({
      tab: undefined,
      page: undefined,
    });
    expect(parseSubjectsSearch({ tab: 'x', page: 'abc' })).toEqual({
      tab: undefined,
      page: undefined,
    });
    expect(parseSubjectsSearch({ page: 2.5 }).page).toBeUndefined();
  });

  it('defaults to the catalogue on page 1', () => {
    expect(tabOf({})).toBe('catalogue');
    expect(pageOf({})).toBe(1);
    expect(tabOf({ tab: 'teachers' })).toBe('teachers');
    expect(pageOf({ page: 4 })).toBe(4);
  });
});

import { parseCalendarSearch } from './calendar-search';

describe('parseCalendarSearch', () => {
  it('keeps a page after the first and the new-year dialog', () => {
    expect(parseCalendarSearch({ page: 3, dialog: 'new-year' })).toEqual({
      page: 3,
      dialog: 'new-year',
    });
    expect(parseCalendarSearch({ page: '2' }).page).toBe(2);
  });

  it('drops the first page, a bad page and an unknown dialog', () => {
    expect(parseCalendarSearch({ page: 1 })).toEqual({
      page: undefined,
      dialog: undefined,
    });
    expect(parseCalendarSearch({ page: 'x', dialog: 'other' })).toEqual({
      page: undefined,
      dialog: undefined,
    });
    expect(parseCalendarSearch({})).toEqual({
      page: undefined,
      dialog: undefined,
    });
  });
});

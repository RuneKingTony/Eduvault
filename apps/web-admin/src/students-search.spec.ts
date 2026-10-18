import { parseStudentSearch, parseStudentsSearch } from './students-search';

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

describe('the start-year dialog param', () => {
  it('keeps dialog=start-year and drops anything else', () => {
    expect(parseStudentsSearch({ dialog: 'start-year' }).dialog).toBe(
      'start-year'
    );
    expect(parseStudentsSearch({ dialog: 'admit' }).dialog).toBeUndefined();
    expect(parseStudentsSearch({}).dialog).toBeUndefined();
  });
});

describe('parseStudentSearch', () => {
  it('keeps dialog=leave for the student page and drops anything else', () => {
    expect(parseStudentSearch({ dialog: 'leave' })).toEqual({
      tab: undefined,
      dialog: 'leave',
    });
    expect(parseStudentSearch({ dialog: 'start-year' })).toEqual({
      tab: undefined,
      dialog: undefined,
    });
    expect(parseStudentSearch({})).toEqual({
      tab: undefined,
      dialog: undefined,
    });
  });

  it('keeps tab=fees next to the dialog', () => {
    expect(parseStudentSearch({ tab: 'fees', dialog: 'leave' })).toEqual({
      tab: 'fees',
      dialog: 'leave',
    });
  });

  it('leaves Overview out, whether named, unknown or missing', () => {
    expect(parseStudentSearch({ tab: 'overview' }).tab).toBeUndefined();
    expect(parseStudentSearch({ tab: 'billing' }).tab).toBeUndefined();
    expect(parseStudentSearch({ tab: 1 }).tab).toBeUndefined();
    expect(parseStudentSearch({}).tab).toBeUndefined();
  });
});

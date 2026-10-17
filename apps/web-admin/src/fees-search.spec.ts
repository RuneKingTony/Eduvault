import { parseFeesSearch } from './fees-search';

describe('parseFeesSearch', () => {
  it('keeps the term, the fee type chip and the add flag', () => {
    expect(parseFeesSearch({ term: 't1', type: 'f1', add: 1 })).toEqual({
      term: 't1',
      type: 'f1',
      add: 1,
    });
    expect(parseFeesSearch({ add: '1' }).add).toBe(1);
  });

  it('drops blanks and anything else', () => {
    expect(parseFeesSearch({ term: ' ', type: 4, add: 2 })).toEqual({
      term: undefined,
      type: '4',
      add: undefined,
    });
    expect(parseFeesSearch({ term: {}, type: ' ' })).toEqual({
      term: undefined,
      type: undefined,
      add: undefined,
    });
    expect(parseFeesSearch({})).toEqual({
      term: undefined,
      type: undefined,
      add: undefined,
    });
  });
});

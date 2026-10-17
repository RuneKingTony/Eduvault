import { parsePaymentsSearch, parseReceiptSearch } from './payments-search';

describe('parsePaymentsSearch', () => {
  it('keeps text, a known status, a page above one and the record flag', () => {
    expect(
      parsePaymentsSearch({
        q: ' RCT ',
        status: 'void_pending',
        page: '2',
        record: 1,
      })
    ).toEqual({ q: 'RCT', status: 'void_pending', page: 2, record: 1 });
  });

  it('drops blanks, unknown statuses and page one', () => {
    expect(
      parsePaymentsSearch({ q: ' ', status: 'gone', page: 1, record: 0 })
    ).toEqual({
      q: undefined,
      status: undefined,
      page: undefined,
      record: undefined,
    });
  });
});

describe('parseReceiptSearch', () => {
  it('keeps the just-recorded flag and nothing else', () => {
    expect(parseReceiptSearch({ recorded: '1' })).toEqual({ recorded: 1 });
    expect(parseReceiptSearch({ recorded: 0 })).toEqual({
      recorded: undefined,
    });
    expect(parseReceiptSearch({})).toEqual({ recorded: undefined });
  });
});

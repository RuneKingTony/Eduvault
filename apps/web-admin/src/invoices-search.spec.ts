import { parseInvoicesSearch } from './invoices-search';

describe('parseInvoicesSearch', () => {
  it('keeps text, a known kind and status and a page above one', () => {
    expect(
      parseInvoicesSearch({
        q: ' ada ',
        kind: 'term',
        status: 'draft',
        page: 2,
      })
    ).toEqual({ q: 'ada', kind: 'term', status: 'draft', page: 2 });
  });

  it('reads numbers the router parsed from the query string', () => {
    expect(parseInvoicesSearch({ q: 123, page: '3' })).toMatchObject({
      q: '123',
      page: 3,
    });
  });

  it('drops blanks, unknown values and page one', () => {
    expect(
      parseInvoicesSearch({ q: ' ', kind: 'refund', status: 'sent', page: 1 })
    ).toEqual({
      q: undefined,
      kind: undefined,
      status: undefined,
      page: undefined,
    });
  });
});

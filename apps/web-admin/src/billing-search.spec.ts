import { parseBillingSearch, parseRunSearch } from './billing-search';

describe('parseBillingSearch', () => {
  it('keeps a page above one and the prepare flag', () => {
    expect(parseBillingSearch({ page: 3, prepare: 1 })).toEqual({
      page: 3,
      prepare: 1,
    });
  });

  it('reads the strings the router leaves in the query', () => {
    expect(parseBillingSearch({ page: '2', prepare: '1' })).toEqual({
      page: 2,
      prepare: 1,
    });
  });

  it('drops page one, junk and other flags', () => {
    expect(parseBillingSearch({ page: 1, prepare: 2 })).toEqual({
      page: undefined,
      prepare: undefined,
    });
    expect(parseBillingSearch({ page: 'x' }).page).toBeUndefined();
  });
});

describe('parseRunSearch', () => {
  it('keeps only a page above one', () => {
    expect(parseRunSearch({ page: '4', prepare: 1 })).toEqual({ page: 4 });
    expect(parseRunSearch({ page: 0 })).toEqual({ page: undefined });
  });
});

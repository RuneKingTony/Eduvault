import { parseStoreSearch } from './store-search';

describe('parseStoreSearch', () => {
  it('keeps the tab, campus, filters, flags and a page above one', () => {
    expect(
      parseStoreSearch({
        tab: 'deliveries',
        campus: 'c1',
        q: ' shirt ',
        kind: 'uniform',
        low: '1',
        retired: 1,
        page: '3',
        deliver: 1,
        add: '1',
      })
    ).toEqual({
      tab: 'deliveries',
      campus: 'c1',
      q: 'shirt',
      kind: 'uniform',
      low: 1,
      retired: 1,
      page: 3,
      deliver: 1,
      add: 1,
    });
  });

  it('drops the Items tab, blanks, unknown kinds, other flag values and page one', () => {
    expect(
      parseStoreSearch({
        tab: 'items',
        campus: ' ',
        q: '',
        kind: 'toy',
        low: 0,
        retired: 'yes',
        page: 1,
        deliver: '0',
        add: false,
      })
    ).toEqual({
      tab: undefined,
      campus: undefined,
      q: undefined,
      kind: undefined,
      low: undefined,
      retired: undefined,
      page: undefined,
      deliver: undefined,
      add: undefined,
    });
  });
});

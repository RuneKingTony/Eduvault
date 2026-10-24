import { parseWalletSearch, parseWalletsSearch } from './wallets-search';

describe('parseWalletsSearch', () => {
  it('keeps a search text and a page', () => {
    expect(parseWalletsSearch({ q: 'Ojo', page: '3' })).toEqual({
      q: 'Ojo',
      page: 3,
    });
  });

  it('drops a blank text and a page that is not a positive whole number', () => {
    expect(parseWalletsSearch({ q: '', page: '0' })).toEqual({
      q: undefined,
      page: undefined,
    });
    expect(parseWalletsSearch({ page: 'x' }).page).toBeUndefined();
    expect(parseWalletsSearch({})).toEqual({ q: undefined, page: undefined });
  });
});

describe('parseWalletSearch', () => {
  it('opens the top-up sheet only for topup=1', () => {
    expect(parseWalletSearch({ topup: '1' }).topup).toBe(1);
    expect(parseWalletSearch({ topup: 1 }).topup).toBe(1);
    expect(parseWalletSearch({ topup: '2' }).topup).toBeUndefined();
    expect(parseWalletSearch({}).topup).toBeUndefined();
  });

  it('keeps the movements page', () => {
    expect(parseWalletSearch({ page: '2' }).page).toBe(2);
    expect(parseWalletSearch({ page: '-1' }).page).toBeUndefined();
  });
});

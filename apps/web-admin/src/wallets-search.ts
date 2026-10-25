import { oneOf, pageOf, textOf } from '@eduvault/shared';

export const WALLETS_TABS = ['wallets', 'requests'] as const;
export type WalletsTab = (typeof WALLETS_TABS)[number];

export interface WalletsSearch {
  tab?: Exclude<WalletsTab, 'wallets'>;
  q?: string;
  page?: number;
}

export function parseWalletsSearch(
  search: Record<string, unknown>
): WalletsSearch {
  return {
    tab: oneOf(['requests'] as const, search['tab']),
    q: textOf(search['q']),
    page: pageOf(search['page']),
  };
}

export const walletsTabOf = (search: WalletsSearch): WalletsTab =>
  search.tab ?? 'wallets';

export interface WalletSearch {
  page?: number;
  topup?: 1;
  refund?: 1;
}

export function parseWalletSearch(
  search: Record<string, unknown>
): WalletSearch {
  return {
    page: pageOf(search['page']),
    topup: textOf(search['topup']) === '1' ? 1 : undefined,
    refund: textOf(search['refund']) === '1' ? 1 : undefined,
  };
}

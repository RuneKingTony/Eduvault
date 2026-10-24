import { pageOf, textOf } from '@eduvault/shared';

export interface WalletsSearch {
  q?: string;
  page?: number;
}

export function parseWalletsSearch(
  search: Record<string, unknown>
): WalletsSearch {
  return {
    q: textOf(search['q']),
    page: pageOf(search['page']),
  };
}

export interface WalletSearch {
  page?: number;
  topup?: 1;
}

export function parseWalletSearch(
  search: Record<string, unknown>
): WalletSearch {
  return {
    page: pageOf(search['page']),
    topup: textOf(search['topup']) === '1' ? 1 : undefined,
  };
}

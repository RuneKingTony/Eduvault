import { pageOf } from '@eduvault/shared';

export interface BillingSearch {
  page?: number;
  prepare?: 1;
}

interface RunSearch {
  page?: number;
}

/** Search params arrive as parsed JSON, so "2" may be the number 2. */
export function parseBillingSearch(
  search: Record<string, unknown>
): BillingSearch {
  return {
    page: pageOf(search['page']),
    prepare:
      search['prepare'] === 1 || search['prepare'] === '1' ? 1 : undefined,
  };
}

export const parseRunSearch = (search: Record<string, unknown>): RunSearch => ({
  page: pageOf(search['page']),
});

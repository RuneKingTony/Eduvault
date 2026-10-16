import { FINANCE_PAGE_SIZE } from '@eduvault/api-contract';

export function pageOf<T>(items: readonly T[], page: number): T[] {
  return items.slice((page - 1) * FINANCE_PAGE_SIZE, page * FINANCE_PAGE_SIZE);
}

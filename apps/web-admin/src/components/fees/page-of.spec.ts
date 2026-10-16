import { FINANCE_PAGE_SIZE } from '@eduvault/api-contract';
import { pageOf } from './page-of';

const items = Array.from({ length: FINANCE_PAGE_SIZE + 3 }, (_, i) => i);

describe('pageOf', () => {
  it('returns the first page, then the remainder', () => {
    expect(pageOf(items, 1)).toEqual(items.slice(0, FINANCE_PAGE_SIZE));
    expect(pageOf(items, 2)).toEqual(items.slice(FINANCE_PAGE_SIZE));
  });

  it('is empty past the last page', () => {
    expect(pageOf(items, 3)).toEqual([]);
  });
});

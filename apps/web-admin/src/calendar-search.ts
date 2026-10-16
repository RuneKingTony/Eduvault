import { parsePage } from './search-page';

interface CalendarSearch {
  page?: number;
  dialog?: 'new-year';
}

/** Search params arrive as parsed JSON, so "2" may be the number 2. */
export function parseCalendarSearch(
  search: Record<string, unknown>
): CalendarSearch {
  return {
    page: parsePage(search),
    dialog: search['dialog'] === 'new-year' ? 'new-year' : undefined,
  };
}

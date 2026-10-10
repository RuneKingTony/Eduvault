interface CalendarSearch {
  page?: number;
  dialog?: 'new-year';
}

/** Search params arrive as parsed JSON, so "2" may be the number 2. */
export function parseCalendarSearch(
  search: Record<string, unknown>
): CalendarSearch {
  const page = Number(search['page']);
  return {
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    dialog: search['dialog'] === 'new-year' ? 'new-year' : undefined,
  };
}

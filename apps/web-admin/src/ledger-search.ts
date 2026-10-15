interface LedgerSearch {
  tab?: 'journal';
}

/** Search params arrive as parsed JSON, so anything but "journal" falls back to the categories. */
export function parseLedgerSearch(
  search: Record<string, unknown>
): LedgerSearch {
  return { tab: search['tab'] === 'journal' ? 'journal' : undefined };
}

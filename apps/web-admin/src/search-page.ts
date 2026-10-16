export function parsePage(search: Record<string, unknown>): number | undefined {
  const page = Number(search['page']);
  return Number.isInteger(page) && page > 1 ? page : undefined;
}

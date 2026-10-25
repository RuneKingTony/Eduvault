/** Prefixes of every journal reference the system builds itself. A client-chosen reference shares the school's journal namespace, so none may start with one. */
export const SYSTEM_REFERENCE_PREFIXES = {
  invoice: 'CHG',
  payment: 'RCT',
  billing_run: 'BR',
  adjustment: 'ADJ',
  store_sale: 'ISS',
  delivery: 'DEL',
  stock_count: 'CNT',
  void: 'VOID',
  opening: 'OPEN',
  monnify: 'MNFY',
  autopay: 'AUTOPAY',
  wallet_refund: 'WRF',
  wallet_cancellation: 'WTC',
} as const;

export type SystemReferenceKind = keyof typeof SYSTEM_REFERENCE_PREFIXES;

/** Monnify numbers its transactions `MNFY|20|…`, so a pipe closes a prefix as well as a dash. */
const RESERVED_STARTS = Object.values(SYSTEM_REFERENCE_PREFIXES).flatMap(
  (prefix) => [`${prefix}-`, `${prefix}|`]
);

export function isReservedReference(reference: string): boolean {
  const start = reference.trim().toUpperCase();
  return RESERVED_STARTS.some((reserved) => start.startsWith(reserved));
}

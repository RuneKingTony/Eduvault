import type { LedgerLine } from '../../common/ledger';

export const VOID_MEMO_MAX = 500;

export const voidReference = (paymentReference: string): string =>
  `VOID-${paymentReference}`;

export const voidMemo = (receiptNumber: string, reason: string): string =>
  `Void of ${receiptNumber}: ${reason}`.slice(0, VOID_MEMO_MAX);

/** Copies the receipt's own lines, never today's campus, so a later move cannot change what is reversed. */
export function mirrorLines(original: readonly LedgerLine[]): LedgerLine[] {
  return original.map((line) => ({
    ledgerAccountId: line.ledgerAccountId,
    studentId: line.studentId ?? null,
    campusId: line.campusId ?? null,
    debitMinor: line.creditMinor,
    creditMinor: line.debitMinor,
  }));
}

import { SYSTEM_REFERENCE_PREFIXES } from '@eduvault/shared';
import type { Clock } from '../clock';
import type { DocumentKind } from './document-sequence';

type YearlyDocumentKind = Exclude<DocumentKind, 'admission'>;

const DIGITS: Record<YearlyDocumentKind, number> = {
  invoice: 5,
  payment: 5,
  billing_run: 4,
  adjustment: 4,
  store_sale: 4,
  delivery: 4,
  stock_count: 4,
};

/** Numbers widen past the padding, never truncate. */
export function formatDocumentNumber(
  kind: YearlyDocumentKind,
  year: number,
  value: number
): string {
  const prefix = SYSTEM_REFERENCE_PREFIXES[kind];
  return `${prefix}-${year}-${String(value).padStart(DIGITS[kind], '0')}`;
}

export const documentYear = (clock: Pick<Clock, 'today'>): number =>
  Number(clock.today().slice(0, 4));

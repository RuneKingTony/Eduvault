import type { Clock } from '../clock';
import type { DocumentKind } from './document-sequence';

type YearlyDocumentKind = Exclude<DocumentKind, 'admission'>;

const FORMATS: Record<YearlyDocumentKind, { prefix: string; digits: number }> =
  {
    invoice: { prefix: 'CHG', digits: 5 },
    payment: { prefix: 'RCT', digits: 5 },
    billing_run: { prefix: 'BR', digits: 4 },
    adjustment: { prefix: 'ADJ', digits: 4 },
    store_sale: { prefix: 'ISS', digits: 4 },
    delivery: { prefix: 'DEL', digits: 4 },
    stock_count: { prefix: 'CNT', digits: 4 },
  };

/** Numbers widen past the padding, never truncate. */
export function formatDocumentNumber(
  kind: YearlyDocumentKind,
  year: number,
  value: number
): string {
  const { prefix, digits } = FORMATS[kind];
  return `${prefix}-${year}-${String(value).padStart(digits, '0')}`;
}

export const documentYear = (clock: Pick<Clock, 'today'>): number =>
  Number(clock.today().slice(0, 4));

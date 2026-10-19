import { isReservedReference } from '@eduvault/shared';
import { documentYear, formatDocumentNumber } from './document-format';

describe('formatDocumentNumber', () => {
  it('pads charges and receipts to five digits', () => {
    expect(formatDocumentNumber('invoice', 2026, 42)).toBe('CHG-2026-00042');
    expect(formatDocumentNumber('payment', 2026, 88)).toBe('RCT-2026-00088');
  });

  it('pads the other kinds to four digits', () => {
    expect(formatDocumentNumber('billing_run', 2026, 1)).toBe('BR-2026-0001');
    expect(formatDocumentNumber('adjustment', 2026, 1)).toBe('ADJ-2026-0001');
    expect(formatDocumentNumber('store_sale', 2026, 1)).toBe('ISS-2026-0001');
    expect(formatDocumentNumber('delivery', 2026, 12)).toBe('DEL-2026-0012');
    expect(formatDocumentNumber('stock_count', 2027, 345)).toBe(
      'CNT-2027-0345'
    );
  });

  it.each([
    'invoice',
    'payment',
    'billing_run',
    'adjustment',
    'store_sale',
    'delivery',
    'stock_count',
  ] as const)('issues %s numbers a client reference cannot use', (kind) => {
    expect(isReservedReference(formatDocumentNumber(kind, 2026, 1))).toBe(true);
  });

  it('widens past the padding instead of truncating', () => {
    expect(formatDocumentNumber('invoice', 2026, 123_456)).toBe(
      'CHG-2026-123456'
    );
    expect(formatDocumentNumber('billing_run', 2026, 12_345)).toBe(
      'BR-2026-12345'
    );
  });
});

describe('documentYear', () => {
  it('reads the year of the Lagos date', () => {
    expect(documentYear({ today: () => '2026-12-31' })).toBe(2026);
    expect(documentYear({ today: () => '2027-01-01' })).toBe(2027);
  });
});

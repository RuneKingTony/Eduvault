import { isReservedReference } from '@eduvault/shared';
import { voidMemo, voidReference } from './payment-void-posting';

describe('voidReference and voidMemo', () => {
  it('names the entry after the payment reference and the memo after the receipt', () => {
    expect(voidReference('CASH-20261015-A1')).toBe('VOID-CASH-20261015-A1');
    expect(voidMemo('RCT-2026-00098', 'Wrong child')).toBe(
      'Void of RCT-2026-00098: Wrong child'
    );
  });

  it('builds a reference a client cannot choose for a payment', () => {
    expect(isReservedReference(voidReference('CASH-20261015-A1'))).toBe(true);
  });

  it('keeps the memo within the journal’s 500 characters', () => {
    expect(voidMemo('RCT-2026-00098', 'x'.repeat(500))).toHaveLength(500);
  });
});

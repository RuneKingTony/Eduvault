import { describe, expect, it } from 'vitest';
import { PAYMENT_METHODS, paymentReference } from './payment-reference';
import {
  SYSTEM_REFERENCE_PREFIXES,
  isReservedReference,
} from './reference-namespace';

describe('isReservedReference', () => {
  it.each(Object.values(SYSTEM_REFERENCE_PREFIXES))(
    'refuses a reference that starts with %s-',
    (prefix) => {
      expect(isReservedReference(`${prefix}-2026-0001`)).toBe(true);
    }
  );

  it('ignores case and surrounding spaces', () => {
    expect(isReservedReference('  adj-2026-0001 ')).toBe(true);
    expect(isReservedReference('Void-CSH-20261007-ABCDEF')).toBe(true);
  });

  it('needs the dash, so a longer word is not a system number', () => {
    expect(isReservedReference('VOIDED-1')).toBe(false);
    expect(isReservedReference('CNTR-1')).toBe(false);
    expect(isReservedReference('OPENING-1')).toBe(false);
  });

  it('only looks at the start', () => {
    expect(isReservedReference('PAID-ADJ-2026-0001')).toBe(false);
  });

  it('keeps the references the web app generates', () => {
    for (const method of PAYMENT_METHODS) {
      expect(
        isReservedReference(paymentReference(method, '2026-10-07', 'ABCDEF'))
      ).toBe(false);
    }
    expect(isReservedReference('STORE-20261007-1A2B3C4D')).toBe(false);
    expect(isReservedReference('ONEOFF-20261007-1A2B3C4D')).toBe(false);
  });
});

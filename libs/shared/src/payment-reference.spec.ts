import {
  generatePaymentReference,
  paymentReference,
  randomReferenceSuffix,
} from './payment-reference';

const fixed =
  (...values: number[]) =>
  () =>
    Uint8Array.from(values);

describe('paymentReference', () => {
  it.each([
    ['cash', 'CSH'],
    ['transfer', 'TRF'],
    ['pos', 'POS'],
  ] as const)(
    'prefixes %s with %s and drops the date hyphens',
    (method, prefix) => {
      expect(paymentReference(method, '2026-10-07', 'K3Q7ZA')).toBe(
        `${prefix}-20261007-K3Q7ZA`
      );
    }
  );
});

describe('randomReferenceSuffix', () => {
  it('maps each byte to one of 32 characters using its low five bits', () => {
    expect(randomReferenceSuffix(fixed(0, 1, 25, 26, 31, 255))).toBe(
      'ABZ27' + '7'
    );
  });

  it('is six characters from the base32 alphabet by default', () => {
    for (let run = 0; run < 50; run += 1) {
      expect(randomReferenceSuffix()).toMatch(/^[A-Z2-7]{6}$/);
    }
  });
});

describe('generatePaymentReference', () => {
  it('follows the method and the date', () => {
    expect(
      generatePaymentReference('pos', '2026-01-31', fixed(2, 2, 2, 2, 2, 2))
    ).toBe('POS-20260131-CCCCCC');
  });
});

export const PAYMENT_METHODS = ['cash', 'transfer', 'pos'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_REFERENCE_PREFIXES: Record<PaymentMethod, string> = {
  cash: 'CSH',
  transfer: 'TRF',
  pos: 'POS',
};

export const PAYMENT_REFERENCE_SUFFIX_LENGTH = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_MASK = 31;

export type RandomBytes = (length: number) => Uint8Array;

const browserRandom: RandomBytes = (length) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

/** Five bits per character: 256 is a multiple of 32, so every character is equally likely. */
export function randomReferenceSuffix(
  random: RandomBytes = browserRandom
): string {
  return [...random(PAYMENT_REFERENCE_SUFFIX_LENGTH)]
    .map((byte) => BASE32.charAt(byte & BASE32_MASK))
    .join('');
}

export function paymentReference(
  method: PaymentMethod,
  lagosDate: string,
  suffix: string
): string {
  return `${PAYMENT_REFERENCE_PREFIXES[method]}-${lagosDate.replaceAll('-', '')}-${suffix}`;
}

export function generatePaymentReference(
  method: PaymentMethod,
  lagosDate: string,
  random?: RandomBytes
): string {
  return paymentReference(method, lagosDate, randomReferenceSuffix(random));
}

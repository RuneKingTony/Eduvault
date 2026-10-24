import { createHmac, timingSafeEqual } from 'node:crypto';

const SHA512_HEX_LENGTH = 128;

/** What Monnify sends in `monnify-signature`: the hex HMAC-SHA512 of the raw body under the school's secret key. */
export const monnifySignature = (secretKey: string, rawBody: Buffer): string =>
  createHmac('sha512', secretKey).update(rawBody).digest('hex');

export function signatureMatches(
  secretKey: string,
  rawBody: Buffer,
  header: string | undefined
): boolean {
  const given = header?.trim().toLowerCase() ?? '';
  if (given.length !== SHA512_HEX_LENGTH || !/^[\da-f]+$/.test(given)) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(given, 'hex'),
    Buffer.from(monnifySignature(secretKey, rawBody), 'hex')
  );
}

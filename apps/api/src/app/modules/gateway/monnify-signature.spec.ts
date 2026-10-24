import { createHmac } from 'node:crypto';
import { monnifySignature, signatureMatches } from './monnify-signature';

const body = Buffer.from('{"eventType":"SUCCESSFUL_TRANSACTION"}');

describe('monnifySignature', () => {
  it('is the hex HMAC-SHA512 of the raw bytes under the secret key', () => {
    expect(monnifySignature('secret', body)).toBe(
      createHmac('sha512', 'secret').update(body).digest('hex')
    );
    expect(monnifySignature('secret', body)).toHaveLength(128);
  });
});

describe('signatureMatches', () => {
  const good = monnifySignature('secret', body);

  it('accepts the signature, in any case and with stray spaces', () => {
    expect(signatureMatches('secret', body, good)).toBe(true);
    expect(signatureMatches('secret', body, ` ${good.toUpperCase()} `)).toBe(
      true
    );
  });

  it('refuses another secret, another body and another length', () => {
    expect(signatureMatches('other', body, good)).toBe(false);
    expect(signatureMatches('secret', Buffer.from('{}'), good)).toBe(false);
    expect(signatureMatches('secret', body, good.slice(2))).toBe(false);
    expect(signatureMatches('secret', body, `${good}00`)).toBe(false);
  });

  it('refuses a missing header and one that is not hex', () => {
    expect(signatureMatches('secret', body, undefined)).toBe(false);
    expect(signatureMatches('secret', body, '')).toBe(false);
    expect(signatureMatches('secret', body, 'z'.repeat(128))).toBe(false);
  });
});

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

/** A sealed value reads `v1.<iv>.<tag>.<ciphertext>`, each part base64. */
export function seal(
  key: Buffer,
  secret: { plaintext: string; context: string }
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(secret.context));
  const body = Buffer.concat([
    cipher.update(secret.plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [VERSION, iv, cipher.getAuthTag(), body]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
    .join('.');
}

/** Throws when the value was changed, sealed under another key, or sealed for another context. */
export function open(
  key: Buffer,
  sealed: { value: string; context: string }
): string {
  const [version, iv, tag, body, ...rest] = sealed.value.split('.');
  if (
    version !== VERSION ||
    iv === undefined ||
    tag === undefined ||
    body === undefined ||
    rest.length > 0
  ) {
    throw new Error('Not a sealed value');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(sealed.context));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

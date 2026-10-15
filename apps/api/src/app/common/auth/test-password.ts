import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const digest = (salt: string, password: string): Buffer =>
  createHash('sha256').update(`${salt}:${password}`).digest();

// Better Auth's default scrypt costs about 40ms a call, and the integration
// suite signs users in thousands of times. Only `NODE_ENV=test` selects this.
export const testPassword = {
  hash: (password: string): Promise<string> => {
    const salt = randomBytes(8).toString('hex');
    return Promise.resolve(`${salt}:${digest(salt, password).toString('hex')}`);
  },
  verify: ({
    hash,
    password,
  }: {
    hash: string;
    password: string;
  }): Promise<boolean> => {
    const [salt = '', expected = ''] = hash.split(':');
    const actual = digest(salt, password);
    const stored = Buffer.from(expected, 'hex');
    return Promise.resolve(
      stored.length === actual.length && timingSafeEqual(stored, actual)
    );
  },
};

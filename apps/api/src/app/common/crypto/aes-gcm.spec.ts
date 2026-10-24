import { randomBytes } from 'node:crypto';
import { open, seal } from './aes-gcm';

const key = randomBytes(32);
const context = 'school-a:api_key';

const flip = (part: string) => {
  const bytes = Buffer.from(part, 'base64');
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  return bytes.toString('base64');
};

describe('seal and open', () => {
  it('round-trips text, including non-ASCII', () => {
    for (const plaintext of [
      'MK_TEST_ABC123',
      'ẹ̀kọ́ ₦ 日本語',
      'x'.repeat(500),
    ]) {
      const sealed = seal(key, { plaintext, context });
      expect(open(key, { value: sealed, context })).toBe(plaintext);
    }
  });

  it('never repeats an IV, so equal secrets seal differently', () => {
    const first = seal(key, { plaintext: 'same', context });
    const second = seal(key, { plaintext: 'same', context });
    expect(first).not.toBe(second);
    expect(first.split('.')[1]).not.toBe(second.split('.')[1]);
  });

  it('does not contain the plaintext', () => {
    const sealed = seal(key, { plaintext: 'MK_TEST_ABC123', context });
    expect(sealed).not.toContain('MK_TEST_ABC123');
    expect(
      Buffer.from(sealed.split('.')[3] ?? '', 'base64').toString()
    ).not.toContain('ABC123');
  });

  it('refuses a value whose ciphertext, tag or IV was changed', () => {
    const [version, iv, tag, body] = seal(key, {
      plaintext: 'MK_TEST_ABC123',
      context,
    }).split('.') as [string, string, string, string];
    for (const tampered of [
      [version, iv, tag, flip(body)],
      [version, iv, flip(tag), body],
      [version, flip(iv), tag, body],
    ]) {
      expect(() => open(key, { value: tampered.join('.'), context })).toThrow();
    }
  });

  it('refuses another key and another context', () => {
    const sealed = seal(key, { plaintext: 'MK_TEST_ABC123', context });
    expect(() => open(randomBytes(32), { value: sealed, context })).toThrow();
    expect(() =>
      open(key, { value: sealed, context: 'school-b:api_key' })
    ).toThrow();
  });

  it.each(['', 'v1.a.b', 'v2.a.b.c', 'v1.a.b.c.d', 'plain text'])(
    'refuses %j as not sealed',
    (value) => {
      expect(() => open(key, { value, context })).toThrow();
    }
  );
});

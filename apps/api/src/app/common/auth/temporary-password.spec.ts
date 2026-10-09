import {
  TEMP_CODE_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from './temporary-password';

describe('generateTemporaryPassword', () => {
  it('is 12 characters long', () => {
    expect(generateTemporaryPassword()).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
    expect(TEMPORARY_PASSWORD_LENGTH).toBe(12);
  });

  it('uses letters and digits without 0, O, 1 or l', () => {
    for (const ambiguous of ['0', 'O', '1', 'l']) {
      expect(TEMP_CODE_ALPHABET).not.toContain(ambiguous);
    }
    for (let run = 0; run < 200; run += 1) {
      expect(generateTemporaryPassword()).toMatch(/^[2-9A-NP-Za-km-z]{12}$/);
    }
  });

  it('differs between calls', () => {
    const passwords = new Set(
      Array.from({ length: 50 }, () => generateTemporaryPassword())
    );
    expect(passwords.size).toBe(50);
  });
});

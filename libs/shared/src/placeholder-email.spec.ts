import { PLACEHOLDER_EMAIL_DOMAIN, isPlaceholderEmail } from './index';

describe('isPlaceholderEmail', () => {
  it('knows the address given to a username login, in any case', () => {
    expect(isPlaceholderEmail(`abc@${PLACEHOLDER_EMAIL_DOMAIN}`)).toBe(true);
    expect(isPlaceholderEmail('ABC@USERS.EDUVAULT.INVALID')).toBe(true);
  });

  it('keeps real and look-alike addresses', () => {
    expect(isPlaceholderEmail('ngozi@example.com')).toBe(false);
    expect(isPlaceholderEmail('x@users.eduvault.invalid.example.com')).toBe(
      false
    );
    expect(isPlaceholderEmail('users.eduvault.invalid@example.com')).toBe(
      false
    );
  });
});

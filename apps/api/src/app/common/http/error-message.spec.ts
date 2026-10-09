import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('reads the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back for anything else', () => {
    expect(errorMessage('boom')).toBe('unknown error');
    expect(errorMessage(undefined)).toBe('unknown error');
  });
});

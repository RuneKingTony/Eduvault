import { authBaseUrl } from './auth-client';

describe('authBaseUrl', () => {
  it('adds the auth path to a bare origin', () => {
    expect(authBaseUrl('http://localhost:3000')).toBe(
      'http://localhost:3000/api/auth'
    );
  });

  it('keeps a proxy prefix and ignores trailing slashes', () => {
    expect(authBaseUrl('https://admin.example.com/backend/')).toBe(
      'https://admin.example.com/backend/api/auth'
    );
  });
});

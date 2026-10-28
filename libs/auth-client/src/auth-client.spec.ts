import { createAuthClient } from 'better-auth/react';
import { createEduvaultAuthClient, resolveAuthBaseUrl } from './auth-client';

vi.mock('better-auth/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth/react')>();
  return { ...actual, createAuthClient: vi.fn(actual.createAuthClient) };
});

const ORIGIN = 'https://eduvault-admin.onrender.com';

describe('resolveAuthBaseUrl', () => {
  it.each(['/api', '/api/'])(
    'resolves the relative base %s to the page origin',
    (baseURL) => {
      expect(resolveAuthBaseUrl(baseURL, ORIGIN)).toBe(ORIGIN);
    }
  );

  it('passes a protocol-relative base through for Better Auth to reject', () => {
    expect(resolveAuthBaseUrl('//api.example.com/api', ORIGIN)).toBe(
      '//api.example.com/api'
    );
  });

  it.each(['http://localhost:3000', 'https://api.example.com/'])(
    'passes the absolute URL %s through unchanged',
    (baseURL) => {
      expect(resolveAuthBaseUrl(baseURL, ORIGIN)).toBe(baseURL);
    }
  );

  it('throws for a relative base when there is no page origin', () => {
    expect(() => resolveAuthBaseUrl('/api', undefined)).toThrow(
      'needs a page origin'
    );
  });

  it('does not need a page origin for an absolute URL', () => {
    expect(resolveAuthBaseUrl('https://api.example.com', undefined)).toBe(
      'https://api.example.com'
    );
  });
});

describe('createEduvaultAuthClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(createAuthClient).mockClear();
  });

  it('builds the client with the page origin for a relative base', () => {
    vi.stubGlobal('location', { origin: ORIGIN });
    createEduvaultAuthClient('/api');
    expect(createAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: ORIGIN })
    );
  });

  it('builds the client with an absolute base unchanged and no page location', () => {
    vi.stubGlobal('location', undefined);
    createEduvaultAuthClient('http://localhost:3000');
    expect(createAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'http://localhost:3000' })
    );
  });

  it('throws for a relative base without a page location', () => {
    vi.stubGlobal('location', undefined);
    expect(() => createEduvaultAuthClient('/api')).toThrow(
      'needs a page origin'
    );
  });
});

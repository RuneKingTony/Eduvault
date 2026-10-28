import { organizationClient, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Better Auth rejects a relative base, and the server mounts auth at /api/auth
// regardless of any proxy prefix, so a relative base resolves to the page origin.
export const resolveAuthBaseUrl = (
  baseURL: string,
  origin: string | undefined
): string => {
  if (!baseURL.startsWith('/') || baseURL.startsWith('//')) {
    return baseURL;
  }
  if (origin === undefined) {
    throw new Error(`Relative auth base URL "${baseURL}" needs a page origin`);
  }
  return origin;
};

export const createEduvaultAuthClient = (baseURL: string) =>
  createAuthClient({
    baseURL: resolveAuthBaseUrl(
      baseURL,
      (globalThis.location as Location | undefined)?.origin
    ),
    plugins: [
      organizationClient({ teams: { enabled: true } }),
      usernameClient(),
    ],
  });

export type EduvaultAuthClient = ReturnType<typeof createEduvaultAuthClient>;

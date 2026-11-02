import { organizationClient, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Better Auth only appends /api/auth when the URL has no path, so a path-prefixed
// API URL (the web apps behind a same-origin proxy) needs it spelled out.
export const authBaseUrl = (apiUrl: string): string => {
  let end = apiUrl.length;
  while (end > 0 && apiUrl[end - 1] === '/') {
    end -= 1;
  }
  return `${apiUrl.slice(0, end)}/api/auth`;
};

export const createEduvaultAuthClient = (apiUrl: string) =>
  createAuthClient({
    baseURL: authBaseUrl(apiUrl),
    plugins: [
      organizationClient({ teams: { enabled: true } }),
      usernameClient(),
    ],
  });

export type EduvaultAuthClient = ReturnType<typeof createEduvaultAuthClient>;

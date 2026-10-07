import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const createEduvaultAuthClient = (baseURL: string) =>
  createAuthClient({
    baseURL,
    plugins: [organizationClient({ teams: { enabled: true } })],
  });

export type EduvaultAuthClient = ReturnType<typeof createEduvaultAuthClient>;

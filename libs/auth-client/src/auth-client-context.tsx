import { createContext, useContext, type ReactNode } from 'react';
import type { EduvaultAuthClient } from './auth-client';

const AuthClientContext = createContext<EduvaultAuthClient | null>(null);

export const AuthClientProvider = ({
  authClient,
  children,
}: {
  authClient: EduvaultAuthClient;
  children: ReactNode;
}) => (
  <AuthClientContext.Provider value={authClient}>
    {children}
  </AuthClientContext.Provider>
);

export function useAuthClient(): EduvaultAuthClient {
  const authClient = useContext(AuthClientContext);
  if (authClient === null) {
    throw new Error('useAuthClient needs an AuthClientProvider');
  }
  return authClient;
}

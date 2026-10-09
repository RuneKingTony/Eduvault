import type { ReactNode } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  type ApiClient,
  type AppContract,
} from '@eduvault/api-contract';
import type { EduvaultAuthClient } from './auth-client';
import type { AuthVariant } from './auth-card';
import { EntryGate } from './entry-gate';

export const ME_KEY = ['me'] as const;

type MeApi = Pick<ApiClient<AppContract>, 'me'>;

export const meQueryOptions = (api: MeApi) =>
  queryOptions({
    queryKey: ME_KEY,
    queryFn: () => api.me.get({}),
    staleTime: 60_000,
  });

export function MeGate({
  authClient,
  api,
  variant,
  platform,
  children,
}: {
  authClient: EduvaultAuthClient;
  api: MeApi;
  variant: AuthVariant;
  platform?: boolean;
  children: ReactNode;
}) {
  const session = authClient.useSession();
  const queryClient = useQueryClient();
  const me = useQuery({
    ...meQueryOptions(api),
    enabled: Boolean(session.data),
  });

  return (
    <EntryGate
      authClient={authClient}
      variant={variant}
      platform={platform}
      me={me}
      onSetPassword={async (newPassword) => {
        try {
          await api.me.setPassword({ body: { newPassword } });
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 409)) {
            throw error;
          }
        }
        await queryClient.invalidateQueries({ queryKey: ME_KEY });
      }}
      onSignedOut={() => {
        queryClient.clear();
      }}
    >
      {children}
    </EntryGate>
  );
}

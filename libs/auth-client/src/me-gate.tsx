import type { ReactNode } from 'react';
import {
  MutationCache,
  QueryCache,
  type Query,
  QueryClient,
  type QueryKey,
  queryOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ApiError,
  type ApiClient,
  type AppContract,
} from '@eduvault/api-contract';
import type { EduvaultAuthClient } from './auth-client';
import type { AuthVariant } from './auth-card';
import { EntryGate } from './entry-gate';

export const ME_KEY = ['me'] as const;
export const ME_PERMISSIONS_KEY = ['me', 'permissions'] as const;

type MeApi = Pick<ApiClient<AppContract>, 'me'>;

/** Exact, or the refetched permissions would be refused again and loop. */
export function refreshMeOnSuspension(client: QueryClient, error: Error) {
  if (error instanceof ApiError && error.body.code === 'SchoolSuspended') {
    void client.invalidateQueries({ queryKey: ME_KEY, exact: true });
  }
}

type FailedQuery = Query<unknown, unknown, unknown>;

/** A 403 may mean the access changed; the access query itself is left alone or it would loop. */
function refreshPermissionsOnDenial(
  client: QueryClient,
  error: Error,
  query?: FailedQuery
) {
  if (
    error instanceof ApiError &&
    error.status === 403 &&
    query?.queryKey[0] !== ME_PERMISSIONS_KEY[0]
  ) {
    void client.invalidateQueries(
      { queryKey: ME_PERMISSIONS_KEY },
      { cancelRefetch: false }
    );
  }
}

export function createEduvaultQueryClient(): QueryClient {
  const holder: { client?: QueryClient } = {};
  const handle = (error: Error, query?: FailedQuery) => {
    if (holder.client === undefined) {
      return;
    }
    refreshMeOnSuspension(holder.client, error);
    refreshPermissionsOnDenial(holder.client, error, query);
  };
  holder.client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    queryCache: new QueryCache({
      onError: (error, query) => handle(error, query),
    }),
    mutationCache: new MutationCache({ onError: (error) => handle(error) }),
  });
  return holder.client;
}

export const permissionsQueryOptions = (
  api: MeApi,
  queryKey: QueryKey = ME_PERMISSIONS_KEY
) =>
  queryOptions({
    queryKey,
    queryFn: () => api.me.permissions({}),
    staleTime: 60_000,
    refetchOnWindowFocus: 'always',
  });

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
      onSchoolSwitched={() => {
        queryClient.removeQueries();
      }}
    >
      {children}
    </EntryGate>
  );
}

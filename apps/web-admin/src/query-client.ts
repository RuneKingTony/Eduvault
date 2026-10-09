import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@eduvault/api-contract';
import { ME_PERMISSIONS_KEY } from './queries';

const isRefusal = (error: Error) =>
  error instanceof ApiError && error.status === 403;

/** A 403 means the cached access is out of date, so ask for it again. */
export function createQueryClient(): QueryClient {
  // The caches are built before the client they report to.
  const holder: { client?: QueryClient } = {};
  const refreshAccess = () => {
    void holder.client?.invalidateQueries({ queryKey: ME_PERMISSIONS_KEY });
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // The access query refused is not a reason to ask for it again.
        if (isRefusal(error) && query.queryKey[0] !== ME_PERMISSIONS_KEY[0]) {
          refreshAccess();
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isRefusal(error)) {
          refreshAccess();
        }
      },
    }),
  });
  holder.client = client;
  return client;
}

export const queryClient = createQueryClient();

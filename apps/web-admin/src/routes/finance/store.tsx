import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../../access';
import { StorePage } from '../../pages/store-page';
import {
  storeDeliveriesQueryOptions,
  storeItemsQueryOptions,
  storeSummaryQueryOptions,
} from '../../queries';
import { parseStoreSearch } from '../../store-search';

export const Route = createFileRoute('/finance/store')({
  validateSearch: parseStoreSearch,
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/finance/store');
  },
  loaderDeps: ({ search }) => ({ campus: search.campus }),
  loader: async ({ context: { queryClient, api }, deps }) => {
    await Promise.all([
      queryClient.query({
        ...storeSummaryQueryOptions(api, deps.campus),
        staleTime: 'static',
      }),
      queryClient.query({
        ...storeItemsQueryOptions(api, { campusId: deps.campus }),
        staleTime: 'static',
      }),
      queryClient.query({
        ...storeDeliveriesQueryOptions(api, { campusId: deps.campus }),
        staleTime: 'static',
      }),
    ]);
  },
  component: StoreRoute,
});

function StoreRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <StorePage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}

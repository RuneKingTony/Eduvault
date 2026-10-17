import { createFileRoute } from '@tanstack/react-router';
import { PurchasesPage } from '../pages/purchases-page';
import {
  portalPriceListQueryOptions,
  portalPurchasesQueryOptions,
  prefetchStatic,
} from '../queries';
import { redirectHomeWithout } from '../redirect-to';
import { selectChild } from '../selected-child';

export const Route = createFileRoute('/purchases')({
  beforeLoad: ({ context: { access, portal }, search }) => {
    if (portal !== null) {
      redirectHomeWithout(access.permissions, 'invoice:readOwn', search.child);
    }
  },
  loaderDeps: ({ search }) => ({ child: search.child }),
  loader: async ({ context: { queryClient, api, portal }, deps }) => {
    const selected =
      portal === null ? undefined : selectChild(portal.children, deps.child);
    if (selected === undefined) {
      return;
    }
    await Promise.all([
      prefetchStatic(
        queryClient,
        portalPurchasesQueryOptions(api, selected.id)
      ),
      prefetchStatic(
        queryClient,
        portalPriceListQueryOptions(api, selected.id)
      ),
    ]);
  },
  component: PurchasesRoute,
});

function PurchasesRoute() {
  const { portal } = Route.useRouteContext();
  const { child } = Route.useSearch();
  if (portal === null) {
    return null;
  }
  return <PurchasesPage me={portal} childId={child} />;
}

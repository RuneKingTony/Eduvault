import { createFileRoute } from '@tanstack/react-router';
import { FeesPage } from '../pages/fees-page';
import {
  calendarCurrentQueryOptions,
  portalStatementQueryOptions,
  prefetchStatic,
} from '../queries';
import { redirectHomeWithout } from '../redirect-to';
import { selectChild } from '../selected-child';

export const Route = createFileRoute('/fees')({
  beforeLoad: ({ context: { access }, search }) => {
    redirectHomeWithout(access.permissions, 'invoice:readOwn', search.child);
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
        portalStatementQueryOptions(api, selected.id, undefined)
      ),
      prefetchStatic(queryClient, calendarCurrentQueryOptions(api)),
    ]);
  },
  component: FeesRoute,
});

function FeesRoute() {
  const { portal } = Route.useRouteContext();
  const { child } = Route.useSearch();
  if (portal === null) {
    return null;
  }
  return <FeesPage me={portal} childId={child} />;
}

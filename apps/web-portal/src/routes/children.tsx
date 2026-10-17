import { createFileRoute } from '@tanstack/react-router';
import { ChildrenPage } from '../pages/children-page';
import { portalChildrenQueryOptions, prefetchStatic } from '../queries';
import { redirectFromLanding } from '../redirect-to';

export const Route = createFileRoute('/children')({
  beforeLoad: ({ context: { portal }, search }) => {
    redirectFromLanding(portal, '/children', search.child);
  },
  loader: async ({ context: { queryClient, api, portal } }) => {
    if (portal !== null) {
      await prefetchStatic(queryClient, portalChildrenQueryOptions(api));
    }
  },
  component: ChildrenRoute,
});

function ChildrenRoute() {
  const { portal } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  if (portal === null) {
    return null;
  }
  return (
    <ChildrenPage
      me={portal}
      onOpenChild={(child) => {
        void navigate({ to: '/', search: { child } });
      }}
      onSeeFees={(child) => {
        void navigate({ to: '/fees', search: { child } });
      }}
    />
  );
}

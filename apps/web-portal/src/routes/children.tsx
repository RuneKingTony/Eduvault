import { createFileRoute } from '@tanstack/react-router';
import { ChildrenPage } from '../pages/children-page';
import { portalChildrenQueryOptions, prefetchStatic } from '../queries';
import { redirectFromLanding } from '../redirect-to';
import { termSearchOf } from '../term-search';

export const Route = createFileRoute('/children')({
  beforeLoad: ({ context: { portal }, search }) => {
    redirectFromLanding(portal, '/children', search.child);
  },
  validateSearch: termSearchOf,
  loader: async ({ context: { queryClient, api, portal } }) => {
    if (portal !== null) {
      await prefetchStatic(queryClient, portalChildrenQueryOptions(api));
    }
  },
  component: ChildrenRoute,
});

function ChildrenRoute() {
  const { portal } = Route.useRouteContext();
  const { term } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (portal === null) {
    return null;
  }
  return (
    <ChildrenPage
      me={portal}
      term={term}
      onTerm={(next) => {
        void navigate({
          search: (previous) => ({ ...previous, term: next }),
          replace: true,
        });
      }}
      onOpenChild={(child) => {
        void navigate({ to: '/', search: { child } });
      }}
      onSeeFees={(child) => {
        void navigate({ to: '/fees', search: { child } });
      }}
    />
  );
}

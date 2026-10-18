import { createFileRoute } from '@tanstack/react-router';
import { textOf } from '@eduvault/shared';
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
  validateSearch: (search: Record<string, unknown>) => {
    const term = textOf(search['term']);
    return term === undefined ? {} : { term };
  },
  loaderDeps: ({ search }) => ({ child: search.child, term: search.term }),
  loader: async ({ context: { queryClient, api, portal }, deps }) => {
    const selected =
      portal === null ? undefined : selectChild(portal.children, deps.child);
    if (selected === undefined) {
      return;
    }
    await Promise.all([
      prefetchStatic(
        queryClient,
        portalStatementQueryOptions(api, selected.id, { termId: deps.term })
      ),
      prefetchStatic(queryClient, calendarCurrentQueryOptions(api)),
    ]);
  },
  component: FeesRoute,
});

function FeesRoute() {
  const { portal } = Route.useRouteContext();
  const { child, term } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (portal === null) {
    return null;
  }
  return (
    <FeesPage
      me={portal}
      childId={child}
      term={term}
      onTerm={(next) => {
        void navigate({
          search: (previous) => ({ ...previous, term: next }),
          replace: true,
        });
      }}
    />
  );
}

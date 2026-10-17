import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '../pages/home-page';
import {
  calendarCurrentQueryOptions,
  daysOffQueryOptions,
  portalAnnouncementsQueryOptions,
  portalStudentQueryOptions,
  prefetchStatic,
} from '../queries';
import { redirectFromLanding } from '../redirect-to';
import { selectChild } from '../selected-child';

export const Route = createFileRoute('/')({
  beforeLoad: ({ context: { portal }, search }) => {
    redirectFromLanding(portal, '/', search.child);
  },
  loaderDeps: ({ search }) => ({ child: search.child }),
  loader: async ({ context: { queryClient, api, portal }, deps }) => {
    const selected =
      portal === null ? undefined : selectChild(portal.children, deps.child);
    if (selected === undefined) {
      return;
    }
    await Promise.all([
      prefetchStatic(queryClient, portalStudentQueryOptions(api, selected.id)),
      prefetchStatic(
        queryClient,
        portalAnnouncementsQueryOptions(api, selected.id)
      ),
      prefetchStatic(queryClient, calendarCurrentQueryOptions(api)),
      prefetchStatic(queryClient, daysOffQueryOptions(api)),
    ]);
  },
  component: HomeRoute,
});

function HomeRoute() {
  const { portal } = Route.useRouteContext();
  const { child } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (portal === null) {
    return null;
  }
  return (
    <HomePage
      me={portal}
      childId={child}
      onChildMissing={(first) => {
        void navigate({ search: { child: first }, replace: true });
      }}
      onSeeAllAnnouncements={(id) => {
        void navigate({ to: '/announcements', search: { child: id } });
      }}
      onSeeFees={(id) => {
        void navigate({ to: '/fees', search: { child: id } });
      }}
    />
  );
}

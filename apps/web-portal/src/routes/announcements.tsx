import { createFileRoute } from '@tanstack/react-router';
import { AnnouncementsPage } from '../pages/announcements-page';

export const Route = createFileRoute('/announcements')({
  component: AnnouncementsRoute,
});

function AnnouncementsRoute() {
  const { portal } = Route.useRouteContext();
  const { child } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (portal === null) {
    return null;
  }
  return (
    <AnnouncementsPage
      me={portal}
      childId={child}
      onBack={(id) => {
        void navigate({ to: '/', search: { child: id } });
      }}
    />
  );
}

import { Navigate, createFileRoute, useRouter } from '@tanstack/react-router';
import { usePermissions } from '@eduvault/auth-client';
import { settingsLanding } from '../nav';
import { SettingsIndexPage } from '../pages/settings-index-page';

export const Route = createFileRoute('/settings/')({
  component: SettingsIndexRoute,
});

function SettingsIndexRoute() {
  const router = useRouter();
  const navigate = Route.useNavigate();
  const { permissions } = usePermissions();
  const landing = settingsLanding(
    new Set(Object.keys(router.routesByPath)),
    permissions
  );
  if (landing.kind === 'redirect') {
    return <Navigate to={landing.to} replace />;
  }
  return (
    <SettingsIndexPage
      items={landing.items}
      onOpen={(route) => {
        void navigate({ to: route });
      }}
    />
  );
}

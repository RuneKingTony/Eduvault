import { Outlet, createFileRoute } from '@tanstack/react-router';
import { SettingsLayout } from '../components/settings-nav';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  );
}

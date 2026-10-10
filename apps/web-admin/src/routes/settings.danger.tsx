import { createFileRoute } from '@tanstack/react-router';
import { DangerZonePage } from '../pages/danger-zone-page';

export const Route = createFileRoute('/settings/danger')({
  component: DangerZoneRoute,
});

function DangerZoneRoute() {
  const navigate = Route.useNavigate();
  const goToDashboard = () => {
    void navigate({ to: '/' });
  };
  return (
    <DangerZonePage onHandedOver={goToDashboard} onDeleted={goToDashboard} />
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { SettingsLayout } from '../components/settings-nav';
import { CampusesPage } from '../pages/campuses-page';
import { campusSummaryQueryOptions } from '../queries';

export const Route = createFileRoute('/campuses')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/campuses');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...campusSummaryQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: CampusesRoute,
});

function CampusesRoute() {
  return (
    <SettingsLayout>
      <CampusesPage />
    </SettingsLayout>
  );
}

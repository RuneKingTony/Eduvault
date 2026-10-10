import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { AdmissionsPage } from '../pages/admissions-page';
import { schoolSettingsQueryOptions } from '../queries';

export const Route = createFileRoute('/settings/admissions')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/settings/admissions');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...schoolSettingsQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: AdmissionsPage,
});

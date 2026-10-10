import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { SettingsLayout } from '../components/settings-nav';
import { RolesPage } from '../pages/roles-page';
import { rolesQueryOptions } from '../queries';

export const Route = createFileRoute('/roles')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/roles');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...rolesQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: RolesRoute,
});

function RolesRoute() {
  const navigate = Route.useNavigate();
  return (
    <SettingsLayout>
      <RolesPage
        onNewRole={() => {
          void navigate({ to: '/roles/new' });
        }}
        onOpenRole={(roleSlug) => {
          void navigate({ to: '/roles/$roleSlug', params: { roleSlug } });
        }}
      />
    </SettingsLayout>
  );
}

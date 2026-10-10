import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { RolePageRoute } from '../components/role-page-route';
import { rolesQueryOptions } from '../queries';

export const Route = createFileRoute('/roles_/new')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/roles/new');
  },
  loader: async ({ context: { queryClient, api } }) => {
    await queryClient.query({
      ...rolesQueryOptions(api),
      staleTime: 'static',
    });
  },
  component: NewRoleRoute,
});

function NewRoleRoute() {
  return <RolePageRoute slug={undefined} />;
}

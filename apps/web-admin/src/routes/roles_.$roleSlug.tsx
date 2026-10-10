import { createFileRoute } from '@tanstack/react-router';
import { requireGate } from '../access';
import { RolePageRoute } from '../components/role-page-route';
import { roleQueryOptions, rolesQueryOptions } from '../queries';

export const Route = createFileRoute('/roles_/$roleSlug')({
  beforeLoad: ({ context }) => {
    requireGate(context.access, '/roles');
  },
  loader: async ({ context: { queryClient, api }, params: { roleSlug } }) => {
    await Promise.all([
      queryClient
        .query({ ...roleQueryOptions(api, roleSlug), staleTime: 'static' })
        .catch(() => undefined),
      queryClient.query({ ...rolesQueryOptions(api), staleTime: 'static' }),
    ]);
  },
  component: RoleRoute,
});

function RoleRoute() {
  const { roleSlug } = Route.useParams();
  return <RolePageRoute slug={roleSlug} />;
}

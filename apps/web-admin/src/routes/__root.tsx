import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';
import type { Api } from '../api';
import { AppShell } from '../components/app-shell';
import { mePermissionsQueryOptions } from '../queries';

interface RouterContext {
  queryClient: QueryClient;
  api: Api;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context: { queryClient, api } }) => ({
    access: await queryClient.query(mePermissionsQueryOptions(api)),
  }),
  component: AppShell,
});

import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';
import type { Api } from '../api';
import { PortalShell } from '../components/portal-shell';

interface RouterContext {
  queryClient: QueryClient;
  api: Api;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: PortalShell,
});

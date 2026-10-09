import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';
import type { Api } from '../api';
import { AppShell } from '../components/app-shell';

interface RouterContext {
  queryClient: QueryClient;
  api: Api;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
});

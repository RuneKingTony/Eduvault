import type { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createRootRouteWithContext,
  useRouteContext,
} from '@tanstack/react-router';
import { meQueryOptions } from '@eduvault/auth-client';
import type { Api } from '../api';
import { AppShell } from '../components/app-shell';
import { mePermissionsQueryOptions } from '../queries';
import { redirectTo } from '../redirect-to';

interface RouterContext {
  queryClient: QueryClient;
  api: Api;
}

const isPlatformPath = (pathname: string) =>
  pathname === '/platform' || pathname.startsWith('/platform/');

function RootLayout() {
  const { access } = useRouteContext({ from: '__root__' });
  return access === null ? <Outlet /> : <AppShell />;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context: { queryClient, api }, location }) => {
    const me = await queryClient.query(meQueryOptions(api));
    if (me.platformRole === null) {
      return {
        me,
        access: await queryClient.query(mePermissionsQueryOptions(api)),
      };
    }
    if (!isPlatformPath(location.pathname)) {
      redirectTo('/platform/schools');
    }
    return { me, access: null };
  },
  component: RootLayout,
});

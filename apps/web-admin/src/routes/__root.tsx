import type { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createRootRouteWithContext,
  useRouteContext,
} from '@tanstack/react-router';
import { ApiError } from '@eduvault/api-contract';
import { meQueryOptions } from '@eduvault/auth-client';
import { clearActing, getActing, type ActingState } from '../acting-store';
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

async function actingAccess(
  { queryClient, api }: RouterContext,
  acting: ActingState
) {
  try {
    return await queryClient.query(mePermissionsQueryOptions(api, acting));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      clearActing();
      queryClient.removeQueries();
      redirectTo('/platform/schools');
    }
    throw error;
  }
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context, location }) => {
    const { queryClient, api } = context;
    const me = await queryClient.query(meQueryOptions(api));
    if (me.platformRole === null) {
      return {
        me,
        access: await queryClient.query(mePermissionsQueryOptions(api)),
      };
    }
    if (isPlatformPath(location.pathname)) {
      return { me, access: null };
    }
    const acting = getActing();
    if (acting === null) {
      redirectTo('/platform/schools');
    }
    return { me, access: await actingAccess(context, acting) };
  },
  component: RootLayout,
});

import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  useRouteContext,
} from '@tanstack/react-router';
import {
  PermissionsProvider,
  permissionsQueryOptions,
} from '@eduvault/auth-client';
import type { Api } from '../api';
import { PortalShell } from '../components/portal-shell';
import { StaffScreen } from '../components/staff-screen';
import { isPortalUser } from '../portal-access';
import { portalMeQueryOptions } from '../queries';
import { childParam } from '../selected-child';

interface RouterContext {
  queryClient: QueryClient;
  api: Api;
}

function RootLayout() {
  const { access, portal } = useRouteContext({ from: '__root__' });
  if (portal === null) {
    return <StaffScreen />;
  }
  return (
    <PermissionsProvider value={access}>
      <PortalShell me={portal} access={access} />
    </PermissionsProvider>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: (search: Record<string, unknown>) => {
    const child = childParam(search['child']);
    return child === undefined ? {} : { child };
  },
  beforeLoad: async ({ context: { queryClient, api } }) => {
    const access = await queryClient.query(permissionsQueryOptions(api));
    if (!isPortalUser(access)) {
      return { access, portal: null };
    }
    return {
      access,
      portal: await queryClient.query(portalMeQueryOptions(api)),
    };
  },
  component: RootLayout,
});

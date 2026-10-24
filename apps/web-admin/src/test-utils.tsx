import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type {
  AuditRow,
  MePermissions,
  PlatformSchool,
} from '@eduvault/api-contract';
import { PermissionsProvider } from '@eduvault/auth-client';
import { accessOfStarter, fakeAccess } from '@eduvault/auth-client/testing';
import { ALL_PERMISSIONS, READ_PERMS, toPermissionMap } from '@eduvault/policy';
import { TooltipProvider } from '@eduvault/ui';
import { ApiProvider, type Api } from './api';
import { feeSetupQueryOptions } from './queries';
import { checked, checkedExcept } from './test-api';

export const platformSchool = (
  overrides: Partial<PlatformSchool> = {}
): PlatformSchool => ({
  id: 's1',
  name: 'Greenfield College',
  slug: 'greenfield',
  admissionPrefix: 'GF',
  city: 'Lagos',
  owners: [{ id: 'o1', name: 'Funmi Adeyemi', email: 'funmi@greenfield.test' }],
  students: 28,
  campuses: 2,
  status: 'active',
  createdAt: '2026-08-12T10:00:00.000Z',
  ...overrides,
});

export const auditRow = (overrides: Partial<AuditRow> = {}): AuditRow => ({
  id: 'a1',
  kind: 'acting',
  actor: { id: 'u1', name: 'Jude' },
  school: { id: 's1', name: 'Greenfield College' },
  method: 'GET',
  action: null,
  path: '/students',
  status: 200,
  reason: null,
  createdAt: '2026-10-07T09:05:00.000Z',
  ...overrides,
});

export const schoolList = (
  items: PlatformSchool[],
  overrides: Partial<{
    totals: {
      schools: number;
      active: number;
      students: number;
      actingRequests: number;
    };
    nextCursor: string | null;
  }> = {}
) => ({
  items,
  totals: {
    schools: items.length,
    active: items.filter((school) => school.status === 'active').length,
    students: items.reduce((total, school) => total + school.students, 0),
    actingRequests: 0,
  },
  nextCursor: null,
  ...overrides,
});

export const ownerAccess = (): MePermissions =>
  fakeAccess({
    roles: ['owner'],
    permissions: toPermissionMap(ALL_PERMISSIONS),
    campusScope: 'all',
  });

export const actingAccess = (writes: boolean): MePermissions =>
  fakeAccess({
    roles: [],
    permissions: toPermissionMap(writes ? ALL_PERMISSIONS : READ_PERMS),
    campusScope: 'all',
    acting: { organizationId: 'org-1', writes },
  });

export const starterAccess = (slug: string): MePermissions =>
  accessOfStarter(slug, slug === 'administrator' ? 'all' : ['c1']);

function mount(ui: ReactElement, api: Api, access: MePermissions) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <ApiProvider api={api}>
          <PermissionsProvider value={access}>
            <TooltipProvider>{ui}</TooltipProvider>
          </PermissionsProvider>
        </ApiProvider>
      </QueryClientProvider>
    ),
    queryClient,
  };
}

export function renderWithApi(
  ui: ReactElement,
  api: Partial<Record<keyof Api, unknown>>,
  access: MePermissions = ownerAccess()
) {
  return mount(ui, checked(api), access);
}

export function renderWithRefusal(
  ui: ReactElement,
  fakes: {
    api: Partial<Record<keyof Api, unknown>>;
    raw: Partial<Record<keyof Api, Record<string, unknown>>>;
  },
  access: MePermissions = ownerAccess()
) {
  return mount(ui, checkedExcept(fakes.api, fakes.raw), access);
}

export { fakeAccess } from '@eduvault/auth-client/testing';

export function seedFeeSetup(queryClient: QueryClient) {
  const key = feeSetupQueryOptions({} as Api).queryKey;
  const setup = { terms: [], levels: [] };
  queryClient.setQueryData(key, setup);
  return { key, setup };
}

type RouteTable = readonly (readonly [
  string,
  ((search: Record<string, unknown>) => object) | undefined,
])[];

export function renderRoutes(
  page: ReactElement,
  api: Partial<Record<keyof Api, unknown>>,
  setup: { routes: RouteTable; access: MePermissions; path: string }
) {
  const { routes, access, path } = setup;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ApiProvider api={checked(api)}>
          <PermissionsProvider value={access}>
            <TooltipProvider>{page}</TooltipProvider>
          </PermissionsProvider>
        </ApiProvider>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren(
      routes.map(([routePath, validateSearch]) =>
        createRoute({
          getParentRoute: () => root,
          path: routePath,
          validateSearch,
        })
      )
    ),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return { router, queryClient };
}

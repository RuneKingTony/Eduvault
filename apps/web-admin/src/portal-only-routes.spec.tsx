import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import type { Me, MePermissions } from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import { stubMatchMedia } from '@eduvault/ui/testing';
import { ApiProvider, type Api } from './api';
import { NotFoundPage } from './components/page-fallbacks';
import { routeTree } from './routeTree.gen';
import { fakeAccess, ownerAccess } from './test-utils';

const authClient = {
  useSession: () => ({
    data: {
      session: { activeOrganizationId: 'o1' },
      user: { name: 'Ngozi Okeke', email: 'n@mail.test', image: null },
    },
  }),
  useListOrganizations: () => ({
    data: [{ id: 'o1', name: 'Greenfield College' }],
  }),
  useActiveMember: () => ({ data: { role: 'member' } }),
  signOut: vi.fn(),
} as unknown as EduvaultAuthClient;

const me: Me = {
  user: { id: 'u1', email: 'n@mail.test', name: 'Ngozi Okeke' },
  activeOrganizationId: 'o1',
  activeCampusId: null,
  mustChangePassword: false,
  platformRole: null,
  schoolCount: 1,
  suspendedSchool: null,
};

const held = (roles: string[], permissions: Permission[]): MePermissions =>
  fakeAccess({ roles, permissions: toPermissionMap(permissions) });

function renderAt(path: string, access: MePermissions) {
  const api = {
    me: {
      get: vi.fn().mockResolvedValue(me),
      permissions: vi.fn().mockResolvedValue(access),
    },
    students: { list: vi.fn() },
    campuses: { list: vi.fn() },
  } as unknown as Api;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient, api },
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultNotFoundComponent: NotFoundPage,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <AuthClientProvider authClient={authClient}>
          <RouterProvider router={router} />
        </AuthClientProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}

describe('a portal-only account on web-admin', () => {
  beforeEach(() => {
    stubMatchMedia({ '(max-width: 820px)': false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['guardian', 'student'])(
    'shows a %s the portal screen instead of the staff shell',
    async (role) => {
      renderAt('/', held([role], ['student:readOwn']));
      expect(
        await screen.findByText('Students and guardians use the portal.')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Go to web-portal' })
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    }
  );

  it('shows the screen on a deep link too', async () => {
    renderAt('/students', held(['guardian'], ['student:readOwn']));
    expect(
      await screen.findByText('Students and guardians use the portal.')
    ).toBeInTheDocument();
  });

  it('keeps the staff shell for an owner', async () => {
    renderAt('/', ownerAccess());
    expect(await screen.findAllByRole('navigation')).not.toHaveLength(0);
    expect(
      screen.queryByText('Students and guardians use the portal.')
    ).not.toBeInTheDocument();
  });

  it('keeps the staff shell for a staff member who is also a guardian', async () => {
    renderAt(
      '/',
      held(
        ['member', 'guardian', 'administrator'],
        ['student:readOwn', 'student:read']
      )
    );
    expect(await screen.findAllByRole('navigation')).not.toHaveLength(0);
    expect(
      screen.queryByText('Students and guardians use the portal.')
    ).not.toBeInTheDocument();
  });
});

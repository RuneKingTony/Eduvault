import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import type { Me, PlatformSchool } from '@eduvault/api-contract';
import { stubMatchMedia } from '@eduvault/ui/testing';
import { ApiProvider, type Api } from './api';
import { NotFoundPage } from './components/page-fallbacks';
import { routeTree } from './routeTree.gen';
import { ownerAccess } from './test-utils';

const authClient = {
  useSession: () => ({
    data: {
      session: { activeOrganizationId: 'o1' },
      user: { name: 'Jude', email: 'jude@eduvault.test', image: null },
    },
  }),
  useListOrganizations: () => ({ data: [{ id: 'o1', name: 'Greenfield' }] }),
  useActiveMember: () => ({ data: { role: 'owner' } }),
  organization: { setActive: vi.fn() },
  signOut: vi.fn(),
} as unknown as EduvaultAuthClient;

const me = (overrides: Partial<Me> = {}): Me => ({
  user: { id: 'u1', email: 'jude@eduvault.test', name: 'Jude' },
  activeOrganizationId: null,
  activeCampusId: null,
  mustChangePassword: false,
  platformRole: 'superadmin',
  schoolCount: 0,
  ...overrides,
});

const school: PlatformSchool = {
  id: 's1',
  name: 'Greenfield College',
  slug: 'greenfield',
  admissionPrefix: 'GF',
  city: 'Lagos',
  owners: [{ id: 'o1', name: 'Funmi Adeyemi', email: 'funmi@greenfield.test' }],
  createdAt: '2026-08-12T10:00:00.000Z',
};

async function renderAt(path: string, answer: Me) {
  const permissions = vi.fn().mockResolvedValue(ownerAccess());
  const api = {
    me: { get: vi.fn().mockResolvedValue(answer), permissions },
    platform: {
      schools: { list: vi.fn().mockResolvedValue({ items: [school] }) },
    },
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
  await waitFor(() => {
    expect(router.state.status).toBe('idle');
    expect(router.state.matches.length).toBeGreaterThan(0);
  });
  return { router, permissions };
}

describe('platform console', () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia({ '(max-width: 820px)': false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a super admin on the schools list under the platform head', async () => {
    const { router, permissions } = await renderAt('/', me());
    await screen.findByRole('heading', { name: 'Schools' });

    expect(router.state.location.pathname).toBe('/platform/schools');
    expect(screen.getByText('Eduvault platform')).toBeInTheDocument();
    expect(screen.getByText('Super admin console')).toBeInTheDocument();
    const nav = document.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
    expect(within(nav).getByText('Platform')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Schools' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByText('Greenfield College')).toBeInTheDocument();
    expect(permissions).not.toHaveBeenCalled();
  });

  it('keeps a super admin inside /platform', async () => {
    const { router } = await renderAt('/campuses', me());
    await screen.findByRole('heading', { name: 'Schools' });
    expect(router.state.location.pathname).toBe('/platform/schools');
  });

  it('sends anyone without the platform role from /platform to /', async () => {
    const { router, permissions } = await renderAt(
      '/platform/schools',
      me({ platformRole: null, schoolCount: 1, activeOrganizationId: 'o1' })
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(permissions).toHaveBeenCalled();
    expect(screen.queryByText('Super admin console')).not.toBeInTheDocument();
  });
});

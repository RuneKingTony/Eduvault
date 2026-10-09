import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { ApiError, type MePermissions, type Me } from '@eduvault/api-contract';
import { notify } from '@eduvault/ui';
import { stubMatchMedia } from '@eduvault/ui/testing';
import { ALL_PERMISSIONS, READ_PERMS, toPermissionMap } from '@eduvault/policy';
import { clearActing, getActing, startActing } from './acting-store';
import { ApiProvider, type Api } from './api';
import { NotFoundPage } from './components/page-fallbacks';
import { routeTree } from './routeTree.gen';
import {
  auditRow,
  fakeAccess,
  ownerAccess,
  platformSchool,
  schoolList,
} from './test-utils';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  notify: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

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
  suspendedSchool: null,
  ...overrides,
});

const school = platformSchool();

/** What the API answers for the acted school: read-only until a reason is sent. */
const actingAccess = (): MePermissions => {
  const acting = getActing();
  const writes = acting?.reason !== null && acting?.reason !== undefined;
  return fakeAccess({
    organizationId: acting?.organizationId ?? 's1',
    roles: [],
    permissions: toPermissionMap(writes ? ALL_PERMISSIONS : READ_PERMS),
    campusScope: 'all',
    acting: { organizationId: acting?.organizationId ?? 's1', writes },
  });
};

async function renderAt(path: string, answer: Me) {
  const permissions = vi.fn().mockImplementation(() => {
    const acting = getActing();
    return Promise.resolve(acting === null ? ownerAccess() : actingAccess());
  });
  const api = {
    me: { get: vi.fn().mockResolvedValue(answer), permissions },
    platform: {
      schools: {
        list: vi.fn().mockResolvedValue(schoolList([school])),
        get: vi.fn().mockResolvedValue(school),
        options: vi
          .fn()
          .mockResolvedValue({ items: [{ id: school.id, name: school.name }] }),
      },
      audit: {
        list: vi
          .fn()
          .mockResolvedValue({ items: [auditRow()], nextCursor: null }),
      },
    },
    students: { list: vi.fn().mockResolvedValue([]) },
    campuses: { list: vi.fn().mockResolvedValue([]) },
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
  return { router, permissions, api };
}

describe('platform console', () => {
  beforeEach(() => {
    localStorage.clear();
    clearActing();
    vi.clearAllMocks();
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

  it('shows the school page with its owner, the acting card and recent requests', async () => {
    await renderAt('/platform/schools/s1', me());
    expect(
      await screen.findByRole('heading', { name: 'Greenfield College' })
    ).toBeInTheDocument();
    expect(screen.getByText('Lagos · created 12 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Acting in a school')).toBeInTheDocument();
    expect(await screen.findByText('/students')).toBeInTheDocument();
  });

  it('lists the audit log under the platform nav', async () => {
    await renderAt('/platform/audit', me());
    expect(
      await screen.findByRole('heading', { name: 'Audit log' })
    ).toBeInTheDocument();
    const nav = document.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
    expect(
      within(nav).getByRole('link', { name: 'Audit log' })
    ).toHaveAttribute('aria-current', 'page');
  });

  describe('acting', () => {
    it('opens the school shell for a super admin who is acting, with the banner and badge', async () => {
      startActing('s1', 'Greenfield College');
      const { router, permissions } = await renderAt('/students', me());
      expect(router.state.location.pathname).toBe('/students');
      expect(permissions).toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Acting in Greenfield College'
      );
      expect(screen.getByText('Acting · read-only')).toBeInTheDocument();
      expect(screen.queryByText('Super admin console')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add student' })
      ).not.toBeInTheDocument();
    });

    it('keeps the platform pages open for a super admin who is acting', async () => {
      startActing('s1', 'Greenfield College');
      const { router } = await renderAt('/platform/schools', me());
      expect(router.state.location.pathname).toBe('/platform/schools');
      expect(screen.getByText('Eduvault platform')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(getActing()).not.toBeNull();
    });

    it('ends acting and opens the console when the acted school is gone', async () => {
      startActing('s1', 'Greenfield College');
      const api = {
        me: {
          get: vi.fn().mockResolvedValue(me()),
          permissions: vi.fn().mockRejectedValue(
            new ApiError(404, {
              code: 'NotFound',
              message: 'School not found',
            })
          ),
        },
        platform: {
          schools: { list: vi.fn().mockResolvedValue(schoolList([school])) },
        },
      } as unknown as Api;
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const router = createRouter({
        routeTree,
        context: { queryClient, api },
        history: createMemoryHistory({ initialEntries: ['/'] }),
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
        expect(router.state.location.pathname).toBe('/platform/schools');
      });
      expect(getActing()).toBeNull();
    });

    it('starts acting from the school page: stores the school, warns and opens Dashboard', async () => {
      const { router } = await renderAt('/platform/schools/s1', me());
      fireEvent.click(
        await screen.findByRole('button', { name: 'Act in this school' })
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/');
      });
      expect(getActing()).toEqual({
        organizationId: 's1',
        schoolName: 'Greenfield College',
        reason: null,
      });
      expect(notify.warning).toHaveBeenCalledWith(
        'Acting in Greenfield College, read-only. Add a reason in the banner to allow writes.'
      );
      expect(await screen.findByText('Acting · read-only')).toBeInTheDocument();
    });

    it('allows writes with a reason, goes back to read-only and leaves for the school page', async () => {
      startActing('s1', 'Greenfield College');
      const { router, permissions } = await renderAt('/students', me());

      const allow = screen.getByRole('button', { name: 'Allow writes' });
      expect(allow).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Reason for writes'), {
        target: { value: 'SUP-2214' },
      });
      fireEvent.click(allow);

      expect(await screen.findByText('Acting · writes on')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Writes allowed. Reason SUP-2214'
      );
      expect(notify.success).toHaveBeenCalledWith(
        'Writes allowed. Each one is audited with your reason.'
      );
      expect(permissions.mock.calls.length).toBeGreaterThan(1);
      expect(
        await screen.findByRole('button', { name: 'Add student' })
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: 'Back to read-only' })
      );
      expect(await screen.findByText('Acting · read-only')).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'Add student' })
        ).not.toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Leave school' }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/platform/schools/s1');
      });
      expect(getActing()).toBeNull();
      expect(
        await screen.findByRole('heading', { name: 'Greenfield College' })
      ).toBeInTheDocument();
    });

    it('does not show My access in the user menu while acting', async () => {
      startActing('s1', 'Greenfield College');
      await renderAt('/', me());
      fireEvent.keyDown(screen.getByRole('button', { name: /Jude/ }), {
        key: 'Enter',
      });
      expect(
        await screen.findByRole('menuitem', { name: /Command menu/ })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('menuitem', { name: 'My access' })
      ).not.toBeInTheDocument();
      expect(screen.getAllByText('Greenfield College').length).toBeGreaterThan(
        0
      );
    });
  });
});

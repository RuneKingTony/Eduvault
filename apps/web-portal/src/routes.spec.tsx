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
import type { MePermissions } from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import { stubMatchMedia } from '@eduvault/ui/testing';
import { ApiProvider, type Api } from './api';
import { NotFoundPage } from './components/portal-fallbacks';
import { routeTree } from './routeTree.gen';
import {
  calendarCurrent,
  portalAnnouncementList,
  portalAnnouncements,
  portalChild,
  portalFamilyStatement,
  portalMe,
  portalStatement,
  portalPriceList,
  portalPurchases,
  portalStudent,
} from './test-utils';

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

const access = (roles: string[], permissions: Permission[]): MePermissions => ({
  organizationId: 'o1',
  roles,
  permissions: toPermissionMap(permissions),
  campusScope: [],
  classScope: [],
  acting: null,
});

const ada = portalChild({ id: 'ada', firstName: 'Ada' });
const tobi = portalChild({ id: 'tobi', firstName: 'Tobi' });

function fakeApi(
  held: MePermissions,
  me = portalMe({ children: [ada, tobi] })
) {
  return {
    me: { permissions: vi.fn().mockResolvedValue(held) },
    portal: {
      me: vi.fn().mockResolvedValue(me),
      children: vi.fn().mockResolvedValue(me.children),
      student: vi
        .fn()
        .mockResolvedValue(portalStudent({ id: 'ada', firstName: 'Ada' })),
      announcements: vi.fn().mockResolvedValue(portalAnnouncements()),
      announcementList: vi.fn().mockResolvedValue(portalAnnouncementList()),
      statement: vi.fn().mockResolvedValue(portalStatement()),
      familyStatement: vi.fn().mockResolvedValue(portalFamilyStatement()),
      purchases: vi.fn().mockResolvedValue(portalPurchases()),
      priceList: vi.fn().mockResolvedValue(portalPriceList()),
    },
    calendar: {
      current: vi.fn().mockResolvedValue(calendarCurrent()),
      daysOff: vi.fn().mockResolvedValue([]),
    },
  };
}

function renderAt(path: string, api: ReturnType<typeof fakeApi>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient, api: api as unknown as Api },
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultNotFoundComponent: NotFoundPage,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api as unknown as Api}>
        <AuthClientProvider authClient={authClient}>
          <RouterProvider router={router} />
        </AuthClientProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  return router;
}

describe('the portal routes', () => {
  beforeEach(() => {
    stubMatchMedia({ '(max-width: 820px)': false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a guardian on / with no child to My children', async () => {
    const router = renderAt(
      '/',
      fakeApi(access(['guardian'], ['student:readOwn']))
    );
    expect(
      await screen.findByRole('heading', { name: 'Hello, Ngozi' })
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/children');
  });

  it('keeps a guardian on Home when a child is chosen, and shows that child', async () => {
    const api = fakeApi(access(['guardian'], ['student:readOwn']));
    renderAt('/?child=ada', api);
    expect(
      await screen.findByRole('heading', { name: 'Ada Okeke' })
    ).toBeInTheDocument();
    expect(api.portal.student).toHaveBeenCalledWith({
      params: { studentId: 'ada' },
    });
  });

  it('falls back to the first child for an id that is not linked', async () => {
    const api = fakeApi(access(['guardian'], ['student:readOwn']));
    renderAt('/?child=another-family', api);
    await screen.findByRole('heading', { name: 'Ada Okeke' });
    expect(api.portal.student).not.toHaveBeenCalledWith({
      params: { studentId: 'another-family' },
    });
  });

  it('opens Home for a child from My children, carrying the child', async () => {
    const router = renderAt(
      '/children',
      fakeApi(access(['guardian'], ['student:readOwn']))
    );
    (await screen.findByRole('button', { name: /Tobi Okeke/ })).click();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(router.state.location.search).toEqual({ child: 'tobi' });
  });

  it('opens the full announcements list for the chosen child and goes back to Home', async () => {
    const api = fakeApi(access(['guardian'], ['student:readOwn']));
    const router = renderAt('/announcements?child=tobi', api);
    expect(
      await screen.findByRole('heading', { name: 'Announcements' })
    ).toBeInTheDocument();
    expect(api.portal.announcementList).toHaveBeenCalledWith({
      params: { studentId: 'tobi' },
      query: { page: 1, pageSize: 10 },
    });
    screen.getByRole('button', { name: 'Back to Home' }).click();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(router.state.location.search).toEqual({ child: 'tobi' });
  });

  it('opens Purchases for the chosen child, last in the nav, carrying the child', async () => {
    const api = fakeApi(
      access(['guardian'], ['student:readOwn', 'invoice:readOwn'])
    );
    const router = renderAt('/?child=tobi', api);
    await screen.findByRole('heading', { name: 'Ada Okeke' });
    const links = screen
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((text) => ['My children', 'Home', 'Purchases'].includes(text));
    expect(links.at(-1)).toBe('Purchases');

    screen.getAllByRole('link', { name: 'Purchases' })[0]?.click();

    expect(
      await screen.findByRole('heading', { name: 'Purchases' })
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/purchases');
    expect(router.state.location.search).toEqual({ child: 'tobi' });
    expect(api.portal.purchases).toHaveBeenCalledWith({
      params: { studentId: 'tobi' },
    });
    expect(api.portal.priceList).toHaveBeenCalledWith({
      params: { studentId: 'tobi' },
    });
  });

  it('falls back to the first child on Purchases for an id that is not linked', async () => {
    const api = fakeApi(
      access(['guardian'], ['student:readOwn', 'invoice:readOwn'])
    );
    renderAt('/purchases?child=another-family', api);
    await screen.findByRole('heading', { name: 'Purchases' });
    expect(api.portal.purchases).toHaveBeenCalledWith({
      params: { studentId: 'ada' },
    });
    expect(api.portal.purchases).not.toHaveBeenCalledWith({
      params: { studentId: 'another-family' },
    });
  });

  it('sends a family without invoice:readOwn from Purchases to Home and keeps it out of the nav', async () => {
    const api = fakeApi(access(['guardian'], ['student:readOwn']));
    const router = renderAt('/purchases?child=ada', api);
    expect(
      await screen.findByRole('heading', { name: 'Ada Okeke' })
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(
      screen.queryByRole('link', { name: 'Purchases' })
    ).not.toBeInTheDocument();
    expect(api.portal.purchases).not.toHaveBeenCalled();
  });

  it('sends a student on /children to Home', async () => {
    const ownSelf = portalMe({ kind: 'student', children: [ada] });
    const router = renderAt(
      '/children',
      fakeApi(access(['student'], ['student:readOwn']), ownSelf)
    );
    expect(
      await screen.findByRole('heading', { name: 'Ada Okeke' })
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(
      screen.queryByRole('link', { name: 'My children' })
    ).not.toBeInTheDocument();
  });

  it('shows staff the staff screen and never asks for portal data', async () => {
    const api = fakeApi(access(['administrator'], ['student:read']));
    renderAt('/', api);
    expect(
      await screen.findByText(
        'This portal is for students and guardians. Staff use web-admin.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(api.portal.me).not.toHaveBeenCalled();
    expect(api.portal.student).not.toHaveBeenCalled();
  });

  it('shows an owner the staff screen even though they hold student:readOwn', async () => {
    const api = fakeApi(access(['owner'], ['student:readOwn', 'student:read']));
    renderAt('/children', api);
    expect(
      await screen.findByText(/This portal is for students and guardians/)
    ).toBeInTheDocument();
    expect(api.portal.me).not.toHaveBeenCalled();
  });

  it('shows the staff screen to a portal role that lost student:readOwn', async () => {
    renderAt('/', fakeApi(access(['guardian'], [])));
    expect(
      await screen.findByText(/This portal is for students and guardians/)
    ).toBeInTheDocument();
  });

  it('opens Fees for the chosen child with invoice:readOwn', async () => {
    const api = fakeApi(
      access(['guardian'], ['student:readOwn', 'invoice:readOwn'])
    );
    const router = renderAt('/fees?child=tobi', api);
    expect(
      await screen.findByRole('heading', { name: 'Fees' })
    ).toBeInTheDocument();
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: 'tobi' },
      query: {},
    });
    expect(router.state.location.pathname).toBe('/fees');
  });

  it('switches child in place on Fees with the real switcher', async () => {
    const api = fakeApi(
      access(['guardian'], ['student:readOwn', 'invoice:readOwn'])
    );
    const base = portalStatement();
    api.portal.statement.mockImplementation(
      ({ params }: { params: { studentId: string } }) =>
        Promise.resolve({
          ...base,
          student: {
            ...base.student,
            id: params.studentId,
            name: `${params.studentId} Okeke`,
          },
        })
    );
    const router = renderAt('/fees?child=ada', api);
    await screen.findByText('ada Okeke');

    const group = screen.getByRole('group', { name: 'Viewing child' });
    fireEvent.click(within(group).getByRole('button', { name: 'Tobi' }));

    expect(await screen.findByText('tobi Okeke')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/fees');
    expect(router.state.location.search).toEqual({ child: 'tobi' });
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: 'tobi' },
      query: {},
    });
    expect(screen.getByRole('heading', { name: 'Fees' })).toBeInTheDocument();
  });

  it('falls back to the first child on Fees for an id that is not linked', async () => {
    const api = fakeApi(
      access(['guardian'], ['student:readOwn', 'invoice:readOwn'])
    );
    renderAt('/fees?child=another-family', api);
    await screen.findByRole('heading', { name: 'Fees' });
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: 'ada' },
      query: {},
    });
    expect(api.portal.statement).not.toHaveBeenCalledWith({
      params: { studentId: 'another-family' },
      query: {},
    });
  });

  it('sends Fees back to Home without invoice:readOwn and never asks for a statement', async () => {
    const api = fakeApi(access(['guardian'], ['student:readOwn']));
    const router = renderAt('/fees?child=ada', api);
    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe('/fees');
    });
    expect(api.portal.statement).not.toHaveBeenCalled();
  });

  it('lists Fees in the navigation only with invoice:readOwn', async () => {
    renderAt(
      '/?child=ada',
      fakeApi(access(['guardian'], ['student:readOwn', 'invoice:readOwn']))
    );
    await screen.findByRole('heading', { name: 'Ada Okeke' });
    expect(
      screen.getAllByRole('link', { name: 'Fees' }).length
    ).toBeGreaterThan(0);
  });
});

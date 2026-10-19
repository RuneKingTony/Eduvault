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
import { accessOfStarter, fakeAccess } from '@eduvault/auth-client/testing';
import type { MePermissions } from '@eduvault/api-contract';
import {
  ALL_PERMISSIONS,
  toPermissionMap,
  toPermissions,
  type Permission,
} from '@eduvault/policy';
import { stubMatchMedia } from '@eduvault/ui/testing';
import { ApiProvider } from './api';
import { NotFoundPage } from './components/portal-fallbacks';
import { routeTree } from './routeTree.gen';
import { checked } from './test-api';
import {
  ADA_ID,
  STRANGER_ID,
  TOBI_ID,
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

const guardianWithout = (...omitted: Permission[]): MePermissions => {
  const guardian = accessOfStarter('guardian', []);
  return {
    ...guardian,
    classScope: [],
    permissions: toPermissionMap(
      toPermissions(guardian.permissions).filter(
        (permission) => !omitted.includes(permission)
      )
    ),
  };
};

const guardianAccess = () => guardianWithout();
const guardianWithoutFees = () => guardianWithout('invoice:readOwn');

const TERM_ID = '00000000-0000-4000-8000-0000000c0001';

const ada = portalChild({ id: ADA_ID, firstName: 'Ada' });
const tobi = portalChild({ id: TOBI_ID, firstName: 'Tobi' });

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
        .mockResolvedValue(portalStudent({ id: ADA_ID, firstName: 'Ada' })),
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

function openAt(path: string, api: ReturnType<typeof fakeApi>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const checkedApi = checked(api);
  const router = createRouter({
    routeTree,
    context: { queryClient, api: checkedApi },
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultNotFoundComponent: NotFoundPage,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={checkedApi}>
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
    const router = openAt('/', fakeApi(guardianWithoutFees()));
    expect(
      await screen.findByRole('heading', { name: 'Hello, Ngozi' })
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/children');
  });

  it('keeps a guardian on Home when a child is chosen, and shows that child', async () => {
    const api = fakeApi(guardianWithoutFees());
    openAt(`/?child=${ADA_ID}`, api);
    expect(
      await screen.findByRole('heading', { name: 'Ada Okeke' })
    ).toBeInTheDocument();
    expect(api.portal.student).toHaveBeenCalledWith({
      params: { studentId: ADA_ID },
    });
  });

  it('falls back to the first child for an id that is not linked', async () => {
    const api = fakeApi(guardianWithoutFees());
    openAt(`/?child=${STRANGER_ID}`, api);
    await screen.findByRole('heading', { name: 'Ada Okeke' });
    expect(api.portal.student).not.toHaveBeenCalledWith({
      params: { studentId: STRANGER_ID },
    });
  });

  it('opens Home for a child from My children, carrying the child', async () => {
    const router = openAt('/children', fakeApi(guardianWithoutFees()));
    (await screen.findByRole('button', { name: /Tobi Okeke/ })).click();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(router.state.location.search).toEqual({ child: TOBI_ID });
  });

  it('asks My children for the family statement and each child’s statement with the term in the URL', async () => {
    const term = { id: TERM_ID, label: 'First term, 2026/2027' };
    const api = fakeApi(guardianAccess());
    api.portal.familyStatement.mockResolvedValue(
      portalFamilyStatement({ termOptions: [term] })
    );
    renderAt(`/children?term=${TERM_ID}`, api);

    expect(await screen.findByRole('combobox', { name: 'Term' })).toHaveValue(
      TERM_ID
    );
    expect(api.portal.familyStatement).toHaveBeenCalledWith({
      query: { termId: TERM_ID },
    });
    await waitFor(() => {
      expect(api.portal.statement).toHaveBeenCalledWith({
        params: { studentId: ADA_ID },
        query: { termId: TERM_ID },
      });
    });
  });

  it('keeps the child in the URL when a term is picked on My children', async () => {
    const api = fakeApi(guardianAccess());
    api.portal.familyStatement.mockResolvedValue(
      portalFamilyStatement({
        termOptions: [{ id: TERM_ID, label: 'First term, 2026/2027' }],
      })
    );
    const router = renderAt(`/children?child=${TOBI_ID}`, api);

    fireEvent.change(await screen.findByRole('combobox', { name: 'Term' }), {
      target: { value: TERM_ID },
    });

    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        child: TOBI_ID,
        term: TERM_ID,
      });
    });
    expect(router.state.location.pathname).toBe('/children');
  });

  it('opens the full announcements list for the chosen child and goes back to Home', async () => {
    const api = fakeApi(guardianWithoutFees());
    const router = openAt(`/announcements?child=${TOBI_ID}`, api);
    expect(
      await screen.findByRole('heading', { name: 'Announcements' })
    ).toBeInTheDocument();
    expect(api.portal.announcementList).toHaveBeenCalledWith({
      params: { studentId: TOBI_ID },
      query: { page: 1, pageSize: 10 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(router.state.location.search).toEqual({ child: TOBI_ID });
  });

  it('opens Purchases for the chosen child, last in the nav, carrying the child', async () => {
    const api = fakeApi(guardianAccess());
    const router = openAt(`/?child=${TOBI_ID}`, api);
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
    expect(router.state.location.search).toEqual({ child: TOBI_ID });
    expect(api.portal.purchases).toHaveBeenCalledWith({
      params: { studentId: TOBI_ID },
    });
    expect(api.portal.priceList).toHaveBeenCalledWith({
      params: { studentId: TOBI_ID },
    });
  });

  it('falls back to the first child on Purchases for an id that is not linked', async () => {
    const api = fakeApi(guardianAccess());
    openAt(`/purchases?child=${STRANGER_ID}`, api);
    await screen.findByRole('heading', { name: 'Purchases' });
    expect(api.portal.purchases).toHaveBeenCalledWith({
      params: { studentId: ADA_ID },
    });
    expect(api.portal.purchases).not.toHaveBeenCalledWith({
      params: { studentId: STRANGER_ID },
    });
  });

  it('sends a family without invoice:readOwn from Purchases to Home and keeps it out of the nav', async () => {
    const api = fakeApi(guardianWithoutFees());
    const router = openAt(`/purchases?child=${ADA_ID}`, api);
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
    const router = openAt(
      '/children',
      fakeApi(accessOfStarter('student', []), ownSelf)
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
    const api = fakeApi(accessOfStarter('administrator', []));
    openAt('/', api);
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
    const api = fakeApi(
      fakeAccess({
        roles: ['owner'],
        permissions: toPermissionMap(ALL_PERMISSIONS),
      })
    );
    openAt('/children', api);
    expect(
      await screen.findByText(/This portal is for students and guardians/)
    ).toBeInTheDocument();
    expect(api.portal.me).not.toHaveBeenCalled();
  });

  it('shows the staff screen to a portal role that lost student:readOwn', async () => {
    openAt(
      '/',
      fakeApi({ ...accessOfStarter('guardian', []), permissions: {} })
    );
    expect(
      await screen.findByText(/This portal is for students and guardians/)
    ).toBeInTheDocument();
  });

  it('opens Fees for the chosen child with invoice:readOwn', async () => {
    const api = fakeApi(guardianAccess());
    const router = openAt(`/fees?child=${TOBI_ID}`, api);
    expect(
      await screen.findByRole('heading', { name: 'Fees' })
    ).toBeInTheDocument();
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: TOBI_ID },
      query: {},
    });
    expect(router.state.location.pathname).toBe('/fees');
  });

  it('switches child in place on Fees with the real switcher', async () => {
    const api = fakeApi(guardianAccess());
    const base = portalStatement();
    const firstNames: Record<string, string> = {
      [ADA_ID]: 'Ada',
      [TOBI_ID]: 'Tobi',
    };
    api.portal.statement.mockImplementation(
      ({ params }: { params: { studentId: string } }) =>
        Promise.resolve({
          ...base,
          student: {
            ...base.student,
            id: params.studentId,
            name: `${firstNames[params.studentId]} Okeke`,
          },
        })
    );
    const router = openAt(`/fees?child=${ADA_ID}`, api);
    await screen.findByText('Ada Okeke');

    const group = screen.getByRole('group', { name: 'Viewing child' });
    fireEvent.click(within(group).getByRole('button', { name: 'Tobi' }));

    expect(await screen.findByText('Tobi Okeke')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/fees');
    expect(router.state.location.search).toEqual({ child: TOBI_ID });
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: TOBI_ID },
      query: {},
    });
    expect(screen.getByRole('heading', { name: 'Fees' })).toBeInTheDocument();
  });

  it('falls back to the first child on Fees for an id that is not linked', async () => {
    const api = fakeApi(guardianAccess());
    openAt(`/fees?child=${STRANGER_ID}`, api);
    await screen.findByRole('heading', { name: 'Fees' });
    expect(api.portal.statement).toHaveBeenCalledWith({
      params: { studentId: ADA_ID },
      query: {},
    });
    expect(api.portal.statement).not.toHaveBeenCalledWith({
      params: { studentId: STRANGER_ID },
      query: {},
    });
  });

  it('sends Fees back to Home without invoice:readOwn and never asks for a statement', async () => {
    const api = fakeApi(guardianWithoutFees());
    const router = openAt(`/fees?child=${ADA_ID}`, api);
    expect(
      await screen.findByRole('heading', { name: 'Ada Okeke' })
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(api.portal.statement).not.toHaveBeenCalled();
  });

  it('lists Fees in the navigation with invoice:readOwn', async () => {
    openAt(`/?child=${ADA_ID}`, fakeApi(guardianAccess()));
    await screen.findByRole('heading', { name: 'Ada Okeke' });
    expect(
      screen.getAllByRole('link', { name: 'Fees' }).length
    ).toBeGreaterThan(0);
  });

  it('leaves Fees out of the navigation without invoice:readOwn', async () => {
    openAt(`/?child=${ADA_ID}`, fakeApi(guardianWithoutFees()));
    await screen.findByRole('heading', { name: 'Ada Okeke' });
    expect(
      screen.getAllByRole('link', { name: 'Home' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('link', { name: 'Fees' })
    ).not.toBeInTheDocument();
  });
});

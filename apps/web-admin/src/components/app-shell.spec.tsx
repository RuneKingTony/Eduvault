import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';
import { toPermissionMap } from '@eduvault/policy';
import { ErrorMessage } from '@eduvault/ui';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import {
  act,
  cleanup,
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
import {
  ApiError,
  type ApprovalSummary,
  type CalendarCurrent,
  type MePermissions,
} from '@eduvault/api-contract';
import { stubMatchMedia } from '@eduvault/ui/testing';
import { requireGate } from '../access';
import { ApiProvider, type Api } from '../api';
import { DashboardPage } from '../pages/dashboard-page';
import { mePermissionsQueryOptions } from '../queries';
import { createQueryClient } from '../query-client';
import { approvalSummary } from '../test-approvals';
import { currentCalendar, noCalendar } from '../test-calendar';
import { fakeAccess, ownerAccess, starterAccess } from '../test-utils';
import { profile } from '../test-school';
import { AppShell } from './app-shell';
import { NotFoundPage } from './page-fallbacks';

const signOut = vi.fn().mockResolvedValue({ data: {}, error: null });

const authClient = {
  useSession: () => ({
    data: {
      session: { activeOrganizationId: 'o1' },
      user: { name: 'Funmi Adeyemi', email: 'funmi@school.test', image: null },
    },
  }),
  useListOrganizations: () => ({
    data: [
      { id: 'o1', name: 'Greenfield College' },
      { id: 'o2', name: 'Lakeside Academy' },
    ],
  }),
  useActiveMember: () => ({ data: { role: 'owner,member' } }),
  organization: {
    setActive: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
  signOut,
} as unknown as EduvaultAuthClient;

const page = (title: string) =>
  function Page() {
    return <h1>{title}</h1>;
  };

function Broken(): never {
  throw new Error('Page exploded');
}

interface RenderOptions {
  queryClient?: QueryClient;
  access?: MePermissions;
  realDashboard?: boolean;
  logoUrl?: string | null;
  calendar?: CalendarCurrent;
  requireGuardian?: boolean;
  summary?: ApprovalSummary;
}

async function renderAt(
  path: string,
  {
    queryClient = new QueryClient(),
    access = ownerAccess(),
    realDashboard = false,
    logoUrl = null,
    calendar = noCalendar(),
    requireGuardian = false,
    summary = approvalSummary(),
  }: RenderOptions = {}
) {
  let current = access;
  const permissions = vi.fn(() => Promise.resolve(current));
  const api = {
    me: { permissions },
    schoolAccount: { get: vi.fn().mockResolvedValue(profile({ logoUrl })) },
    calendar: { current: vi.fn().mockResolvedValue(calendar) },
    admissions: {
      preview: vi.fn().mockResolvedValue({ maxGuardians: 4, requireGuardian }),
    },
    approvals: { summary: vi.fn().mockResolvedValue(summary) },
  } as unknown as Api;
  const root = createRootRoute({
    component: AppShell,
    beforeLoad: async () => ({
      access: await queryClient.query(mePermissionsQueryOptions(api)),
    }),
  });
  const child = (to: string, component: () => React.ReactNode, gated = true) =>
    createRoute({
      getParentRoute: () => root,
      path: to,
      component,
      beforeLoad: ({ context }) => {
        if (gated) {
          requireGate(context.access, to);
        }
      },
    });
  const router = createRouter({
    routeTree: root.addChildren([
      child('/', realDashboard ? DashboardPage : page('Dashboard page')),
      child('/approvals', page('Approvals page')),
      child('/announcements', page('Announcements page')),
      child('/students', page('Students page')),
      child('/members', page('Members page')),
      child('/finance/accounts', page('Who owes page')),
      child('/finance/payments', page('Payments page')),
      child('/finance/adjustments', page('Discounts and refunds page')),
      child('/finance/school-fees', page('Fees page')),
      child('/finance/other-fees', page('Other fees page')),
      child('/finance/billing', page('Charge students page')),
      child('/finance/invoices', page('Charges page')),
      child('/calendar', page('Calendar page')),
      child('/campuses', page('Campuses page')),
      child('/roles', page('Roles page')),
      child('/roles/new', page('New role page')),
      child('/settings', page('Settings index page')),
      child('/settings/profile', page('Profile page')),
      child('/settings/approvals', page('Approval rules page')),
      child('/settings/danger', page('Danger page'), false),
      child('/broken', Broken),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: ({ error }) => <ErrorMessage error={error} />,
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
  await screen.findByRole('navigation', { name: 'Breadcrumb' });
  return {
    permissions,
    router,
    changeAccessTo: (next: MePermissions) => {
      current = next;
    },
  };
}

const sidebarNav = () =>
  document.querySelector<HTMLElement>('[data-slot="sidebar"]')!;

const sidebarState = () =>
  document.querySelector<HTMLElement>('[data-slot="sidebar"][data-state]')!;

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia({ '(max-width: 820px)': false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the grouped nav with the current item marked and Settings alone at the bottom', async () => {
    await renderAt('/finance/school-fees');
    const nav = within(sidebarNav());
    expect(nav.getByRole('button', { name: 'Finance' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(nav.getByRole('link', { name: 'Fees' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(nav.getByRole('link', { name: 'Students' })).not.toHaveAttribute(
      'aria-current'
    );
    expect(nav.getByRole('link', { name: 'Announcements' })).toHaveAttribute(
      'href',
      '/announcements'
    );
    const links = nav.getAllByRole('link').map((link) => link.textContent);
    expect(links.at(-1)).toBe('Settings');
  });

  it('marks Settings active on a settings page', async () => {
    await renderAt('/campuses');
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Settings' })
    ).toHaveAttribute('aria-current', 'page');
  });

  it('names Settings › the item in the breadcrumb on a settings page', async () => {
    await renderAt('/settings/profile');
    const trail = within(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    );
    expect(trail.getByText('Settings')).toBeInTheDocument();
    expect(trail.getByText('School profile')).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('names Settings › the item for a member who has no Settings link', async () => {
    await renderAt('/settings/danger', { access: starterAccess('bursar') });
    const trail = within(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    );
    expect(await trail.findByText('Danger zone')).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(trail.getByText('Settings')).toBeInTheDocument();
  });

  it('shows the school logo in the side nav crest when there is one', async () => {
    await renderAt('/', { logoUrl: '/files/abc' });
    const logo = await within(sidebarNav()).findByRole('img', {
      name: 'Greenfield College logo',
    });
    expect(logo).toHaveAttribute('src', expect.stringMatching(/\/files\/abc$/));
  });

  it('shows the school’s initials in the crest without a logo', async () => {
    await renderAt('/');
    expect(
      await within(sidebarNav()).findByRole('img', {
        name: 'Greenfield College crest',
      })
    ).toHaveTextContent('GC');
  });

  it('collapses a group and remembers it', async () => {
    await renderAt('/');
    const nav = within(sidebarNav());
    fireEvent.click(nav.getByRole('button', { name: 'People' }));
    expect(nav.getByRole('button', { name: 'People' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(
      nav.queryByRole('link', { name: 'Students' })
    ).not.toBeInTheDocument();
    expect(localStorage.getItem('eduvault.nav-groups')).toBe('["people"]');
  });

  it('names the group and the page in the breadcrumb', async () => {
    await renderAt('/students');
    const trail = within(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    );
    expect(trail.getByText('People')).toBeInTheDocument();
    expect(trail.getByText('Students')).toHaveAttribute('aria-current', 'page');
  });

  it('collapses to a rail with the toggle and Cmd+B, and remembers it', async () => {
    await renderAt('/');
    expect(sidebarState()).toHaveAttribute('data-state', 'expanded');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(sidebarState()).toHaveAttribute('data-state', 'collapsed');
    expect(localStorage.getItem('eduvault.sidebar')).toBe('collapsed');
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'b',
      metaKey: true,
    });
    expect(sidebarState()).toHaveAttribute('data-state', 'expanded');
  });

  it('leaves the saved rail alone when Cmd+B is pressed in the phone layout', async () => {
    stubMatchMedia({ '(max-width: 820px)': true });
    await renderAt('/');
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'b',
      metaKey: true,
    });
    expect(localStorage.getItem('eduvault.sidebar')).toBeNull();
  });

  it('starts as a rail when it was collapsed last time', async () => {
    localStorage.setItem('eduvault.sidebar', 'collapsed');
    await renderAt('/');
    expect(
      document.querySelector('[data-slot="sidebar"][data-state]')
    ).toHaveAttribute('data-state', 'collapsed');
  });

  it('shows the current term and year under the school name', async () => {
    await renderAt('/', { calendar: currentCalendar() });
    expect(
      await within(sidebarNav()).findByText('First term · 2026/2027')
    ).toBeInTheDocument();
  });

  it('shows no subtitle before the school has a school year', async () => {
    await renderAt('/');
    await waitFor(() => {
      expect(authClient.useListOrganizations).toBeDefined();
    });
    expect(within(sidebarNav()).queryByText(/·/)).not.toBeInTheDocument();
  });

  it('adds School years and terms to the school menu with session:read', async () => {
    await renderAt('/');
    fireEvent.keyDown(
      within(sidebarNav()).getByRole('button', { name: /Greenfield College/ }),
      { key: 'Enter' }
    );
    expect(
      await screen.findByRole('menuitem', { name: 'School years and terms' })
    ).toHaveAttribute('href', '/calendar');
  });

  it('leaves School years and terms out of the school menu without session:read', async () => {
    await renderAt('/', { access: starterAccess('teacher') });
    fireEvent.keyDown(
      within(sidebarNav()).getByRole('button', { name: /Greenfield College/ }),
      { key: 'Enter' }
    );
    await screen.findByRole('menuitem', { name: 'Lakeside Academy' });
    expect(
      screen.queryByRole('menuitem', { name: 'School years and terms' })
    ).not.toBeInTheDocument();
  });

  it('opens and closes the command menu with Cmd+K and finds pages', async () => {
    await renderAt('/');
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    const input = await screen.findByPlaceholderText(
      'Search pages and actions…'
    );
    fireEvent.change(input, { target: { value: 'campuses' } });
    expect(
      screen.getByRole('option', { name: /Campuses/ })
    ).toBeInTheDocument();
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      metaKey: true,
    });
    expect(
      screen.queryByPlaceholderText('Search pages and actions…')
    ).not.toBeInTheDocument();
  });

  it('opens the command menu from the search button', async () => {
    await renderAt('/');
    fireEvent.click(
      screen.getByRole('button', { name: 'Search pages and actions' })
    );
    expect(
      await screen.findByPlaceholderText('Search pages and actions…')
    ).toBeInTheDocument();
  });

  it('shows the not-found page inside the shell', async () => {
    await renderAt('/nowhere');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Dashboard' })
    ).toBeInTheDocument();
  });

  it('keeps the shell working after a page throws', async () => {
    await renderAt('/broken');
    expect(screen.getByRole('alert')).toHaveTextContent('Page exploded');
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Students' })
    ).toBeInTheDocument();
  });

  it('drops the previous school data from the cache when the school is switched', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['students'], [{ fullName: 'Ada Obi' }]);
    await renderAt('/students', { queryClient });
    fireEvent.keyDown(
      within(sidebarNav()).getByRole('button', { name: /Greenfield College/ }),
      { key: 'Enter' }
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Lakeside Academy' })
    );
    await waitFor(() => {
      expect(queryClient.getQueryData(['students'])).toBeUndefined();
    });
    expect(authClient.organization.setActive).toHaveBeenCalledWith({
      organizationId: 'o2',
    });
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
  });

  it('signs out from the user menu', async () => {
    await renderAt('/');
    fireEvent.keyDown(
      within(sidebarNav()).getByRole('button', { name: /Funmi Adeyemi/ }),
      { key: 'Enter' }
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});

const linkNames = () =>
  within(sidebarNav())
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('AppShell access', () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia({ '(max-width: 820px)': false });
  });

  afterEach(() => {
    focusManager.setFocused();
    vi.unstubAllGlobals();
  });

  it('sends the open page to the Dashboard when the window regains focus after access was revoked', async () => {
    const { changeAccessTo } = await renderAt('/students');
    changeAccessTo(fakeAccess());
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(linkNames()).toEqual(['Dashboard', 'Approvals']);
  });

  it('refetches the access after a 403 and sends the open page to the Dashboard', async () => {
    const queryClient = createQueryClient();
    const { changeAccessTo } = await renderAt('/students', { queryClient });
    changeAccessTo(fakeAccess());
    await queryClient
      .query({
        queryKey: ['students'],
        queryFn: () =>
          Promise.reject(
            new ApiError(403, {
              code: 'Forbidden',
              message: 'Missing permission student:read',
            })
          ),
      })
      .catch(() => undefined);
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(linkNames()).toEqual(['Dashboard', 'Approvals']);
  });

  it('reads the access of the school that was switched to, not the previous one', async () => {
    const { changeAccessTo, permissions } = await renderAt('/students');
    expect(linkNames()).toContain('Fees');
    changeAccessTo(starterAccess('bursar'));
    fireEvent.keyDown(
      within(sidebarNav()).getByRole('button', { name: /Greenfield College/ }),
      { key: 'Enter' }
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Lakeside Academy' })
    );
    await waitFor(() => {
      expect(linkNames()).toEqual([
        'Dashboard',
        'Approvals',
        'Students',
        'Fees',
        'Payments',
      ]);
    });
    expect(permissions).toHaveBeenCalledTimes(2);
  });

  it('shows an owner Students, Staff and members, Fees and a Settings entry that opens School profile', async () => {
    await renderAt('/');
    expect(linkNames()).toEqual([
      'Dashboard',
      'Approvals',
      'Announcements',
      'Students',
      'Staff and members',
      'Fees',
      'Payments',
      'Settings',
    ]);
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Settings' })
    ).toHaveAttribute('href', '/settings/profile');
  });

  it('opens Settings on the calendar for a session:read-only member', async () => {
    await renderAt('/', {
      access: fakeAccess({ permissions: { session: ['read'] } }),
    });
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Settings' })
    ).toHaveAttribute('href', '/calendar');
  });

  it('opens Settings on Roles for a member who can see roles but not campuses', async () => {
    await renderAt('/', {
      access: fakeAccess({ permissions: { ac: ['read'] } }),
    });
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Settings' })
    ).toHaveAttribute('href', '/roles');
  });

  it('marks Settings active on a role page', async () => {
    await renderAt('/roles/new');
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Settings' })
    ).toHaveAttribute('aria-current', 'page');
  });

  it('shows a bursar Students and Fees but no Staff and members or Settings', async () => {
    await renderAt('/', { access: starterAccess('bursar') });
    expect(linkNames()).toEqual([
      'Dashboard',
      'Approvals',
      'Students',
      'Fees',
      'Payments',
    ]);
  });

  it('shows a member with no roles only Dashboard and Approvals', async () => {
    await renderAt('/', { access: fakeAccess() });
    expect(linkNames()).toEqual(['Dashboard', 'Approvals']);
    expect(
      within(sidebarNav()).queryByRole('link', { name: 'Settings' })
    ).not.toBeInTheDocument();
  });

  it('shows Announcements to an administrator and hides it from a bursar', async () => {
    await renderAt('/', { access: starterAccess('administrator') });
    expect(linkNames()).toContain('Announcements');
  });

  it('sends a bursar who types /announcements to the Dashboard with no message', async () => {
    await renderAt('/announcements', { access: starterAccess('bursar') });
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('Announcements page')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(linkNames()).not.toContain('Announcements');
  });

  it('opens /announcements for a member with announcement:read', async () => {
    await renderAt('/announcements', {
      access: fakeAccess({ permissions: { announcement: ['read'] } }),
    });
    expect(await screen.findByText('Announcements page')).toBeInTheDocument();
    expect(linkNames()).toEqual(['Dashboard', 'Approvals', 'Announcements']);
  });

  it('sends a teacher who types a fees route to the Dashboard with no message', async () => {
    await renderAt('/finance/school-fees', {
      access: starterAccess('teacher'),
    });
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('Fees page')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(linkNames()).toEqual(['Dashboard', 'Approvals', 'Students']);
  });

  it('sends a teacher who types /finance/other-fees to the Dashboard too', async () => {
    await renderAt('/finance/other-fees', { access: starterAccess('teacher') });
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('Other fees page')).not.toBeInTheDocument();
  });

  it('keeps Fees active on Other fees', async () => {
    await renderAt('/finance/other-fees');
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Fees' })
    ).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the command menu to what the member can open', async () => {
    await renderAt('/', { access: starterAccess('teacher') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    const input = await screen.findByPlaceholderText(
      'Search pages and actions…'
    );
    fireEvent.change(input, { target: { value: 'fees' } });
    expect(
      screen.queryByRole('option', { name: /Fees/ })
    ).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'students' } });
    expect(
      screen.getByRole('option', { name: /Students/ })
    ).toBeInTheDocument();
  });

  it('offers Add a fee we charge with feeLine:create and hides it from an administrator', async () => {
    await renderAt('/', { access: starterAccess('bursar') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'add a fee' } }
    );
    expect(
      screen.getByRole('option', { name: /Add a fee we charge/ })
    ).toBeInTheDocument();
    cleanup();

    await renderAt('/', { access: starterAccess('administrator') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'add a fee' } }
    );
    expect(
      screen.queryByRole('option', { name: /Add a fee we charge/ })
    ).not.toBeInTheDocument();
  });

  it('offers Record a payment with payment:record and hides it from a reader', async () => {
    await renderAt('/', { access: starterAccess('bursar') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'record a payment' } }
    );
    expect(
      screen.getByRole('option', { name: /Record a payment/ })
    ).toBeInTheDocument();
    cleanup();

    await renderAt('/', { access: starterAccess('administrator') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'record a payment' } }
    );
    expect(
      screen.queryByRole('option', { name: /Record a payment/ })
    ).not.toBeInTheDocument();
  });

  it('offers See who owes fees with invoice:read and hides it from a teacher', async () => {
    await renderAt('/', { access: starterAccess('administrator') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'see who owes' } }
    );
    expect(
      screen.getByRole('option', { name: /See who owes fees/ })
    ).toBeInTheDocument();
    cleanup();

    await renderAt('/', { access: starterAccess('teacher') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'see who owes' } }
    );
    expect(
      screen.queryByRole('option', { name: /See who owes fees/ })
    ).not.toBeInTheDocument();
  });

  it('offers See who owes fees to a member who holds only payment:read', async () => {
    await renderAt('/', {
      access: fakeAccess({ permissions: { payment: ['read'] } }),
    });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'see who owes' } }
    );
    expect(
      screen.getByRole('option', { name: /See who owes fees/ })
    ).toBeInTheDocument();
  });

  it('offers Charge students with invoice:bill and hides it from a reader', async () => {
    await renderAt('/', { access: starterAccess('bursar') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'charge students' } }
    );
    expect(
      screen.getByRole('option', { name: /Charge students/ })
    ).toBeInTheDocument();
    cleanup();

    await renderAt('/', { access: starterAccess('administrator') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'charge students' } }
    );
    expect(
      screen.queryByRole('option', { name: /Charge students/ })
    ).not.toBeInTheDocument();
  });

  it('offers Add a staff member only with member:create and opens the add sheet route', async () => {
    await renderAt('/');
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    const input = await screen.findByPlaceholderText(
      'Search pages and actions…'
    );
    fireEvent.change(input, { target: { value: 'add a staff' } });
    expect(
      screen.getByRole('option', { name: /Add a staff member/ })
    ).toBeInTheDocument();
  });

  it('offers Admit a student with student:create and hides it from a bursar', async () => {
    await renderAt('/');
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    const input = await screen.findByPlaceholderText(
      'Search pages and actions…'
    );
    fireEvent.change(input, { target: { value: 'admit' } });
    expect(
      screen.getByRole('option', { name: /Admit a student/ })
    ).toBeInTheDocument();
    cleanup();

    await renderAt('/', { access: starterAccess('bursar') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'admit' } }
    );
    expect(
      screen.queryByRole('option', { name: /Admit a student/ })
    ).not.toBeInTheDocument();
  });

  it('hides Admit a student without guardian:link while a guardian is required', async () => {
    const access = fakeAccess({
      roles: ['custom'],
      permissions: toPermissionMap(['student:read', 'student:create']),
      campusScope: 'all',
    });
    await renderAt('/', { access, requireGuardian: true });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'admit' } }
    );
    expect(
      screen.queryByRole('option', { name: /Admit a student/ })
    ).not.toBeInTheDocument();
  });

  it('offers Create a custom role only with ac:create', async () => {
    await renderAt('/');
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    const input = await screen.findByPlaceholderText(
      'Search pages and actions…'
    );
    fireEvent.change(input, { target: { value: 'custom role' } });
    expect(
      screen.getByRole('option', { name: /Create a custom role/ })
    ).toBeInTheDocument();
  });

  it('lets an administrator find Roles and permissions but not create a role', async () => {
    await renderAt('/', { access: starterAccess('administrator') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    const input = await screen.findByPlaceholderText(
      'Search pages and actions…'
    );
    fireEvent.change(input, { target: { value: 'roles' } });
    expect(
      screen.getByRole('option', { name: /Roles and permissions/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Create a custom role/ })
    ).not.toBeInTheDocument();
  });

  it('hides the Add a staff member action from an administrator', async () => {
    await renderAt('/', { access: starterAccess('administrator') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    const input = await screen.findByPlaceholderText(
      'Search pages and actions…'
    );
    fireEvent.change(input, { target: { value: 'staff' } });
    expect(
      screen.queryByRole('option', { name: /Add a staff member/ })
    ).not.toBeInTheDocument();
  });

  it('shows the no-roles Dashboard and opens My access from it', async () => {
    await renderAt('/', { access: fakeAccess(), realDashboard: true });
    expect(
      await screen.findByRole('heading', { name: 'Welcome, Funmi' })
    ).toBeInTheDocument();
    expect(screen.getByText('No access yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See my access' }));
    expect(
      await screen.findByText('Nothing yet. Ask the owner to give you a role.')
    ).toBeInTheDocument();
  });

  it('tells a member whose role grants nothing that the role is the limit', async () => {
    await renderAt('/', {
      access: fakeAccess({ roles: ['student'] }),
      realDashboard: true,
    });
    expect(await screen.findByText('No access yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Your role doesn’t give you anything to see yet/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/until the owner gives you a role/)).toBeNull();
  });

  it('opens My access from the user menu', async () => {
    await renderAt('/', { access: starterAccess('administrator') });
    fireEvent.keyDown(
      within(sidebarNav()).getByRole('button', { name: /Funmi Adeyemi/ }),
      { key: 'Enter' }
    );
    expect(screen.queryByText('Member, no roles')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'My access' }));
    expect(
      await screen.findByText('What you can do in Greenfield College, and why.')
    ).toBeInTheDocument();
    expect(screen.getByText('Every campus')).toBeInTheDocument();
  });

  it('reads the user menu role label from the permissions', async () => {
    await renderAt('/', { access: fakeAccess() });
    expect(
      within(sidebarNav()).getByRole('button', {
        name: /Funmi Adeyemi.*Member, no roles/,
      })
    ).toBeInTheDocument();
  });

  it('offers Discount or refund with adjustment:create and hides it from a principal', async () => {
    await renderAt('/', { access: starterAccess('bursar') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'discount or refund' } }
    );
    expect(
      screen.getByRole('option', { name: /Discount or refund/ })
    ).toBeInTheDocument();
    cleanup();

    await renderAt('/', { access: starterAccess('principal') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'discount or refund' } }
    );
    expect(
      screen.queryByRole('option', { name: /Discount or refund/ })
    ).not.toBeInTheDocument();
  });

  it('opens Charge students from the palette on its page with the prepare sheet flag', async () => {
    const { router } = await renderAt('/', { access: starterAccess('bursar') });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'charge students' } }
    );
    fireEvent.click(screen.getByRole('option', { name: /Charge students/ }));
    expect(await screen.findByText('Charge students page')).toBeVisible();
    expect(router.state.location.pathname).toBe('/finance/billing');
    expect(router.state.location.search).toEqual({ prepare: 1 });
  });

  it('opens Record a payment from the palette on Payments with the record flag', async () => {
    const { router } = await renderAt('/finance/accounts', {
      access: starterAccess('bursar'),
    });
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'record a payment' } }
    );
    fireEvent.click(screen.getByRole('option', { name: /Record a payment/ }));
    expect(await screen.findByText('Payments page')).toBeVisible();
    expect(router.state.location.pathname).toBe('/finance/payments');
    expect(router.state.location.search).toEqual({ record: 1 });
  });

  it('opens a page entry from the palette', async () => {
    const { router } = await renderAt('/');
    fireEvent.keyDown(globalThis as unknown as Window, {
      key: 'k',
      ctrlKey: true,
    });
    fireEvent.change(
      await screen.findByPlaceholderText('Search pages and actions…'),
      { target: { value: 'students' } }
    );
    fireEvent.click(screen.getByRole('option', { name: /Students/ }));
    expect(await screen.findByText('Students page')).toBeVisible();
    expect(router.state.location.search).toEqual({});
  });

  it('shows the approvals bell with its count on every page, and the counts on Approvals and Payments', async () => {
    await renderAt('/finance/payments', { access: starterAccess('principal') });
    const bell = await screen.findByRole('button', { name: 'Approvals' });
    expect(await within(bell).findByText('2')).toBeVisible();
    const nav = within(sidebarNav());
    expect(await nav.findAllByLabelText('2 waiting for you')).toHaveLength(2);
  });

  it('lists Approval rules in the settings frame after Admissions rules', async () => {
    await renderAt('/settings/approvals', {
      access: starterAccess('administrator'),
    });
    expect(await screen.findByText('Approval rules page')).toBeVisible();
  });
});

describe('AppShell on a phone', () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia({ '(max-width: 820px)': true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the sidebar in a left sheet and closes it when a link is chosen', async () => {
    await renderAt('/');
    expect(
      screen.queryByRole('link', { name: 'Students' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('link', { name: 'Students' }));
    await act(() => Promise.resolve());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('drops the group from the breadcrumb and has no rail toggle', async () => {
    await renderAt('/students');
    const trail = within(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    );
    expect(trail.queryByText('People')).not.toBeInTheDocument();
    expect(trail.getByText('Students')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Toggle sidebar' })
    ).not.toBeInTheDocument();
  });
});

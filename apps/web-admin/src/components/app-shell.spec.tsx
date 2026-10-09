import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import {
  act,
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
import { stubMatchMedia } from '@eduvault/ui/testing';
import { requireGate } from '../access';
import { DashboardPage } from '../pages/dashboard-page';
import { fakeAccess, ownerAccess, starterAccess } from '../test-utils';
import { ErrorMessage } from './error-message';
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
}

async function renderAt(
  path: string,
  {
    queryClient = new QueryClient(),
    access = ownerAccess(),
    realDashboard = false,
  }: RenderOptions = {}
) {
  const root = createRootRoute({
    component: AppShell,
    beforeLoad: () => ({ access }),
  });
  const child = (to: string, component: () => React.ReactNode) =>
    createRoute({
      getParentRoute: () => root,
      path: to,
      component,
      beforeLoad: () => {
        requireGate(access, to);
      },
    });
  const router = createRouter({
    routeTree: root.addChildren([
      child('/', realDashboard ? DashboardPage : page('Dashboard page')),
      child('/approvals', page('Approvals page')),
      child('/students', page('Students page')),
      child('/fees', page('Fees page')),
      child('/campuses', page('Campuses page')),
      child('/broken', Broken),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: ({ error }) => <ErrorMessage error={error} />,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthClientProvider authClient={authClient}>
        <RouterProvider router={router} />
      </AuthClientProvider>
    </QueryClientProvider>
  );
  await screen.findByRole('navigation', { name: 'Breadcrumb' });
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
    await renderAt('/fees');
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
    expect(
      nav.queryByRole('link', { name: 'Announcements' })
    ).not.toBeInTheDocument();
    const links = nav.getAllByRole('link').map((link) => link.textContent);
    expect(links.at(-1)).toBe('Settings');
  });

  it('marks Settings active on a settings page', async () => {
    await renderAt('/campuses');
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Settings' })
    ).toHaveAttribute('aria-current', 'page');
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
    vi.unstubAllGlobals();
  });

  it('shows an owner Students, Fees and a Settings entry that opens Campuses', async () => {
    await renderAt('/');
    expect(linkNames()).toEqual([
      'Dashboard',
      'Approvals',
      'Students',
      'Fees',
      'Settings',
    ]);
    expect(
      within(sidebarNav()).getByRole('link', { name: 'Settings' })
    ).toHaveAttribute('href', '/campuses');
  });

  it('shows a bursar Students but no Fees or Settings', async () => {
    await renderAt('/', { access: starterAccess('bursar') });
    expect(linkNames()).toEqual(['Dashboard', 'Approvals', 'Students']);
  });

  it('shows a member with no roles only Dashboard and Approvals', async () => {
    await renderAt('/', { access: fakeAccess() });
    expect(linkNames()).toEqual(['Dashboard', 'Approvals']);
    expect(
      within(sidebarNav()).queryByRole('link', { name: 'Settings' })
    ).not.toBeInTheDocument();
  });

  it('sends a teacher who types /fees to the Dashboard with no message', async () => {
    await renderAt('/fees', { access: starterAccess('teacher') });
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('Fees page')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(linkNames()).toEqual(['Dashboard', 'Approvals', 'Students']);
  });

  it('keeps the command menu to what the member can open', async () => {
    await renderAt('/', { access: starterAccess('bursar') });
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

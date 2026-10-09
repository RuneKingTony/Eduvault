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
import { stubMatchMedia } from '@eduvault/ui/testing';
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

async function renderAt(path: string, queryClient = new QueryClient()) {
  const root = createRootRoute({ component: AppShell });
  const child = (to: string, component: () => React.ReactNode) =>
    createRoute({ getParentRoute: () => root, path: to, component });
  const router = createRouter({
    routeTree: root.addChildren([
      child('/', page('Dashboard page')),
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
      nav.queryByRole('link', { name: 'Approvals' })
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
    await renderAt('/students', queryClient);
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorMessage } from '@eduvault/ui';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
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
import { stubMatchMedia } from '@eduvault/ui/testing';
import { NotFoundPage } from './portal-fallbacks';
import { PortalShell } from './portal-shell';
import { toPermissionMap } from '@eduvault/policy';
import type { MePermissions, PortalMe } from '@eduvault/api-contract';
import { portalChild, portalMe } from '../test-utils';

const signOut = vi.fn().mockResolvedValue({ data: {}, error: null });
const setActive = vi.fn().mockResolvedValue({ data: {}, error: null });

const schools = [{ id: 'o1', name: 'Greenfield College' }];

const makeClient = (
  user: { email: string; username?: string },
  organizations = schools
) =>
  ({
    useSession: () => ({
      data: {
        session: { activeOrganizationId: 'o1' },
        user: { name: 'Ngozi Okeke', image: null, ...user },
      },
    }),
    useListOrganizations: () => ({ data: organizations }),
    useActiveMember: () => ({ data: { role: 'member' } }),
    organization: { setActive },
    signOut,
  }) as unknown as EduvaultAuthClient;

const access = {
  permissions: toPermissionMap(['student:readOwn']),
} as Pick<MePermissions, 'permissions'>;

const ada = portalChild({ id: 'ada', firstName: 'Ada' });
const tobi = portalChild({
  id: 'tobi',
  firstName: 'Tobi',
  campusName: 'Ikeja',
});
const guardian = portalMe({ children: [ada, tobi] });
const student = portalMe({ kind: 'student', children: [ada] });

const page = (title: string) =>
  function Page() {
    return <h1>{title}</h1>;
  };

function Broken(): never {
  throw new Error('Page exploded');
}

interface RenderOptions {
  me?: PortalMe;
  authClient?: EduvaultAuthClient;
  held?: Pick<MePermissions, 'permissions'>;
}

async function renderAt(path: string, options: RenderOptions = {}) {
  const {
    me = guardian,
    authClient = makeClient({ email: 'ngozi@mail.test' }),
    held = access,
  } = options;
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>) =>
      typeof search['child'] === 'string' ? { child: search['child'] } : {},
    component: () => <PortalShell me={me} access={held} />,
  });
  const child = (to: string, component: () => React.ReactNode) =>
    createRoute({ getParentRoute: () => root, path: to, component });
  const router = createRouter({
    routeTree: root.addChildren([
      child('/', page('Home page')),
      child('/children', page('Children page')),
      child('/broken', Broken),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: ({ error }) => <ErrorMessage error={error} />,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthClientProvider authClient={authClient}>
        <RouterProvider router={router} />
      </AuthClientProvider>
    </QueryClientProvider>
  );
  await screen.findByRole('banner');
  return router;
}

describe('PortalShell on a desktop', () => {
  beforeEach(() => {
    stubMatchMedia({ '(max-width: 820px)': false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setActive.mockClear();
    signOut.mockClear();
  });

  it('shows the school name from the portal profile and the guardian nav with the current item marked', async () => {
    await renderAt('/children');
    expect(
      within(screen.getByRole('banner')).getByText('Greenfield College')
    ).toBeInTheDocument();
    const nav = within(screen.getByRole('navigation', { name: 'Portal' }));
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'My children',
      'Home',
    ]);
    expect(nav.getByRole('link', { name: 'My children' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('shows a student Home only', async () => {
    await renderAt('/', { me: student });
    const nav = within(screen.getByRole('navigation', { name: 'Portal' }));
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Home',
    ]);
    expect(screen.queryByRole('group', { name: 'Viewing child' })).toBeNull();
  });

  it('hides every nav item from a user without student:readOwn', async () => {
    await renderAt('/', { held: { permissions: {} } });
    const nav = within(screen.getByRole('navigation', { name: 'Portal' }));
    expect(nav.queryAllByRole('link')).toHaveLength(0);
  });

  it('carries the selected child on the nav links', async () => {
    await renderAt('/', { me: guardian });
    const nav = within(screen.getByRole('navigation', { name: 'Portal' }));
    expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/?child=ada'
    );
    expect(nav.getByRole('link', { name: 'My children' })).toHaveAttribute(
      'href',
      '/children?child=ada'
    );
  });

  it('puts the switcher in the top bar and switches child on the current page', async () => {
    const router = await renderAt('/children?child=ada');
    const bar = within(screen.getByRole('banner'));
    const group = bar.getByRole('group', { name: 'Viewing child' });
    expect(within(group).getByRole('button', { name: 'Ada' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(within(group).getByRole('button', { name: 'Tobi' }));
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ child: 'tobi' });
    });
    expect(router.state.location.pathname).toBe('/children');
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Tobi' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back to the first child for an unlinked id', async () => {
    await renderAt('/?child=someone-else');
    expect(screen.getByRole('button', { name: 'Ada' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('has no breadcrumb, search button or command menu', async () => {
    await renderAt('/');
    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Search/ })
    ).not.toBeInTheDocument();
  });

  it('does nothing on Cmd+K or Ctrl+K', async () => {
    await renderAt('/');
    for (const init of [{ metaKey: true }, { ctrlKey: true }]) {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        cancelable: true,
        ...init,
      });
      globalThis.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Search pages/)
    ).not.toBeInTheDocument();
  });

  it('offers light or dark and sign out, but no command menu', async () => {
    await renderAt('/');
    fireEvent.keyDown(
      within(screen.getByRole('banner')).getByRole('button', {
        name: /Ngozi Okeke/,
      }),
      { key: 'Enter' }
    );
    expect(
      await screen.findByRole('menuitem', { name: 'Light or dark' })
    ).toBeInTheDocument();
    expect(screen.getByText('ngozi@mail.test')).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Command menu/ })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('shows the username in the menu header for a login without a real email', async () => {
    await renderAt('/', {
      authClient: makeClient({
        email: 'x1@users.eduvault.invalid',
        username: 'okeke-family',
      }),
    });
    fireEvent.keyDown(
      within(screen.getByRole('banner')).getByRole('button', {
        name: /Ngozi Okeke/,
      }),
      { key: 'Enter' }
    );
    expect(await screen.findByText('okeke-family')).toBeInTheDocument();
  });

  it('lists the schools when there is more than one and switches back to the default page', async () => {
    const router = await renderAt('/children?child=tobi', {
      authClient: makeClient({ email: 'ngozi@mail.test' }, [
        ...schools,
        { id: 'o2', name: 'Hillcrest Academy' },
      ]),
    });
    fireEvent.keyDown(
      within(screen.getByRole('banner')).getByRole('button', {
        name: /Ngozi Okeke/,
      }),
      { key: 'Enter' }
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Hillcrest Academy' })
    );
    await waitFor(() => {
      expect(setActive).toHaveBeenCalledWith({ organizationId: 'o2' });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(router.state.location.search).toEqual({});
  });

  it('shows no school section with one school', async () => {
    await renderAt('/');
    fireEvent.keyDown(
      within(screen.getByRole('banner')).getByRole('button', {
        name: /Ngozi Okeke/,
      }),
      { key: 'Enter' }
    );
    await screen.findByRole('menuitem', { name: 'Sign out' });
    expect(screen.queryByText('School')).not.toBeInTheDocument();
  });

  it('shows the not-found page inside the shell', async () => {
    await renderAt('/nowhere');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('keeps the shell working after a page throws', async () => {
    await renderAt('/broken');
    expect(screen.getByRole('alert')).toHaveTextContent('Page exploded');
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });
});

describe('PortalShell on a phone', () => {
  beforeEach(() => {
    stubMatchMedia({ '(max-width: 820px)': true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('swaps the top nav for a fixed bottom nav with the short label', async () => {
    await renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Portal' });
    expect(nav).toHaveClass('fixed', 'bottom-0');
    expect(screen.getAllByRole('navigation', { name: 'Portal' })).toHaveLength(
      1
    );
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).getByRole('link', { name: 'Children' })).toBeVisible();
  });

  it('puts the switcher above the content, not in the top bar', async () => {
    await renderAt('/');
    expect(
      within(screen.getByRole('banner')).queryByRole('group', {
        name: 'Viewing child',
      })
    ).toBeNull();
    expect(
      within(screen.getByRole('main')).getByRole('group', {
        name: 'Viewing child',
      })
    ).toBeInTheDocument();
  });

  it('hides the switcher on My children', async () => {
    await renderAt('/children');
    expect(
      screen.queryByRole('group', { name: 'Viewing child' })
    ).not.toBeInTheDocument();
  });

  it('keeps clear of the bottom nav', async () => {
    await renderAt('/');
    expect(screen.getByRole('main')).toHaveClass('pb-24');
  });
});

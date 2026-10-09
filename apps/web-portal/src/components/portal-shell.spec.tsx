import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  AuthClientProvider,
  type EduvaultAuthClient,
} from '@eduvault/auth-client';
import { stubMatchMedia } from '@eduvault/ui/testing';
import { ErrorMessage } from './error-message';
import { NotFoundPage } from './portal-fallbacks';
import { PortalShell } from './portal-shell';

const signOut = vi.fn().mockResolvedValue({ data: {}, error: null });

const authClient = {
  useSession: () => ({
    data: {
      session: { activeOrganizationId: 'o1' },
      user: { name: 'Ngozi Okeke', email: 'ngozi@mail.test', image: null },
    },
  }),
  useListOrganizations: () => ({
    data: [{ id: 'o1', name: 'Greenfield College' }],
  }),
  useActiveMember: () => ({ data: { role: 'member' } }),
  signOut,
} as unknown as EduvaultAuthClient;

const page = (title: string) =>
  function Page() {
    return <h1>{title}</h1>;
  };

function Broken(): never {
  throw new Error('Page exploded');
}

async function renderAt(path: string) {
  const root = createRootRoute({ component: PortalShell });
  const child = (to: string, component: () => React.ReactNode) =>
    createRoute({ getParentRoute: () => root, path: to, component });
  const router = createRouter({
    routeTree: root.addChildren([
      child('/', page('Home page')),
      child('/fees', page('Fees page')),
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
}

describe('PortalShell on a desktop', () => {
  beforeEach(() => {
    stubMatchMedia({ '(max-width: 820px)': false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the school and the portal nav with the current item marked', async () => {
    await renderAt('/fees');
    expect(
      within(screen.getByRole('banner')).getByText('Greenfield College')
    ).toBeInTheDocument();
    const nav = within(screen.getByRole('navigation', { name: 'Portal' }));
    expect(nav.getByRole('link', { name: 'Fees' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current'
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

  it('shows the not-found page inside the shell', async () => {
    await renderAt('/nowhere');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('keeps the shell working after a page throws', async () => {
    await renderAt('/broken');
    expect(screen.getByRole('alert')).toHaveTextContent('Page exploded');
    expect(screen.getByRole('link', { name: 'Fees' })).toBeInTheDocument();
  });
});

describe('PortalShell on a phone', () => {
  beforeEach(() => {
    stubMatchMedia({ '(max-width: 820px)': true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('swaps the top nav for a fixed bottom nav', async () => {
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
  });

  it('keeps clear of the bottom nav', async () => {
    await renderAt('/');
    expect(screen.getByRole('main')).toHaveClass('pb-24');
  });
});

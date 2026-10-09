import { fireEvent, screen, waitFor } from '@testing-library/react';
import { PermissionsProvider } from './permissions';
import { accessOfStarter, fakeAccess } from './access-test-utils';
import { UserMenu } from './user-menu';
import { fakeClient, openMenu, renderInSidebar } from './menu-test-utils';

function setup(
  options: {
    role?: string;
    access?: ReturnType<typeof fakeAccess> | null;
    onOpenCommandMenu?: () => void;
    onOpenMyAccess?: () => void;
    signOutResult?: { error: unknown };
  } = {}
) {
  const signOut = vi
    .fn()
    .mockResolvedValue(options.signOutResult ?? { data: {}, error: null });
  const onSignedOut = vi.fn();
  const authClient = fakeClient({
    useSession: () => ({
      data: {
        user: {
          name: 'Funmi Adeyemi',
          email: 'funmi@school.test',
          image: null,
        },
      },
    }),
    useActiveMember: () => ({ data: { role: options.role ?? 'owner,member' } }),
    signOut,
  });
  const menu = (
    <UserMenu
      authClient={authClient}
      onOpenCommandMenu={options.onOpenCommandMenu}
      onOpenMyAccess={options.onOpenMyAccess}
      onSignedOut={onSignedOut}
      renderTrigger={(user) => (
        <button type="button">
          {user.name} {user.roles}
        </button>
      )}
    />
  );
  const access =
    options.access === undefined
      ? accessOfStarter('administrator')
      : options.access;
  renderInSidebar(
    access === null ? (
      menu
    ) : (
      <PermissionsProvider value={access}>{menu}</PermissionsProvider>
    )
  );
  return { signOut, onSignedOut };
}

describe('UserMenu', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  it('gives the trigger the name and the role labels from the permissions', () => {
    setup({ access: fakeAccess({ roles: ['owner', 'member', 'bursar'] }) });
    expect(
      screen.getByRole('button', { name: 'Funmi Adeyemi Owner, Bursar' })
    ).toBeInTheDocument();
  });

  it('says "Member, no roles" for a member holding only member', () => {
    setup({ access: fakeAccess() });
    expect(
      screen.getByRole('button', { name: 'Funmi Adeyemi Member, no roles' })
    ).toBeInTheDocument();
  });

  it('falls back to the active member outside a permissions provider', () => {
    setup({ access: null, role: 'student,member' });
    expect(
      screen.getByRole('button', { name: 'Funmi Adeyemi Student' })
    ).toBeInTheDocument();
  });

  it('shows the name and email, light or dark and sign out', () => {
    setup();
    openMenu(/Funmi Adeyemi/);
    expect(screen.getByText('funmi@school.test')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Light or dark' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Sign out' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Command menu/ })
    ).not.toBeInTheDocument();
  });

  it('opens My access when the shell has one', () => {
    const onOpenMyAccess = vi.fn();
    setup({ onOpenMyAccess });
    openMenu(/Funmi Adeyemi/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'My access' }));
    expect(onOpenMyAccess).toHaveBeenCalledOnce();
  });

  it('hides My access when the shell has none', () => {
    setup();
    openMenu(/Funmi Adeyemi/);
    expect(
      screen.queryByRole('menuitem', { name: 'My access' })
    ).not.toBeInTheDocument();
  });

  it('opens the command menu when the shell has one', () => {
    const onOpenCommandMenu = vi.fn();
    setup({ onOpenCommandMenu });
    openMenu(/Funmi Adeyemi/);
    fireEvent.click(screen.getByRole('menuitem', { name: /Command menu/ }));
    expect(onOpenCommandMenu).toHaveBeenCalledOnce();
  });

  it('switches between light and dark and remembers it', () => {
    setup();
    openMenu(/Funmi Adeyemi/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Light or dark' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('eduvault-theme')).toBe('dark');
  });

  it('signs out and tells the app', async () => {
    const { signOut, onSignedOut } = setup();
    openMenu(/Funmi Adeyemi/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledOnce();
    });
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('keeps the app signed in when sign out fails', async () => {
    const { signOut, onSignedOut } = setup({
      signOutResult: { error: { message: 'No' } },
    });
    openMenu(/Funmi Adeyemi/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});

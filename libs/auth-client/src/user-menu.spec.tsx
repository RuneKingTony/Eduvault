import { fireEvent, screen, waitFor } from '@testing-library/react';
import { UserMenu } from './user-menu';
import { fakeClient, openMenu, renderInSidebar } from './menu-test-utils';

function setup(
  options: {
    role?: string;
    onOpenCommandMenu?: () => void;
    showMyAccess?: boolean;
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
  renderInSidebar(
    <UserMenu
      authClient={authClient}
      onOpenCommandMenu={options.onOpenCommandMenu}
      showMyAccess={options.showMyAccess}
      onSignedOut={onSignedOut}
      renderTrigger={(user) => (
        <button type="button">
          {user.name} {user.roles}
        </button>
      )}
    />
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

  it('gives the trigger the name and the membership role labels', () => {
    setup();
    expect(
      screen.getByRole('button', { name: 'Funmi Adeyemi Owner' })
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

  it('shows a disabled My access item for staff', () => {
    setup({ showMyAccess: true });
    openMenu(/Funmi Adeyemi/);
    expect(screen.getByRole('menuitem', { name: 'My access' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
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

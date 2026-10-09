import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EduvaultAuthClient } from '@eduvault/auth-client';
import { ApiError, type Me } from '@eduvault/api-contract';
import { ApiProvider, type Api } from './api';
import { App } from './app';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  RouterProvider: () => <p>The router is showing</p>,
}));

const me = (overrides: Partial<Me> = {}): Me => ({
  user: { id: 'u1', email: 'ada@school.test', name: 'Ada' },
  activeOrganizationId: 'o1',
  activeCampusId: null,
  mustChangePassword: false,
  platformRole: null,
  schoolCount: 1,
  ...overrides,
});

const signedIn = {
  data: { session: { activeOrganizationId: 'o1' } },
  isPending: false,
};

const clientWith = (
  session: { data: unknown; isPending: boolean },
  signOut = vi.fn().mockResolvedValue({ data: {}, error: null })
): EduvaultAuthClient =>
  ({
    useSession: () => session,
    useListOrganizations: () => ({ data: [] }),
    signOut,
  }) as unknown as EduvaultAuthClient;

const renderApp = (authClient: EduvaultAuthClient, api: Partial<Api> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider api={api as Api}>
        <App authClient={authClient} />
      </ApiProvider>
    </QueryClientProvider>
  );

const apiWith = (...answers: Me[]) => {
  const get = vi.fn();
  for (const answer of answers) {
    get.mockResolvedValueOnce(answer);
  }
  const setPassword = vi.fn().mockResolvedValue(undefined);
  return {
    api: { me: { get, setPassword } } as unknown as Api,
    get,
    setPassword,
  };
};

describe('App', () => {
  it('shows the staff sign-in form without a session', () => {
    renderApp(clientWith({ data: null, isPending: false }));
    expect(
      screen.getByRole('heading', { name: 'Welcome back' })
    ).toBeInTheDocument();
    expect(screen.getByText('Staff sign-in')).toBeInTheDocument();
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
  });

  it('holds a flagged user on the password screen and nowhere else', async () => {
    const { api } = apiWith(me({ mustChangePassword: true }));
    renderApp(clientWith(signedIn), api);
    expect(
      await screen.findByRole('heading', { name: 'Choose your own password' })
    ).toBeInTheDocument();
    expect(screen.queryByText('The router is showing')).not.toBeInTheDocument();
  });

  it('saves the new password and carries on to the app', async () => {
    const { api, setPassword, get } = apiWith(
      me({ mustChangePassword: true }),
      me()
    );
    renderApp(clientWith(signedIn), api);
    await screen.findByRole('heading', { name: 'Choose your own password' });

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'long-enough-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'long-enough-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(
      await screen.findByText('The router is showing')
    ).toBeInTheDocument();
    expect(setPassword).toHaveBeenCalledWith({
      body: { newPassword: 'long-enough-password' },
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('carries on when the password was already set elsewhere', async () => {
    const { api, setPassword } = apiWith(
      me({ mustChangePassword: true }),
      me()
    );
    setPassword.mockRejectedValue(
      new ApiError(409, {
        code: 'PasswordAlreadySet',
        message: 'Your password is already set',
      })
    );
    renderApp(clientWith(signedIn), api);
    await screen.findByRole('heading', { name: 'Choose your own password' });

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'long-enough-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'long-enough-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(
      await screen.findByText('The router is showing')
    ).toBeInTheDocument();
  });

  it('sends a super admin to the console, not the no-school screen', async () => {
    const { api } = apiWith(me({ platformRole: 'superadmin', schoolCount: 0 }));
    renderApp(
      clientWith({
        data: { session: { activeOrganizationId: null } },
        isPending: false,
      }),
      api
    );
    expect(
      await screen.findByText('The router is showing')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('You’re not in a school yet')
    ).not.toBeInTheDocument();
  });

  it('tells a user without a school that no school has added them', async () => {
    const signOut = vi.fn().mockResolvedValue({ data: {}, error: null });
    const { api } = apiWith(me({ schoolCount: 0, activeOrganizationId: null }));
    renderApp(
      clientWith(
        {
          data: { session: { activeOrganizationId: null } },
          isPending: false,
        },
        signOut
      ),
      api
    );
    expect(
      await screen.findByText('You’re not in a school yet')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Create your school' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
  });

  it('opens the app for a member of a school', async () => {
    const { api } = apiWith(me());
    renderApp(clientWith(signedIn), api);
    expect(
      await screen.findByText('The router is showing')
    ).toBeInTheDocument();
  });

  it('shows sign-in, not an error, once the session is gone', () => {
    const get = vi
      .fn()
      .mockRejectedValue(new Error('Authentication is required'));
    const api = { me: { get } } as unknown as Api;
    renderApp(clientWith({ data: null, isPending: false }), api);
    expect(
      screen.getByRole('heading', { name: /Welcome back|Sign in/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
